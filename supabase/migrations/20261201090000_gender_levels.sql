-- Trình độ chia riêng Nam / Nữ (Bảng điều khiển cộng đồng): mỗi kèo có thể có khoảng DUPR
-- riêng cho nữ (level_min_f / level_max_f); để trống = dùng chung khoảng level_min / level_max.
-- VD Series A: Nam 3.0 – 3.5, Nữ 2.8 – 3.0. Cách chia (by_gender, f_min / f_max) lưu trong
-- clubs.community_settings (jsonb), không cần cột mới.
alter table public.events add column if not exists level_min_f numeric(3,2)
  check (level_min_f is null or (level_min_f >= 0 and level_min_f <= 8));
alter table public.events add column if not exists level_max_f numeric(3,2)
  check (level_max_f is null or (level_max_f >= 0 and level_max_f <= 8));

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
