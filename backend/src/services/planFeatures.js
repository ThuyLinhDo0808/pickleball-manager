// What each plan includes. One catalog for the whole app: the backend enforces it and
// the web app shows it (GET /api/host/plan returns it), so the two never disagree.
//
// Plans are bought per account (the Host): one plan covers all of the Host's clubs.
// Member limits apply to each club; `clubs` is how many clubs the account may own.

const TIERS = ['free', 'basic', 'standard', 'advanced', 'pro'];

// null = unlimited. fixed = official members, guest = "giao lưu" members (per club).
const LIMITS = {
  free: { clubs: 1, fixed: 8, guest: 10 },
  basic: { clubs: 1, fixed: 16, guest: 20 },
  standard: { clubs: 2, fixed: 50, guest: 100 },
  advanced: { clubs: 3, fixed: 100, guest: 200 },
  pro: { clubs: null, fixed: null, guest: null },
};

// Monthly price (VND). PLAN_PRICE_<TIER> overrides one (see services/billing.js).
const PRICES = { basic: 99000, standard: 199000, advanced: 349000, pro: 599000 };

// The lowest plan that has each feature. Everything not listed here is in every plan:
// members (add/edit/delete, profiles, official/guest, levels), activities (create,
// participants, attendance, check-in), matches (create, players, scores), income and
// expenses, the member list and activity history.
const FEATURES = {
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
  activity_log: 'pro', // who did what in the club
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

// Plan a brand-new account tries for free, and for how long.
const TRIAL = { tier: 'standard', days: 14 };

const rank = (tier) => Math.max(0, TIERS.indexOf(tier));
const has = (tier, feature) => !FEATURES[feature] || rank(tier) >= rank(FEATURES[feature]);
const featuresOf = (tier) => Object.fromEntries(Object.keys(FEATURES).map((f) => [f, has(tier, f)]));

function catalog(prices = PRICES) {
  return { tiers: TIERS, limits: LIMITS, prices, features: FEATURES, role_seats: ROLE_SEATS, trial: TRIAL };
}

module.exports = { TIERS, LIMITS, PRICES, FEATURES, ROLE_SEATS, TRIAL, rank, has, featuresOf, catalog };
