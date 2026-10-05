-- ----------------------------------------------------------------------------
-- MATCH TIMING + SCORE FORMAT  (migration 20261017090000)
-- ----------------------------------------------------------------------------
-- Live scoring keeps the time of every event (epoch ms, same order as `log`), so the
-- app knows when the match / each game started and ended.
alter table public.tournament_live add column if not exists stamps bigint[] not null default '{}';
-- How long a match took (seconds; from live scoring or typed in) and the format its games
-- were played to ({ points, win_by, best_of, scoring }), so a later edit checks the score
-- against the right rules (e.g. badminton games to 15).
alter table public.tournament_matches add column if not exists duration_sec int;
alter table public.tournament_matches add column if not exists score_format jsonb;
alter table public.tournament_sub_matches add column if not exists duration_sec int;
alter table public.tournament_sub_matches add column if not exists score_format jsonb;
do $$ begin
  alter table public.tournament_matches add constraint chk_tmatch_duration check (duration_sec is null or duration_sec between 0 and 86400);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tournament_sub_matches add constraint chk_tsub_duration check (duration_sec is null or duration_sec between 0 and 86400);
exception when duplicate_object then null; end $$;
