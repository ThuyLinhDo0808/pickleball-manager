// Is the database up to date with this backend? One probe column per migration: when the
// Host deploys new code but forgets to run a migration, the app says exactly which file
// to run instead of failing with a cryptic "column ... does not exist".
const { supabase } = require('../supabase');

const PROBES = [
  { table: 'events', column: 'cancel_deadline_hours', migration: '20260930120000_cancel_policy_qr_coadmin_notify.sql' },
  { table: 'player_profiles', column: 'checkin_token', migration: '20260930120000_cancel_policy_qr_coadmin_notify.sql' },
  { table: 'event_participants', column: 'payment_status', migration: '20261001090000_paid_signup_tickets.sql' },
  { table: 'club_members', column: 'account_verified', migration: '20261001090000_paid_signup_tickets.sql' },
  { table: 'events', column: 'kind', migration: '20261002090000_activities_team_tournaments.sql' },
  { table: 'tournaments', column: 'kind', migration: '20261002090000_activities_team_tournaments.sql' },
  { table: 'club_members', column: 'join_requested', migration: '20261002090000_activities_team_tournaments.sql' },
  { table: 'club_members', column: 'joined_on', migration: '20261003090000_signup_safety_member_dates.sql' },
  { table: 'tournaments', column: 'entry_fee', migration: '20261004090000_tournament_entry_fee.sql' },
  { table: 'tournament_fee_payments', column: 'club_member_id', migration: '20261005090000_tournament_fee_payments.sql' },
  { table: 'player_profiles', column: 'birth_date', migration: '20261006090000_player_birth_date.sql' },
  { table: 'club_members', column: 'guest_perk', migration: '20261009090000_guest_perks_survey.sql' },
  { table: 'event_surveys', column: 'wants_join', migration: '20261009090000_guest_perks_survey.sql' },
  { table: 'club_members', column: 'phone_key', migration: '20261010090000_member_phone_link.sql' },
  { table: 'clubs', column: 'sport', migration: '20261012090000_multi_sport_badminton.sql' },
  { table: 'matches', column: 'games', migration: '20261012090000_multi_sport_badminton.sql' },
  { table: 'club_members', column: 'guest_discount_pct', migration: '20261013090000_guest_priority_discount.sql' },
  { table: 'club_members', column: 'real_rank', migration: '20261014090000_member_area_rank_unscored_matches.sql' },
  { table: 'staff_grants', column: 'valid_until', migration: '20261015090000_staff_grant_scope.sql' },
  { table: 'tournament_live', column: 'log', migration: '20261016090000_tournament_live_scoring.sql' },
  { table: 'tournament_live', column: 'stamps', migration: '20261017090000_match_timing_formats.sql' },
  { table: 'host_subscriptions', column: 'social_manager', migration: '20261018090000_social_manager_plans.sql' },
  { table: 'event_votes', column: 'choice', migration: '20261019090000_round_robin_meeting_votes.sql' },
  { table: 'tournaments', column: 'player_ranks', migration: '20261020090000_tournament_player_ranks.sql' },
  { table: 'meeting_money', column: 'sponsor_amount', migration: '20261021090000_meeting_money.sql' },
  { table: 'clubs', column: 'fund_calc', migration: '20261022090000_club_fund_calculator.sql' },
  { table: 'inventory_items', column: 'host_id', migration: '20261023090000_ball_log_xeve_inventory.sql' },
  { table: 'users', column: 'notify_players_email', migration: '20261024090000_player_email_notices.sql' },
  { table: 'plan_payments', column: 'ref', migration: '20261025090000_plan_payments.sql' },
  { table: 'host_subscriptions', column: 'tier_paid_until', migration: '20261025090000_plan_payments.sql' },
  { table: 'users', column: 'suspended_at', migration: '20261026090000_owner_console.sql' },
  { table: 'owner_audit_logs', column: 'old_value', migration: '20261026090000_owner_console.sql' },
];

const TTL_MS = 60 * 1000;
let cache = null;

async function schemaStatus() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const missing = new Set();
  await Promise.all(
    PROBES.map(async (p) => {
      const { error } = await supabase.from(p.table).select(p.column).limit(1);
      if (error) missing.add(p.migration);
    })
  );
  const value = { ok: missing.size === 0, missing_migrations: [...missing].sort() };
  cache = { at: Date.now(), value };
  return value;
}

module.exports = { schemaStatus };
