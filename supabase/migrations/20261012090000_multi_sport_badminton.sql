-- ----------------------------------------------------------------------------
-- MULTI-SPORT: BADMINTON CLUBS  (migration 20261012090000)
-- ----------------------------------------------------------------------------
-- Each club plays one sport, chosen when it is created. Existing clubs are pickleball.
alter table public.clubs add column if not exists sport text not null default 'pickleball'
  check (sport in ('pickleball', 'badminton'));

-- Badminton levels are steps 1-6 (Yếu, TB-, TB, TB+, Khá, Giỏi). In a badminton club the
-- level columns (club_members.dupr_level, events.level_min/max, event_participants.dupr_level)
-- hold that step; a player's own badminton level is kept apart from their DUPR.
alter table public.player_profiles add column if not exists badminton_level smallint
  check (badminton_level is null or badminton_level between 1 and 6);

-- Badminton scores game by game, e.g. [[21,18],[19,21],[21,15]]; team1/team2_score then
-- hold the games won (2-1), so winners and standings work the same for both sports.
alter table public.matches add column if not exists games jsonb;
alter table public.tournament_matches add column if not exists games jsonb;
alter table public.tournament_sub_matches add column if not exists games jsonb;

-- Shuttles are used up: a 'use' move takes N shuttles out of stock for one session,
-- so the club sees what each session's shuttles cost and the share per player.
alter table public.inventory_moves add column if not exists event_id uuid references public.events(id) on delete set null;
create index if not exists ix_inventory_moves_event on public.inventory_moves (event_id) where event_id is not null;
alter table public.inventory_moves drop constraint if exists inventory_moves_kind_check;
alter table public.inventory_moves add constraint inventory_moves_kind_check check (kind in ('purchase','retire','adjust','use'));
alter table public.inventory_moves drop constraint if exists chk_move_shape;
alter table public.inventory_moves add constraint chk_move_shape check (
  (kind = 'purchase' and quantity > 0 and unit_cost is not null) or
  (kind = 'retire' and quantity > 0) or
  (kind = 'use' and quantity > 0) or
  (kind = 'adjust')
);
notify pgrst, 'reload schema';
