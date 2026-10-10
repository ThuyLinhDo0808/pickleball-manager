-- Weekly schedule v5: sessions of one weekly schedule share a series (edit them all at
-- once), what the fee includes, which play format, a Google Maps link for the court,
-- and the costs of each session (court, water…) booked into the ledger automatically.

-- 1. Series: every session created together by "Tạo lịch chơi hàng tuần".
alter table public.events add column if not exists series_id uuid;
create index if not exists ix_events_series on public.events (series_id) where series_id is not null;
-- Older weekly schedules: sessions inserted together share created_at (one insert).
with groups as (
  select club_id, created_at, title, gen_random_uuid() as sid
  from public.events
  where kind = 'weekly' and club_id is not null and series_id is null
  group by club_id, created_at, title
  having count(*) > 1
)
update public.events e set series_id = g.sid
from groups g
where e.series_id is null and e.kind = 'weekly'
  and e.club_id = g.club_id and e.created_at = g.created_at and e.title = g.title;

-- 2. What the fee includes (balls, water, fruit…), shown under the fee.
alter table public.events add column if not exists services text
  check (services is null or char_length(services) <= 300);

-- 3. Play format: full men / full women / mixed / open to all.
alter table public.events add column if not exists play_format text
  check (play_format is null or play_format in ('men', 'women', 'mixed', 'open'));

-- 4. A Google Maps link to the court (otherwise the address is searched on Google Maps).
alter table public.events add column if not exists map_url text
  check (map_url is null or (char_length(map_url) <= 500 and map_url ~* '^https://'));

-- 5. Costs of one session: [{ "category": "court", "amount": 300000, "note": "..." }].
alter table public.events add column if not exists cost_items jsonb not null default '[]'::jsonb;
-- Ledger entries written from those costs (re-written when the costs change).
alter table public.transactions add column if not exists event_cost boolean not null default false;
create index if not exists ix_transactions_event on public.transactions (event_id) where event_id is not null;

-- v_event_summary selects e.*, so rebuild it to include the new columns.
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

notify pgrst, 'reload schema';
