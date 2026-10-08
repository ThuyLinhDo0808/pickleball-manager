// What a Host's plan allows: how many clubs they may own (by tier) and whether the
// Social Manager add-on (Xé Vé games) is on. Limits are only enforced once the
// migration that adds the add-on columns has been run.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const billing = require('./billing');

const MIGRATION = '20261018090000_social_manager_plans.sql';
const TIERS = ['free', 'basic', 'standard', 'pro'];
// Clubs a Host may own on each tier (null = unlimited).
const CLUB_LIMIT = { free: 1, basic: 3, standard: 10, pro: null };
// People under management on each tier (kept in step with public.tier_capacity()).
const CAPACITY = { free: 30, basic: 100, standard: 300, pro: 1000 };

async function plansReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

async function getPlan(hostId) {
  const ready = await plansReady();
  const [{ data: sub }, { count }] = await Promise.all([
    supabase.from('host_subscriptions').select('*').eq('host_id', hostId).maybeSingle(),
    supabase.from('clubs').select('id', { count: 'exact', head: true }).eq('host_id', hostId),
  ]);
  // A paid period that ran out drops back to Free / Social Manager off.
  const live = await billing.expireIfDue(sub);
  const tier = live?.tier || 'free';
  const selfServe = process.env.ALLOW_TIER_SELF_SERVE === 'true';
  return {
    enforced: ready,
    tier,
    club_limit: CLUB_LIMIT[tier] ?? null,
    clubs_owned: count || 0,
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
    pending_payments: selfServe ? { tier: null, social_manager: null } : await billing.pendingOrders(hostId),
  };
}

// Throws { status: 402, code } when the Host can't add another club / run Xé Vé.
async function assertCanCreateClub(hostId) {
  const p = await getPlan(hostId);
  if (p.enforced && p.club_limit != null && p.clubs_owned >= p.club_limit) {
    throw Object.assign(new Error(`Your ${p.tier} plan allows ${p.club_limit} club(s). Upgrade to add another.`), { status: 402, code: 'club_limit', plan: p });
  }
}

async function assertSocialManager(hostId) {
  const p = await getPlan(hostId);
  if (!p.social_manager) {
    throw Object.assign(new Error('Xé Vé games need the Social Manager add-on.'), { status: 402, code: 'social_manager_required' });
  }
}

module.exports = { TIERS, CLUB_LIMIT, CAPACITY, plansReady, getPlan, assertCanCreateClub, assertSocialManager };
