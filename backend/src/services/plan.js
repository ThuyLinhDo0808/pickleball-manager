// What a Host's plan allows (one plan per account, covering all of its clubs): how many
// clubs it may own, how many official / guest members each club may have, which
// features are on, and the Social Manager add-on (Xé Vé games). The catalog itself
// lives in services/planFeatures.js. Limits are only enforced once the migrations that
// add the plan columns have been run.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const billing = require('./billing');
const PF = require('./planFeatures');
const { todayYmd } = require('./memberships');

const MIGRATION = '20261018090000_social_manager_plans.sql';
const V2_MIGRATION = '20261027090000_plans_v2.sql';
const { TIERS } = PF;
// Clubs a Host may own on each tier (null = unlimited).
const CLUB_LIMIT = Object.fromEntries(TIERS.map((t) => [t, PF.LIMITS[t].clubs]));
// People under management on each tier — a guard against abuse, well above the member
// limits (kept in step with public.tier_capacity()).
const CAPACITY = { free: 100, basic: 200, standard: 600, advanced: 1500, pro: 100000 };

async function plansReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}
async function v2Ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(V2_MIGRATION);
}

function shiftYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A new organiser (owns a club, never paid, never tried) gets the trial plan once.
async function maybeStartTrial(sub, clubsOwned) {
  if (!sub || sub.tier !== 'free' || sub.trial_started_at || sub.tier_paid_until || !clubsOwned) return sub;
  const patch = { tier: PF.TRIAL.tier, tier_paid_until: shiftYmd(todayYmd(), PF.TRIAL.days), trial_started_at: new Date().toISOString(), trial_ends_on: shiftYmd(todayYmd(), PF.TRIAL.days) };
  const { error } = await supabase.from('host_subscriptions').update(patch).eq('host_id', sub.host_id).eq('tier', 'free').is('trial_started_at', null);
  return error ? sub : { ...sub, ...patch };
}

// Small cache: plan checks run on many requests.
const CACHE_MS = Number(process.env.PLAN_CACHE_MS ?? 15000); // 0 in tests that edit the database directly
const cache = new Map();
const forgetPlan = (hostId) => cache.delete(hostId);

