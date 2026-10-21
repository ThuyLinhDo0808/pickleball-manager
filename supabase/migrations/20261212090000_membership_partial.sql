-- Gói tháng mua giữa tháng: hội viên chỉ mua phần còn lại của tháng (VD mua sau 1 tuần → 4 buổi).
-- memberships.sessions_included: số buổi của lần mua này (null = theo gói). Ngày bắt đầu là ngày mua
-- (starts_on), ngày kết thúc vẫn là cuối kỳ của gói.
alter table public.memberships add column if not exists sessions_included int
  check (sessions_included is null or sessions_included between 1 and 1000);

create or replace view public.v_membership_status as
select
  m.id as membership_id,
  m.club_member_id,
  m.plan_id,
  m.period_label,
  m.starts_on,
  m.ends_on,
  m.status,
  m.amount,
  -- unlimited plans (0) stay unlimited; otherwise this purchase's own count when set
  case when p.sessions_included = 0 then 0 else coalesce(m.sessions_included, p.sessions_included) end as sessions_included,
  coalesce(s.used_count, 0) as sessions_used,
  greatest((case when p.sessions_included = 0 then 0 else coalesce(m.sessions_included, p.sessions_included) end) - coalesce(s.used_count, 0), 0) as sessions_remaining
from public.memberships m
join public.membership_plans p on p.id = m.plan_id
left join (
  select membership_id, count(*) as used_count
  from public.membership_sessions
  group by membership_id
) s on s.membership_id = m.id;

notify pgrst, 'reload schema';
