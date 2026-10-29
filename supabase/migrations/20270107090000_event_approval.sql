-- Co-host (đồng quản trị) tạo kèo → chờ Host duyệt. Kèo chờ duyệt ở trạng thái nháp (không
-- ai đăng ký được); Host bấm Duyệt thì kèo mở theo trạng thái co-host đã chọn, Từ chối thì
-- kèo bị xoá.
alter table public.events add column if not exists approval text check (approval is null or approval in ('pending'));
alter table public.events add column if not exists requested_by uuid references public.users(id) on delete set null;
alter table public.events add column if not exists requested_status text;
create index if not exists ix_events_approval on public.events (club_id) where approval = 'pending';

-- v_event_summary lists e.*: rebuild it so the new columns show up.
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
