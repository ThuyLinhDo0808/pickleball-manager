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

// Small cache: plan checks run on many requests.
const CACHE_MS = Number(process.env.PLAN_CACHE_MS ?? 15000); // 0 in tests that edit the database directly
const cache = new Map();
const forgetPlan = (hostId) => cache.delete(hostId);

async function getPlan(hostId, { fresh = false } = {}) {
  const hit = !fresh && cache.get(hostId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const [ready, ready2] = await Promise.all([plansReady(), v2Ready()]);
  const [{ data: sub }, { data: owned }] = await Promise.all([
    supabase.from('host_subscriptions').select('*').eq('host_id', hostId).maybeSingle(),
    supabase.from('clubs').select('id, kind').eq('host_id', hostId),
  ]);
  // Clubs (Club Manager) and communities (Social Manager) are counted apart: each product
  // has its own plan and limits.
  const count = (owned || []).filter((c) => (c.kind || 'club') !== 'community').length;
  const communities = (owned || []).filter((c) => c.kind === 'community').length;
  // A paid period that ran out drops back to Free / Social Manager off.
  let live = await billing.expireIfDue(sub);
  const tier = TIERS.includes(live?.tier) ? live.tier : 'free';
  const selfServe = await require('./appSettings').selfServe();
  const today = todayYmd();
  const smTier = billing.productOf(live, 'social_manager').tier;
  const onTrial = !!live?.trial_ends_on && live.tier_paid_until === live.trial_ends_on && today <= live.trial_ends_on && tier !== 'free';
  const value = {
    enforced: ready,
    // Before the plans-v2 migration features are not locked (old databases keep working).
    features_enforced: ready && ready2,
    tier,
    // No plan (never bought one, or it ran out): clubs stay, nothing can be added.
    no_plan: tier === 'free',
    // Paying for a plan right now (not a trial): higher plans are upgrades for the days
    // left (quotes below), lower ones wait until it ends.
    active_paid: billing.activePaid(live, today),
    upgrade_quotes: Object.fromEntries(PF.PAID_TIERS.map((t) => [t, billing.upgradeQuote(live, t, today)]).filter(([, q]) => q)),
    club_limit: CLUB_LIMIT[tier] ?? null,
    clubs_owned: count || 0,
    limits: PF.LIMITS[tier],
    features: ready && ready2 ? PF.featuresOf(tier) : PF.featuresOf('pro'),
    role_seats: PF.ROLE_SEATS[tier],
    trial: onTrial ? { tier, ends_on: live.trial_ends_on } : null,
    trial_used: !!live?.trial_started_at,
    // Social Manager on (any of its plans). Before the migration nothing is locked away.
    social_manager: ready ? smTier !== 'free' : true,
    // Social Manager: its own plan for communities ("cộng đồng xé vé").
    sm: {
      tier: smTier,
      no_plan: smTier === 'free',
      paid_until: live?.social_manager_paid_until || null,
      active_paid: billing.activePaid(live, today, 'social_manager'),
      upgrade_quotes: Object.fromEntries(PF.PAID_TIERS.map((t) => [t, billing.upgradeQuote(live, t, today, 'social_manager')]).filter(([, q]) => q)),
      limits: PF.SM_LIMITS[smTier],
      community_limit: PF.SM_LIMITS[smTier].communities,
      communities_owned: communities,
      features: ready && ready2 ? PF.featuresOf(smTier) : PF.featuresOf('pro'),
      role_seats: PF.ROLE_SEATS[smTier],
    },
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

// The plan that applies to one kind of space: 'club' -> the Club plan, 'community' -> the
// Social Manager plan. Same shape for both: { kind, tier, no_plan, features, limits, ... }.
function planView(p, kind = 'club') {
  if (kind === 'community') {
    const m = p.sm.limits.members;
    return {
      kind, tier: p.sm.tier, no_plan: p.sm.no_plan, features: p.sm.features, features_enforced: p.features_enforced,
      // People per community count official + guest together.
      limits: { members: m, fixed: m, guest: m },
      role_seats: p.sm.role_seats, paid_until: p.sm.paid_until,
    };
  }
  return {
    kind: 'club', tier: p.tier, no_plan: p.no_plan, features: p.features, features_enforced: p.features_enforced,
    limits: p.limits, role_seats: p.role_seats, paid_until: p.tier_paid_until, trial: p.trial,
  };
}
const kindOf = (club) => (club?.kind === 'community' ? 'community' : 'club');
// The plan in force for a club or community (its owner's plan of that product).
async function clubPlan(club, opts) {
  return planView(await getPlan(club.host_id, opts), kindOf(club));
}

// When the plan of a club (Club plan) or community (Social Manager) has ended, every
// manager feature of it stops until the Host renews or buys a plan: 402 plan_expired.
// Reading stays possible (the web shows a renew screen instead of the pages).
async function assertPlanActive(club) {
  const p = await getPlan(club.host_id);
  if (!p.enforced) return;
  const v = planView(p, kindOf(club));
  if (v.no_plan) {
    throw locked(
      v.kind === 'community' ? 'The Social Manager plan of this community has ended. Renew it to continue.' : 'The plan of this club has ended. Renew it to continue.',
      'plan_expired',
      { kind: v.kind },
    );
  }
}

// Throws { status: 402, code } when the Host can't add another club / community.
async function assertCanCreateClub(hostId, kind = 'club') {
  const p = await getPlan(hostId, { fresh: true });
  if (kind === 'community') {
    if (p.enforced && p.sm.no_plan) throw locked('Communities need a Social Manager plan.', 'social_manager_required', { plan: p });
    if (p.enforced && p.sm.community_limit != null && p.sm.communities_owned >= p.sm.community_limit) {
      throw locked(`Your Social Manager ${p.sm.tier} plan allows ${p.sm.community_limit} community(ies). Upgrade to add another.`, 'community_limit', { plan: p });
    }
    return;
  }
  // Only when the owner switched club approval off (testing): a first club needs no plan.
  if (p.tier === 'free' && p.clubs_owned === 0) return;
  if (p.enforced && p.club_limit != null && p.clubs_owned >= p.club_limit) {
    throw locked(`Your ${p.tier} plan allows ${p.club_limit} club(s). Upgrade to add another.`, 'club_limit', { plan: p });
  }
}

async function assertSocialManager(hostId) {
  const p = await getPlan(hostId);
  if (!p.social_manager) throw locked('This needs a Social Manager plan.', 'social_manager_required');
}

// 402 feature_locked when the plan (Club plan, or Social Manager for a community) doesn't
// include `feature`.
async function assertFeature(hostId, feature, kind = 'club') {
  const p = planView(await getPlan(hostId), kind);
  if (p.features_enforced && !p.features[feature]) {
    throw locked(`This needs the ${PF.FEATURES[feature].toUpperCase()} plan or higher.`, 'feature_locked', { feature, min_tier: PF.FEATURES[feature], tier: p.tier, kind });
  }
  return p;
}

// The kind of space a request works on: the loaded club, or the club_id in the body.
async function kindForRequest(req) {
  if (req.club) return kindOf(req.club);
  const id = req.body?.club_id || req.query?.club_id;
  if (!id) return 'club';
  const { data } = await supabase.from('clubs').select('kind').eq('id', id).maybeSingle();
  return kindOf(data);
}

// Express guard: the plan of `hostOf(req)` (default: the acting host) must include `feature`.
function requireFeature(feature, hostOf = (req) => req.hostId) {
  return async (req, res, next) => {
    try {
      await assertFeature(await hostOf(req), feature, await kindForRequest(req));
      next();
    } catch (err) {
      if (err.status === 402) return res.status(402).json({ error: err.message, code: err.code, feature: err.feature, min_tier: err.min_tier, kind: err.kind });
      next(err);
    }
  };
}

// Official / guest members a club may still take: { fixed: {used, limit}, guest: {used, limit} }.
// A community (Social Manager) has one limit for official + guest together (`total`).
async function memberRoom(club) {
  // The owner and any extra places the app owner granted this club (a member licence).
  const { data: row } = await supabase.from('clubs').select('*').eq('id', club.id).single();
  const hostId = club.host_id || row?.host_id;
  const kind = kindOf(row || club);
  const extra = { fixed: Number(row?.extra_fixed_members) || 0, guest: Number(row?.extra_guest_members) || 0 };
  const p = planView(await getPlan(hostId), kind);
  const count = (type) =>
    supabase.from('club_members').select('id', { count: 'exact', head: true }).eq('club_id', club.id).eq('is_active', true).eq('member_type', type).then((r) => r.count || 0);
  const [fixed, guest] = await Promise.all([count('fixed'), count('guest')]);
  const on = p.features_enforced;
  if (kind === 'community') {
    const cap = on && p.limits.members != null ? p.limits.members + extra.fixed + extra.guest : null;
    const free = cap == null ? null : Math.max(0, cap - fixed - guest);
    return {
      kind, tier: p.tier,
      total: { used: fixed + guest, limit: cap },
      fixed: { used: fixed, limit: free == null ? null : fixed + free, extra: extra.fixed },
      guest: { used: guest, limit: free == null ? null : guest + free, extra: extra.guest },
    };
  }
  const limit = (type) => (on && p.limits[type] != null ? p.limits[type] + extra[type] : null);
  return {
    kind, tier: p.tier,
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
    const what = room.kind === 'community' ? 'members per community' : `${type === 'guest' ? 'guest' : 'official'} members per club`;
    throw locked(
      `The ${room.tier} plan allows ${room.kind === 'community' ? room.total.limit : r.limit} ${what} (${room.kind === 'community' ? room.total.used : r.used} now).`,
      'member_limit',
      { member_type: type === 'guest' ? 'guest' : 'fixed', limit: room.kind === 'community' ? room.total.limit : r.limit, used: room.kind === 'community' ? room.total.used : r.used, kind: room.kind },
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
  assertPlanActive, assertCanCreateClub, assertSocialManager, assertFeature, requireFeature, planView, clubPlan, kindOf,
  memberRoom, assertMemberRoom, hasMemberRoom,
};
