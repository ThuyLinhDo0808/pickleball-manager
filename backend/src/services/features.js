// Which subscription tier unlocks which feature. One place to change the pricing plan.
// Tiers are cumulative: a higher tier has everything below it.
const { supabase } = require('../supabase');

const TIER_ORDER = ['free', 'basic', 'standard', 'pro'];

const FEATURES = {
  // 1. Automations
  qr_checkin: 'basic', // scan ticket / player QR codes to check in
  auto_notify: 'basic', // Telegram + host webhook messages (waitlist, payments, cancellations…)
  balanced_pairing: 'basic', // DUPR-balanced pairing / team building (random + manual stay free)
  // 2. Operations
  staff_roles: 'standard', // referees, coordinators, co-admins
  team_league: 'standard', // team tournaments with sub-matches
  cancel_policy: 'standard', // cancellation deadline + late-cancel charges
  // 3. Analytics & privacy
  advanced_analytics: 'pro', // no-show heatmap, 12-month player form, ball cost per session
  audit_trail: 'pro', // change history (SCD2) of members, passes and money
  privacy: 'pro', // players may hide their name on public sign-up pages
};

const rank = (tier) => Math.max(TIER_ORDER.indexOf(tier), 0);
const allows = (tier, feature) => rank(tier) >= rank(FEATURES[feature] || 'free');
const featureMap = (tier) => Object.fromEntries(Object.keys(FEATURES).map((f) => [f, allows(tier, f)]));

async function tierOf(hostId) {
  if (!hostId) return 'free';
  const { data } = await supabase.from('host_subscriptions').select('tier').eq('host_id', hostId).maybeSingle();
  return data?.tier || 'free';
}

async function hostHas(hostId, feature) {
  return allows(await tierOf(hostId), feature);
}

function upgradeError(feature) {
  return Object.assign(new Error(`This feature needs the ${FEATURES[feature].toUpperCase()} plan or higher.`), {
    status: 402,
    code: 'upgrade_required',
    feature,
    tier_needed: FEATURES[feature],
  });
}

// Throws a 402 { code: 'upgrade_required' } when the host's plan lacks the feature.
async function assertFeature(hostId, feature) {
  if (!(await hostHas(hostId, feature))) throw upgradeError(feature);
}

// Express middleware for routes where req.hostId is the paying host.
const requireFeature = (feature) => async (req, res, next) => {
  try {
    await assertFeature(req.hostId, feature);
    next();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code, feature: err.feature, tier_needed: err.tier_needed });
  }
};

const sendUpgrade = (res, err) => res.status(402).json({ error: err.message, code: err.code, feature: err.feature, tier_needed: err.tier_needed });

module.exports = { TIER_ORDER, FEATURES, allows, featureMap, tierOf, hostHas, assertFeature, requireFeature, upgradeError, sendUpgrade };
