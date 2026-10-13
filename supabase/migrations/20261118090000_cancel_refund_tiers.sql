-- Huỷ kèo theo mốc hoàn phí (Club Manager + Social Manager).
--   events.cancel_deadline_hours  = huỷ trước X giờ → hoàn 100% (đã có, mặc định form 12)
--   events.cancel_half_hours      = huỷ trước Y giờ → hoàn 50% (mới; null = không có mốc 50%)
--   sau mốc cuối → không hoàn (tính là huỷ muộn)
-- Mỗi lần huỷ ghi: phần trăm hoàn, lý do, ai huỷ — để người chơi xem lại trong lịch sử và
-- Host biết người này hay huỷ khi họ đăng ký lần sau.
alter table public.events add column if not exists cancel_half_hours smallint;
alter table public.events drop constraint if exists events_cancel_half_hours_check;
alter table public.events add constraint events_cancel_half_hours_check
  check (cancel_half_hours is null or (cancel_half_hours between 0 and 168));

alter table public.event_participants add column if not exists refund_percent smallint;
alter table public.event_participants drop constraint if exists event_participants_refund_percent_check;
alter table public.event_participants add constraint event_participants_refund_percent_check
  check (refund_percent is null or refund_percent in (0, 50, 100));
alter table public.event_participants add column if not exists cancel_reason text;
alter table public.event_participants drop constraint if exists event_participants_cancel_reason_check;
alter table public.event_participants add constraint event_participants_cancel_reason_check
  check (cancel_reason is null or char_length(cancel_reason) <= 300);
alter table public.event_participants add column if not exists cancelled_by text;
alter table public.event_participants drop constraint if exists event_participants_cancelled_by_check;
alter table public.event_participants add constraint event_participants_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('player', 'host'));

-- Huỷ cũ: huỷ muộn = không hoàn, huỷ đúng hạn = hoàn đủ.
update public.event_participants
   set refund_percent = case when late_cancel then 0 else 100 end
 where status = 'cancelled' and refund_percent is null;

create index if not exists event_participants_cancel_user_idx on public.event_participants (user_id) where status = 'cancelled';

-- v_event_summary selects e.*: rebuild it for the new events column (caller's rights,
-- no browser access — same as the security lockdown).
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
