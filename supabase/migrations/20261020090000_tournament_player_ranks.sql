-- ----------------------------------------------------------------------------
-- RANKS PER TOURNAMENT  (migration 20261020090000)
-- ----------------------------------------------------------------------------
-- Rank A–D is set for each tournament (only to pair players evenly), not kept on the
-- member: who is "A" changes as the club grows. { "<club_member_id>": "A" | "B" | "C" | "D" }
alter table public.tournaments add column if not exists player_ranks jsonb not null default '{}'::jsonb;
-- club_members.real_rank is no longer shown or edited (kept so nothing is lost).
