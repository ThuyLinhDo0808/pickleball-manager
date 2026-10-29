-- Quà sinh nhật (Host tặng thành viên): miễn phí 1 buổi, giảm %, hoặc một món quà tại sân,
-- kèm lời chúc và hạn dùng. Người chơi thấy trên chuông và trang Tổng quan; Host đánh dấu
-- "Đã dùng" khi người chơi nhận quà / dùng ưu đãi. Một thành viên một quà sinh nhật mỗi năm.
create table if not exists public.member_gifts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  occasion text not null default 'birthday' check (occasion in ('birthday')),
  year int not null check (year between 2000 and 2100),
  kind text not null check (kind in ('free_session','percent','item')),
  percent int check (percent is null or percent between 1 and 100),
  item text check (item is null or length(item) <= 120),
  message text check (message is null or length(message) <= 500),
  expires_on date,
  used_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (club_member_id, occasion, year)
);
create index if not exists ix_member_gifts_club on public.member_gifts (club_id, year);
create index if not exists ix_member_gifts_user on public.member_gifts (user_id) where user_id is not null;
alter table public.member_gifts enable row level security;
-- Only the backend (service key) reads / writes; no policy for anon / authenticated.
revoke all on public.member_gifts from anon, authenticated;
