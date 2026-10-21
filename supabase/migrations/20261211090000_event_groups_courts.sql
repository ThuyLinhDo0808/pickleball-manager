-- Kèo nhiều nhóm giờ (VD thứ 7: 17h–20h 120k/slot, 18h–20h 100k/slot), sân số và xếp sân.
-- events.groups: [{id, start_time, end_time, fee_amount, slots, courts}] — người đăng ký chọn
--   một nhóm; events.slots / start_time / end_time / fee_amount là tổng / sớm nhất / muộn nhất / rẻ nhất.
-- events.court_labels: số hiệu sân (VD "2, 3"), không phải số lượng sân.
-- event_participants.group_id: nhóm người chơi đã chọn; court: sân Host xếp cho người đó.
alter table public.events add column if not exists groups jsonb;
alter table public.events add column if not exists court_labels text
  check (court_labels is null or char_length(court_labels) <= 120);
alter table public.event_participants add column if not exists group_id text
  check (group_id is null or char_length(group_id) <= 20);
alter table public.event_participants add column if not exists court text
  check (court is null or char_length(court) <= 20);

-- v_event_summary lists e.*: rebuild it so the new columns show up (public page, lists).
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

notify pgrst, 'reload schema';
