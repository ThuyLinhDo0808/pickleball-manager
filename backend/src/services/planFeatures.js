// What each plan includes. One catalog for the whole app: the backend enforces it and
// the web app shows it (GET /api/host/plan returns it), so the two never disagree.
//
// Plans are bought per account (the Host): one plan covers all of the Host's clubs.
// Member limits apply to each club; `clubs` is how many clubs the account may own.
//
// Every plan is paid. 'free' is only the state of an account without a plan (never
// bought one, or its plan ran out): its clubs and data stay, but no club or member can
// be added until it pays again.

const TIERS = ['free', 'basic', 'standard', 'advanced', 'pro'];
const PAID_TIERS = TIERS.slice(1);

// null = unlimited. fixed = official members, guest = "giao lưu" members (per club).
// Plans differ mostly in features; the club count is generous. A club that needs more
// members than its plan allows gets extra places from the app owner (clubs.extra_*).
const LIMITS = {
  free: { clubs: 0, fixed: 0, guest: 0 }, // no plan
  basic: { clubs: 3, fixed: 16, guest: 20 },
  standard: { clubs: 5, fixed: 50, guest: 100 },
  advanced: { clubs: 10, fixed: 100, guest: 200 },
  pro: { clubs: 20, fixed: null, guest: null },
};

// Monthly price (VND). PLAN_PRICE_<TIER> overrides one (see services/billing.js).
const PRICES = { basic: 99000, standard: 199000, advanced: 349000, pro: 599000 };

// Social Manager (play communities, "cộng đồng xé vé") is a separate product with its own
// four plans: bought, renewed and upgraded on its own, never covered by a Club plan.
// communities = how many communities the account may run; members = people per community
// (official + guest together). Features follow the same tiers as clubs.
const SM_LIMITS = {
  free: { communities: 0, members: 0 },
  basic: { communities: 1, members: 50 },
  standard: { communities: 3, members: 200 },
  advanced: { communities: 5, members: 500 },
  pro: { communities: 10, members: null },
};
// PLAN_PRICE_SM_<TIER> overrides one.
const SM_PRICES = { basic: 99000, standard: 199000, advanced: 349000, pro: 599000 };

// The lowest plan that has each feature. Everything not listed here is in every plan:
// members (add/edit/delete, profiles, official/guest, levels), activities (create,
// participants, attendance, check-in), matches (create, players, scores), income and
// expenses, the member list and activity history.
const FEATURES = {
  // BASIC — every paid plan
  activity_log: 'basic', // who did what in the club (every plan: evidence when money is disputed)
  // STANDARD — running activities and money
  weekly_schedule: 'standard', // weekly schedule: many sessions at once
  membership_plans: 'standard', // membership plans, paid / unpaid, debts
  stats: 'standard', // members / activities / income-expense statistics
  excel_export: 'standard',
  ball_inventory: 'standard',
  // ADVANCED — competition, rankings, finance reports, staff roles
  tournaments: 'advanced', // tournaments + live scoring
  rankings: 'advanced', // internal leaderboard, awards, weeks at #1, form, DUPR history
  finance_reports: 'advanced', // monthly charts, by category, profit, per activity
  staff_roles: 'advanced', // finance + operations roles (1 each)
  // PRO — many operators, custom rights, analysis
  custom_roles: 'pro', // unlimited staff, custom permissions
  duty_roster: 'pro', // shifts / who is on duty
  advanced_analytics: 'pro', // retention, active / inactive members, revenue per member…
  full_export: 'pro', // whole-club data export
};

// How many people may hold each staff role on a plan (null = unlimited).
const ROLE_SEATS = {
  free: { finance: 0, operator: 0 },
  basic: { finance: 0, operator: 0 },
  standard: { finance: 0, operator: 0 },
  advanced: { finance: 1, operator: 1 },
  pro: { finance: null, operator: null },
};

// No automatic free trial: every club pays for its plan. (Trial promo codes made by the
// app owner still switch a plan on for some days.)
const TRIAL = null;

const rank = (tier) => Math.max(0, TIERS.indexOf(tier));
const has = (tier, feature) => !FEATURES[feature] || rank(tier) >= rank(FEATURES[feature]);
const featuresOf = (tier) => Object.fromEntries(Object.keys(FEATURES).map((f) => [f, has(tier, f)]));

// The smallest plan whose member limit fits `count` people (null if none / no count).
function fitTier(count, kind = 'club') {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cap = (t) => (kind === 'community' ? SM_LIMITS[t].members : LIMITS[t].fixed);
  return PAID_TIERS.find((t) => cap(t) == null || n <= cap(t)) || 'pro';
}

function catalog(prices = PRICES) {
  const sm = Object.fromEntries(PAID_TIERS.map((t) => [t, prices[`sm_${t}`] ?? SM_PRICES[t]]));
  return { tiers: PAID_TIERS, limits: LIMITS, prices, features: FEATURES, role_seats: ROLE_SEATS, trial: TRIAL, sm: { limits: SM_LIMITS, prices: sm } };
}

module.exports = { TIERS, PAID_TIERS, LIMITS, PRICES, SM_LIMITS, SM_PRICES, FEATURES, ROLE_SEATS, TRIAL, rank, has, featuresOf, fitTier, catalog };
