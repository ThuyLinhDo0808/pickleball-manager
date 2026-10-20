-- "Không hoàn tiền": a kèo where a player who cancels gets nothing back, whenever they cancel
-- (the Host's choice, default for new kèo set in the community control panel).
alter table public.events add column if not exists no_refund boolean not null default false;

-- v_event_summary lists e.*: rebuild it so the new column shows up.
drop view if exists public.v_event_summary;
create view public.v_event_summary with (security_invoker = true) as
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
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.v_event_summary from %I', r);
    end if;
  end loop;
end $$;
