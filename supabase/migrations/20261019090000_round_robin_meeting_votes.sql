-- ----------------------------------------------------------------------------
-- ROUND ROBIN TOURNAMENTS + MEETING VOTES  (migration 20261019090000)
-- ----------------------------------------------------------------------------
-- Round robin ("vòng tròn tính điểm"): one table, every team plays every other team,
-- no knockout. Stored as group_count = 1 and advance_per_group = 0.
alter table public.tournaments drop constraint if exists tournaments_advance_per_group_check;
alter table public.tournaments add constraint tournaments_advance_per_group_check
  check (advance_per_group between 0 and 8);

-- Meetings / get-togethers (events.kind = 'meeting'): club members vote whether they
-- come. One vote per member per event; the Host can also mark votes for members.
create table if not exists public.event_votes (
  event_id uuid not null references public.events(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  choice text not null check (choice in ('yes','no')),
  by_host boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (event_id, club_member_id)
);
create index if not exists ix_event_votes_member on public.event_votes (club_member_id);
alter table public.event_votes enable row level security;
drop policy if exists p_event_votes_owner on public.event_votes;
create policy p_event_votes_owner on public.event_votes for select
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
