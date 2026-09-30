-- Activities & team tournaments: event kinds (weekly / game / training / meeting / challenge),
-- club join requests, dated tournaments with divisions, team leagues with sub-matches.
-- Safe to re-run. database/schema.sql carries the same changes for fresh installs.

-- What an event is: weekly club session, a game ("kèo"), training, meeting, or a
-- friendly challenge between members. Club events that existed before are weekly sessions.
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'kind') then
    alter table public.events add column kind text not null default 'game'
      check (kind in ('weekly','game','training','meeting','challenge'));
    update public.events set kind = 'weekly' where club_id is not null;
  end if;
end $$;

drop view if exists public.v_event_summary;
create view public.v_event_summary as
select
  e.*,
  c.name as club_name,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text in ('registered','checked_in','pending')) as main_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status = 'waitlisted') as waitlist_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text = 'pending') as pending_count
from public.events e
left join public.clubs c on c.id = e.club_id;

-- -- ACTIVITIES & TEAM TOURNAMENTS
-- ----------------------------------------------------------------------------
-- A player asked to join the club from an event page and no member had their phone:
-- a member record was created for the request. Rejecting it deletes the record.
alter table public.club_members add column if not exists join_requested boolean not null default false;


-- Tournaments: 'pairs' (singles / fixed pairs, groups -> knockout) or 'team' (teams of
-- 4-8 play fixtures made of several sub-matches). Dated so they show on the calendar.
alter table public.tournaments add column if not exists kind text not null default 'pairs' check (kind in ('pairs','team'));
alter table public.tournaments add column if not exists division text not null default 'open' check (division in ('open','men','women'));
alter table public.tournaments add column if not exists event_date date;
alter table public.tournaments add column if not exists start_time time;
alter table public.tournaments add column if not exists end_time time;
alter table public.tournaments add column if not exists location text;
alter table public.tournaments add column if not exists win_rule text not null default 'sub_wins' check (win_rule in ('sub_wins','points'));
alter table public.tournaments add column if not exists sub_formats text[] not null default '{}';

create table if not exists public.tournament_team_members (
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  primary key (team_id, club_member_id)
);

-- One sub-match of a team fixture (the fixture is a tournament_matches row).
create table if not exists public.tournament_sub_matches (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.tournament_matches(id) on delete cascade,
  slot int not null,
  format text not null check (format in ('mens','womens','mixed','doubles','singles')),
  team1_p1 uuid references public.club_members(id) on delete set null,
  team1_p2 uuid references public.club_members(id) on delete set null,
  team2_p1 uuid references public.club_members(id) on delete set null,
  team2_p2 uuid references public.club_members(id) on delete set null,
  team1_score int check (team1_score between 0 and 99),
  team2_score int check (team2_score between 0 and 99),
  played_at timestamptz
);
create index if not exists ix_sub_matches_fixture on public.tournament_sub_matches (fixture_id);

alter table public.tournament_team_members enable row level security;
alter table public.tournament_sub_matches enable row level security;
drop policy if exists p_tteam_members_owner on public.tournament_team_members;
create policy p_tteam_members_owner on public.tournament_team_members for all
  using (exists (select 1 from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id where tt.id = team_id and t.host_id = auth.uid()))
  with check (exists (select 1 from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id where tt.id = team_id and t.host_id = auth.uid()));
drop policy if exists p_tsub_owner on public.tournament_sub_matches;
create policy p_tsub_owner on public.tournament_sub_matches for all
  using (exists (select 1 from public.tournament_matches m join public.tournaments t on t.id = m.tournament_id where m.id = fixture_id and t.host_id = auth.uid()))
  with check (exists (select 1 from public.tournament_matches m join public.tournaments t on t.id = m.tournament_id where m.id = fixture_id and t.host_id = auth.uid()));


notify pgrst, 'reload schema';
