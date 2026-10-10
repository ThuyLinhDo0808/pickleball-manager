// What each club staff role may do, by API route. The club owner and co-admins (Admin)
// do everything; Finance and Operations get only what is listed here — anything not
// listed is refused (default deny). Checked in services/clubAccess.js, which every club
// route goes through, so a new route stays closed to these roles until added here.
//
// FINANCE   — finance overview, income/expenses, membership plans, confirm payments,
//             debts, revenue, profit, reports, Excel. Not: club settings, staff,
//             deleting members, creating/editing activities, match results, rankings.
// OPERATOR  — members (list, basic info), attendance, check-in/out; calendar, open /
//             close activities, participants; matches (create, players, scores, finish);
//             balls (log use, counts); rankings (view). Not: finance details, editing
//             money or plans, staff, club settings, deleting important data.

const CLUB_ROLES = ['co_admin', 'finance', 'operator'];
const LIMITED_ROLES = ['finance', 'operator'];

const ID = '[0-9a-fA-F-]{36}';
const re = (s) => new RegExp(`^${s.replace(/:id/g, ID)}$`);

// [methods, path, optional body check]
const SHARED = [
  ['GET', '/api/clubs/:id'],
  ['GET', '/api/clubs/:id/members'],
  ['GET', '/api/clubs/:id/events'],
  ['GET', '/api/clubs/:id/birthdays'],
  ['GET', '/api/events/:id'],
  ['GET', '/api/events/:id/participants'],
  ['GET', '/api/clubs/:id/roster'], // duty roster: everyone on the staff sees it
];

// Permission groups: what each piece of work needs. Finance and Operations get a fixed
// set of groups; on the Pro plan the owner may tick other groups per person
// (staff_grants.permissions) — "custom permissions".
const OPEN_CLOSE = (body) => {
  // Open / close an activity: take sign-ups or not, and reopen / finish it. Not cancelling
  // (that tells every player) and no other field.
  const keys = Object.keys(body || {});
  return keys.length > 0 && keys.every((k) => ['status', 'allow_public_registration'].includes(k)) && (!('status' in body) || ['open', 'completed'].includes(body.status));
};
const BALL_USE = (body) => ['use', 'broken'].includes(body?.kind);

