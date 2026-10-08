// Which club pages need which plan feature (the plans themselves come from the API:
// GET /api/host/plan -> catalog, see backend services/planFeatures.js).
const CLUB_PAGES = [
  ['/events/create/weekly', 'weekly_schedule'],
  ['/club/tournaments', 'tournaments'],
  ['/club/attendance', 'stats'],
  ['/club/rankings', 'rankings'],
  ['/finance/plans', 'membership_plans'],
  ['/finance/inventory', 'ball_inventory'],
  ['/finance', 'stats', true], // the overview (charts); the ledger is in every plan
];

// The feature a club page needs, or null. Xé Vé pages come with Social Manager instead.
export function featureForPath(path, workspace) {
  if (workspace !== 'club' || !path) return null;
  for (const [href, feature, exact] of CLUB_PAGES) {
    if (exact ? path === href : path === href || path.startsWith(`${href}/`)) return feature;
  }
  return null;
}

// Plan features in force for a club: its owner's plan (co-admins work under it),
// else the signed-in account's own plan.
export function planFor(club, plan) {
  return club?.plan || (plan ? { tier: plan.tier, features: plan.features, limits: plan.limits, features_enforced: plan.features_enforced } : null);
}

export const hasFeature = (p, feature) => !feature || !p || !p.features_enforced || !p.features || p.features[feature] !== false;

// Short highlights per plan for the comparison cards (i18n keys under plan.hl_*).
export const HIGHLIGHTS = {
  free: ['hl_members', 'hl_events', 'hl_matches', 'hl_money'],
  basic: ['hl_members', 'hl_events', 'hl_matches', 'hl_money'],
  standard: ['hl_basicAll', 'hl_weekly', 'hl_plansDebts', 'hl_stats', 'hl_excel', 'hl_balls'],
  advanced: ['hl_standardAll', 'hl_tournaments', 'hl_rankings', 'hl_reports', 'hl_roles'],
  pro: ['hl_advancedAll', 'hl_customRoles', 'hl_roster', 'hl_log', 'hl_analytics', 'hl_fullExport'],
};

// Explain a locked feature (components/PlanLimitNotice) — for things done in the browser,
// like an Excel export, that never reach the API.
export function lockedNotice(feature, minTier) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('pb:plan-limit', { detail: { code: 'feature_locked', feature, min_tier: minTier || FEATURE_TIER[feature] } }));
}
const FEATURE_TIER = { excel_export: 'standard', full_export: 'pro' };
