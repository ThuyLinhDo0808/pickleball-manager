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
];

const FINANCE = [
  ['GET', '/api/clubs/:id/members/:id/memberships'],
  ['GET POST', '/api/clubs/:id/plans'],
  ['PATCH', '/api/clubs/:id/plans/:id'],
  ['POST', '/api/clubs/:id/members/:id/memberships'],
  ['PATCH DELETE', '/api/clubs/:id/memberships/:id'],
  ['GET', '/api/clubs/:id/pending-payments'],
  ['POST', '/api/clubs/:id/pending-payments/[^/]+/confirm'],
  ['GET', '/api/clubs/:id/fund'],
  ['GET', '/api/clubs/:id/inventory'],
  ['GET POST', '/api/transactions'],
  ['PATCH', '/api/transactions/:id'],
  ['POST', '/api/transactions/:id/void'],
  ['GET', '/api/analytics/(finance|events-pnl)'],
  ['GET', '/api/events/:id/finance'],
  ['GET', '/api/events/:id/participants/:id/proof'],
  ['POST', '/api/events/:id/participants/:id/(fee|waive|confirm-payment|reject-payment)'],
  ['GET', '/api/events/:id/meeting'],
  ['PUT', '/api/events/:id/meeting/money/:id'],
  ['POST', '/api/events/:id/meeting/expenses'],
  ['PATCH DELETE', '/api/events/:id/meeting/expenses/:id'],
  ['POST DELETE', '/api/events/:id/meeting/settle'],
];

// Open / close an activity: take sign-ups or not, and reopen / finish it. Not cancelling
// (that tells every player) and no other field.
const OPEN_CLOSE = (body) => {
  const keys = Object.keys(body || {});
  return keys.length > 0 && keys.every((k) => ['status', 'allow_public_registration'].includes(k)) && (!('status' in body) || ['open', 'completed'].includes(body.status));
};
const BALL_USE = (body) => ['use', 'broken'].includes(body?.kind);

const OPERATOR = [
  ['GET', '/api/clubs/:id/members/:id/memberships'],
  ['GET', '/api/clubs/:id/attendance'],
  ['POST', '/api/clubs/:id/attendance/edits'],
  ['POST', '/api/clubs/:id/memberships/:id/sessions'],
  ['DELETE', '/api/clubs/:id/memberships/:id/sessions/last'],
  ['GET', '/api/clubs/:id/(rankings|stats)'],
  ['GET', '/api/clubs/:id/inventory'],
  ['POST', '/api/clubs/:id/inventory/:id/moves', BALL_USE],
  ['POST', '/api/clubs/:id/inventory/:id/sessions'],
  ['PATCH', '/api/events/:id', OPEN_CLOSE],
  ['POST', '/api/events/:id/participants'],
  ['POST', '/api/events/:id/participants/import'],
  ['POST', '/api/events/:id/participants/:id/(check-in|no-show|reset|promote|cancel)'],
  ['POST', '/api/events/:id/checkin-code'],
  ['GET', '/api/events/:id/shuttles'],
  ['GET POST', '/api/matches'],
  ['PATCH', '/api/matches/:id'],
  ['GET', '/api/tournaments/:id'],
  ['PATCH', '/api/tournaments/:id/(matches|sub-matches)/:id'],
  ['GET', '/api/live/:id'],
  ['POST', '/api/live/:id/(start|result)'],
  ['POST', '/api/live/:id/:id/(event|undo|save)'],
  ['PATCH', '/api/live/:id/:id'],
  ['GET', '/api/analytics/player-form'],
];

const compile = (rules) => rules.map(([methods, path, check]) => ({ methods: methods.split(' '), path: re(path), check }));
const TABLE = { finance: compile([...SHARED, ...FINANCE]), operator: compile([...SHARED, ...OPERATOR]) };

// May a holder of `roles` (co_admin / finance / operator) make this request?
function permits(roles, method, url, body) {
  if (roles.includes('co_admin')) return true;
  const path = String(url || '').split('?')[0].replace(/\/+$/, '');
  return roles.some((r) => (TABLE[r] || []).some((rule) => rule.methods.includes(method) && rule.path.test(path) && (!rule.check || rule.check(body))));
}

module.exports = { CLUB_ROLES, LIMITED_ROLES, permits };