const GROUPS = {
  // Members: list, basic info, attendance and check-in of passes.
  members: [
    ['GET', '/api/clubs/:id/members/:id/memberships'],
    ['GET', '/api/clubs/:id/attendance'],
    ['POST', '/api/clubs/:id/attendance/edits'],
    ['POST', '/api/clubs/:id/memberships/:id/sessions'],
    ['DELETE', '/api/clubs/:id/memberships/:id/sessions/last'],
  ],
  // Activities: open / close, participants, check-in.
  events: [
    ['PATCH', '/api/events/:id', OPEN_CLOSE],
    ['POST', '/api/events/:id/participants'],
    ['POST', '/api/events/:id/participants/import'],
    ['POST', '/api/events/:id/participants/:id/(check-in|no-show|reset|promote|cancel)'],
    ['POST', '/api/events/:id/checkin-code'],
    ['GET', '/api/events/:id/shuttles'],
  ],
  // Matches, tournament results, live scoring.
  matches: [
    ['GET POST', '/api/matches'],
    ['PATCH', '/api/matches/:id'],
    ['GET', '/api/tournaments/:id'],
    ['PATCH', '/api/tournaments/:id/(matches|sub-matches)/:id'],
    ['GET', '/api/live/:id'],
    ['POST', '/api/live/:id/(start|result)'],
    ['POST', '/api/live/:id/:id/(event|undo|save)'],
    ['PATCH', '/api/live/:id/:id'],
  ],
  // Rankings and statistics (view).
  rankings: [
    ['GET', '/api/clubs/:id/(rankings|stats)'],
    ['GET', '/api/analytics/player-form'],
  ],
  // Balls: counts, log use.
  inventory: [
    ['GET', '/api/clubs/:id/inventory'],
    ['POST', '/api/clubs/:id/inventory/:id/moves', BALL_USE],
    ['POST', '/api/clubs/:id/inventory/:id/sessions'],
  ],
  // Money, read only: fund, reports, income / expenses, payment proofs.
  finance_view: [
    ['GET', '/api/clubs/:id/members/:id/memberships'],
    ['GET', '/api/clubs/:id/pending-payments'],
    ['GET', '/api/clubs/:id/fund'],
    ['GET', '/api/clubs/:id/community-overview'],
    ['GET', '/api/clubs/:id/inventory'],
    ['GET', '/api/transactions'],
    ['GET', '/api/analytics/(finance|events-pnl|daily)'],
    ['GET', '/api/events/:id/finance'],
    ['GET', '/api/events/:id/participants/:id/proof'],
    ['GET', '/api/events/:id/meeting'],
    ['GET', '/api/clubs/:id/plans'],
  ],
  // Money, changes: income / expenses, membership plans, confirm payments, fees.
  finance_edit: [
    ['POST', '/api/clubs/:id/plans'],
    ['PATCH', '/api/clubs/:id/plans/:id'],
    ['POST', '/api/clubs/:id/members/:id/memberships'],
    ['PATCH DELETE', '/api/clubs/:id/memberships/:id'],
    ['POST', '/api/clubs/:id/pending-payments/[^/]+/confirm'],
    ['POST', '/api/transactions'],
    ['PATCH', '/api/transactions/:id'],
    ['POST', '/api/transactions/:id/void'],
    ['POST', '/api/events/:id/participants/:id/(fee|waive|confirm-payment|reject-payment)'],
    ['PUT', '/api/events/:id/meeting/money/:id'],
    ['POST', '/api/events/:id/meeting/expenses'],
    ['PATCH DELETE', '/api/events/:id/meeting/expenses/:id'],
    ['POST DELETE', '/api/events/:id/meeting/settle'],
  ],
};
const GROUP_NAMES = Object.keys(GROUPS);

// Each role's groups when the owner hasn't customised them.
const ROLE_GROUPS = {
  finance: ['finance_view', 'finance_edit'],
  operator: ['members', 'events', 'matches', 'rankings', 'inventory'],
};

const compile = (rules) => rules.map(([methods, path, check]) => ({ methods: methods.split(' '), path: re(path), check }));
const TABLE = Object.fromEntries([...GROUP_NAMES.map((g) => [g, compile(GROUPS[g])]), ['shared', compile(SHARED)]]);

// The groups a grant gives: its custom list (Pro only — `custom` says the owner's plan
// allows it), else its role's defaults.
function groupsOf(grant, custom) {
  if (grant.role === 'co_admin') return null; // everything
  if (custom && Array.isArray(grant.permissions) && grant.permissions.length) return grant.permissions.filter((g) => GROUPS[g]);
  return ROLE_GROUPS[grant.role] || [];
}

// May a holder of these grants make this request? `grants` = [{ role, permissions }].
function permitsGrants(grants, method, url, body, { custom = false } = {}) {
  const groups = new Set();
  for (const g of grants) {
    const gs = groupsOf(g, custom);
    if (gs === null) return true;
    gs.forEach((x) => groups.add(x));
  }
  const path = String(url || '').split('?')[0].replace(/\/+$/, '');
  const ok = (rules) => rules.some((rule) => rule.methods.includes(method) && rule.path.test(path) && (!rule.check || rule.check(body)));
  return ok(TABLE.shared) || [...groups].some((g) => ok(TABLE[g]));
}

// Role names only (older callers): defaults of each role.
const permits = (roles, method, url, body) => permitsGrants(roles.map((role) => ({ role })), method, url, body);

// The effective groups of a set of grants (for the web menu).
function effectiveGroups(grants, custom) {
  const out = new Set();
  for (const g of grants) {
    const gs = groupsOf(g, custom);
    if (gs === null) return null;
    gs.forEach((x) => out.add(x));
  }
  return [...out];
}

module.exports = { CLUB_ROLES, LIMITED_ROLES, GROUPS, GROUP_NAMES, ROLE_GROUPS, permits, permitsGrants, groupsOf, effectiveGroups };
