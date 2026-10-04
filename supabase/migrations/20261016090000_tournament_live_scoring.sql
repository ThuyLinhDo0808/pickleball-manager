-- ----------------------------------------------------------------------------
-- TOURNAMENT LIVE SCORING  (migration 20261016090000)
-- ----------------------------------------------------------------------------
-- One row per tournament match (or team-league sub-match) being scored point by point.
-- The score is rebuilt from `log` (one event per rally / serve choice, see
-- backend/src/services/liveScore.js), so undo = drop the last event.
create table if not exists public.tournament_live (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid references public.tournament_matches(id) on delete cascade,
  sub_match_id uuid references public.tournament_sub_matches(id) on delete cascade,
  court text,
  config jsonb not null,
  players jsonb not null default '{}'::jsonb,
  log text[] not null default '{}',
  status text not null default 'live' check (status in ('live','saved')),
  scorer_name text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((match_id is null) <> (sub_match_id is null))
);
create unique index if not exists ux_tlive_match on public.tournament_live (match_id) where match_id is not null;
create unique index if not exists ux_tlive_sub on public.tournament_live (sub_match_id) where sub_match_id is not null;
create index if not exists ix_tlive_tournament on public.tournament_live (tournament_id);
alter table public.tournament_live enable row level security;
drop policy if exists p_tlive_owner on public.tournament_live;
create policy p_tlive_owner on public.tournament_live for all
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()));

-- Public live board link (/live/<token>): off until the Host turns it on.
alter table public.tournaments add column if not exists live_token text;
create unique index if not exists ux_tournaments_live_token on public.tournaments (live_token) where live_token is not null;