async function getPlan(hostId, { fresh = false } = {}) {
  const hit = !fresh && cache.get(hostId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const [ready, ready2] = await Promise.all([plansReady(), v2Ready()]);
  const [{ data: sub }, { count }] = await Promise.all([
    supabase.from('host_subscriptions').select('*').eq('host_id', hostId).maybeSingle(),
    supabase.from('clubs').select('id', { count: 'exact', head: true }).eq('host_id', hostId),
  ]);
  // A paid period that ran out drops back to Free / Social Manager off.
  let live = await billing.expireIfDue(sub);
  if (ready2) live = await maybeStartTrial(live, count || 0);
  const tier = TIERS.includes(live?.tier) ? live.tier : 'free';
  const selfServe = await require('./appSettings').selfServe();
  const today = todayYmd();
  const onTrial = !!live?.trial_ends_on && live.tier_paid_until === live.trial_ends_on && today <= live.trial_ends_on && tier !== 'free';
  const value = {
    enforced: ready,
    // Before the plans-v2 migration features are not locked (old databases keep working).
    features_enforced: ready && ready2,
    tier,
    club_limit: CLUB_LIMIT[tier] ?? null,
    clubs_owned: count || 0,
    limits: PF.LIMITS[tier],
    features: ready && ready2 ? PF.featuresOf(tier) : PF.featuresOf('pro'),
    role_seats: PF.ROLE_SEATS[tier],
    trial: onTrial ? { tier, ends_on: live.trial_ends_on } : null,
    trial_used: !!live?.trial_started_at,
    // Before the migration nothing is locked away.
    social_manager: ready ? !!live?.social_manager : true,
    social_manager_requested_at: live?.social_manager_requested_at || null,
    upgrade_requested_at: live?.upgrade_requested_at || null,
    upgrade_requested_tier: live?.upgrade_requested_tier || null,
    // Paid until (null = no end date, e.g. switched on by hand or self-serve).
    tier_paid_until: live?.tier_paid_until || null,
    social_manager_paid_until: live?.social_manager_paid_until || null,
    expired_tier: live?.expired_tier || null,
    self_serve: selfServe,
    // Paying by transfer: monthly prices, how many months can be bought, open orders.
    prices: billing.prices(),
    month_choices: billing.MONTH_CHOICES,
    catalog: PF.catalog(billing.prices()),
    pending_payments: selfServe ? { tier: null, social_manager: null } : await billing.pendingOrders(hostId),
  };
  cache.set(hostId, { at: Date.now(), value });
  return value;
}

const locked = (message, code, extra = {}) => Object.assign(new Error(message), { status: 402, code, ...extra });

// Throws { status: 402, code } when the Host can't add another club / run Xé Vé.
async function assertCanCreateClub(hostId) {
  const p = await getPlan(hostId, { fresh: true });
  if (p.enforced && p.club_limit != null && p.clubs_owned >= p.club_limit) {
    throw locked(`Your ${p.tier} plan allows ${p.club_limit} club(s). Upgrade to add another.`, 'club_limit', { plan: p });
  }
}

async function assertSocialManager(hostId) {
  const p = await getPlan(hostId);
  if (!p.social_manager) throw locked('Xé Vé games need the Social Manager add-on.', 'social_manager_required');
}

// 402 feature_locked when the Host's plan doesn't include `feature`.
async function assertFeature(hostId, feature) {
  const p = await getPlan(hostId);
  if (p.features_enforced && !p.features[feature]) {
    throw locked(`This needs the ${PF.FEATURES[feature].toUpperCase()} plan or higher.`, 'feature_locked', { feature, min_tier: PF.FEATURES[feature], tier: p.tier });
  }
  return p;
}

// Express guard: the plan of `hostOf(req)` (default: the acting host) must include `feature`.
function requireFeature(feature, hostOf = (req) => req.hostId) {
  return async (req, res, next) => {
    try {
      await assertFeature(await hostOf(req), feature);
      next();
    } catch (err) {
      if (err.status === 402) return res.status(402).json({ error: err.message, code: err.code, feature: err.feature, min_tier: err.min_tier });
      next(err);
    }
  };
}

// Official / guest members a club may still take: { fixed: {used, limit}, guest: {used, limit} }.
async function memberRoom(club) {
  // The owner and any extra places the app owner granted this club (a member licence).
  const { data: row } = await supabase.from('clubs').select('*').eq('id', club.id).single();
  const hostId = club.host_id || row?.host_id;
  const extra = { fixed: Number(row?.extra_fixed_members) || 0, guest: Number(row?.extra_guest_members) || 0 };
  const p = await getPlan(hostId);
  const count = (type) =>
    supabase.from('club_members').select('id', { count: 'exact', head: true }).eq('club_id', club.id).eq('is_active', true).eq('member_type', type).then((r) => r.count || 0);
  const [fixed, guest] = await Promise.all([count('fixed'), count('guest')]);
  const on = p.features_enforced;
  const limit = (type) => (on && p.limits[type] != null ? p.limits[type] + extra[type] : null);
  return {
    tier: p.tier,
    fixed: { used: fixed, limit: limit('fixed'), extra: extra.fixed },
    guest: { used: guest, limit: limit('guest'), extra: extra.guest },
  };
}

// 402 member_limit when adding `n` members of `type` would pass the plan's limit.
async function assertMemberRoom(club, type, n = 1) {
  if (n <= 0) return;
  const room = await memberRoom(club);
  const r = room[type === 'guest' ? 'guest' : 'fixed'];
  if (r.limit != null && r.used + n > r.limit) {
    throw locked(
      `The ${room.tier} plan allows ${r.limit} ${type === 'guest' ? 'guest' : 'official'} members per club (${r.used} now).`,
      'member_limit',
      { member_type: type === 'guest' ? 'guest' : 'fixed', limit: r.limit, used: r.used },
    );
  }
}

// For automatic adds (guests from a session, survey sign-ups): true if there is room.
async function hasMemberRoom(club, type) {
  try {
    await assertMemberRoom(club, type, 1);
    return true;
  } catch (err) {
    if (err.code === 'member_limit') return false;
    throw err;
  }
}

module.exports = {
  TIERS, CLUB_LIMIT, CAPACITY, plansReady, v2Ready, getPlan, forgetPlan,
  assertCanCreateClub, assertSocialManager, assertFeature, requireFeature,
  memberRoom, assertMemberRoom, hasMemberRoom,
};
