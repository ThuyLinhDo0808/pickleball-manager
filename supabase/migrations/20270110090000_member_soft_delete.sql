-- Xoá mềm thành viên, khôi phục trong 30 ngày.
-- Bảng thật đổi tên thành club_members_all và có thêm deleted_at / deleted_by. Tên cũ
-- club_members trở thành một VIEW chỉ gồm người chưa xoá (deleted_at is null), nên mọi
-- chỗ đang đọc / ghi club_members (backend, view, hàm) tự bỏ qua người đã xoá mà không
-- phải sửa từng chỗ. Khôi phục và dọn hẳn sau 30 ngày làm trên club_members_all.
-- Lưu ý cho migration sau: thêm cột thì ALTER TABLE public.club_members_all rồi chạy lại
-- khối "create or replace view public.club_members" ở cuối file này (view chụp danh sách
-- cột lúc tạo).
do $$
begin
  if to_regclass('public.club_members_all') is null then
    alter table public.club_members rename to club_members_all;
  end if;
end $$;

alter table public.club_members_all add column if not exists deleted_at timestamptz;
alter table public.club_members_all add column if not exists deleted_by text;
create index if not exists ix_club_members_deleted on public.club_members_all (club_id, deleted_at) where deleted_at is not null;

-- One account / one DUPR ID per club counts only people still on the list (someone
-- deleted can join again; restoring checks for a clash).
drop index if exists public.ux_club_members_club_user;
create unique index if not exists ux_club_members_club_user on public.club_members_all (club_id, user_id) where user_id is not null and deleted_at is null;
drop index if exists public.club_members_dupr_id_uq;
create unique index if not exists club_members_dupr_id_uq on public.club_members_all (club_id, dupr_id) where dupr_id is not null and deleted_at is null;

create or replace view public.club_members with (security_invoker = true) as
  select * from public.club_members_all where deleted_at is null;
-- Only the backend (service key) reads / writes, as before.
revoke all on public.club_members from anon, authenticated;
revoke all on public.club_members_all from anon, authenticated;
grant select, insert, update, delete on public.club_members to service_role;
grant select, insert, update, delete on public.club_members_all to service_role;

-- Views that count members: rebuilt so they read the view (people not deleted).
create or replace view public.v_host_capacity_usage with (security_invoker = true) as
select
  h.host_id,
  h.tier,
  h.capacity_limit,
  coalesce(cm.member_count, 0) + coalesce(ep.participant_count, 0) as used,
  h.capacity_limit - (coalesce(cm.member_count, 0) + coalesce(ep.participant_count, 0)) as remaining
from public.host_subscriptions h
left join (
  select c.host_id, count(m.id) as member_count
  from public.clubs c
  join public.club_members m on m.club_id = c.id and m.is_active = true and m.member_type = 'fixed'
  group by c.host_id
) cm on cm.host_id = h.host_id
left join (
  select e.host_id, count(p.id) as participant_count
  from public.events e
  join public.event_participants p on p.event_id = e.id
    and p.status::text in ('registered','waitlisted','checked_in','pending')
  where e.status in ('draft','open','closed')
    and e.event_date >= current_date - 1
  group by e.host_id
) ep on ep.host_id = h.host_id;

create or replace view public.v_club_rankings_all_time with (security_invoker = true) as
select
  cm.id as club_member_id,
  cm.club_id,
  cm.full_name,
  count(*) filter (where mp.team = case when m.team1_score > m.team2_score then 1
                                          when m.team2_score > m.team1_score then 2 else 0 end) as wins,
  count(*) as matches_played,
  sum(case when mp.team = 1 then m.team1_score else m.team2_score end) as points_scored,
  sum(case when mp.team = 1 then m.team2_score else m.team1_score end) as points_lost
from public.club_members cm
join public.match_players mp on mp.club_member_id = cm.id
join public.matches m on m.id = mp.match_id
where m.team1_score is not null and m.team2_score is not null
group by cm.id, cm.club_id, cm.full_name;

create or replace view public.v_club_rankings_monthly with (security_invoker = true) as
select
  cm.id as club_member_id,
  cm.club_id,
  cm.full_name,
  date_trunc('month', m.played_at) as month,
  count(*) filter (where mp.team = case when m.team1_score > m.team2_score then 1
                                          when m.team2_score > m.team1_score then 2 else 0 end) as wins,
  count(*) as matches_played,
  sum(case when mp.team = 1 then m.team1_score else m.team2_score end) as points_scored,
  sum(case when mp.team = 1 then m.team2_score else m.team1_score end) as points_lost
from public.club_members cm
join public.match_players mp on mp.club_member_id = cm.id
join public.matches m on m.id = mp.match_id
where m.team1_score is not null and m.team2_score is not null
group by cm.id, cm.club_id, cm.full_name, date_trunc('month', m.played_at);
