-- Coach Manager: liên kết Coach ↔ CLB / cộng đồng. Coach xin liên kết (hoặc Host mời),
-- bên kia đồng ý. Khi đã liên kết: Host xem học viên của Coach là thành viên CLB (tên,
-- trình, số buổi đi học, số buổi còn trong gói — không số điện thoại, không ghi chú của
-- Coach); Coach xem danh sách thành viên CLB (tên, giới tính, trình / DUPR — không số
-- điện thoại) và thêm một thành viên làm học viên.
create table if not exists public.coach_club_links (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','active','declined')),
  requested_by text not null check (requested_by in ('coach','host')),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (coach_id, club_id)
);
create index if not exists ix_coach_club_links_club on public.coach_club_links (club_id, status);
alter table public.coach_club_links enable row level security;
-- Only the backend (service key) reads / writes; no policy for anon / authenticated.
revoke all on public.coach_club_links from anon, authenticated;

-- A student added from a club's member list keeps the member it came from (so the Host
-- sees them even without an account).
alter table public.coach_students add column if not exists club_member_id uuid references public.club_members(id) on delete set null;
create index if not exists ix_coach_students_member on public.coach_students (club_member_id) where club_member_id is not null;
