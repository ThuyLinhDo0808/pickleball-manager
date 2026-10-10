-- Social Manager v8: communities ("cộng đồng xé vé", one per court cluster). A community
-- is a club of kind 'community': it has every Club Manager feature (members, plans,
-- schedule, tournaments, finance, ball store, staff…) and lives in the Social Manager
-- space. Its kèo can be grouped into series (Series A, B, C…).

alter table public.clubs add column if not exists kind text not null default 'club'
  check (kind in ('club', 'community'));
create index if not exists ix_clubs_kind on public.clubs (host_id, kind);

-- What a request asks for: a club or a community.
alter table public.club_requests add column if not exists kind text not null default 'club'
  check (kind in ('club', 'community'));

-- Series a community's kèo belong to (e.g. "Series A").
alter table public.events add column if not exists series_label text
  check (series_label is null or char_length(series_label) between 1 and 40);
create index if not exists ix_events_series_label on public.events (club_id, series_label) where series_label is not null;

-- v_event_summary selects e.*: rebuild it for the new events column.
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
     where p.event_id = e.id and p.status::text = 'pending') as pending_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text = 'requested') as requested_count
from public.events e
left join public.clubs c on c.id = e.club_id;

notify pgrst, 'reload schema';
