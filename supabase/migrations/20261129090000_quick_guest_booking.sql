-- Đăng ký nhanh bằng link mời (kèo xé vé): Host bật một link mời tự đổi mỗi 30 giây
-- (link lộ ra ngoài hết hạn ngay). Người mở link không cần tài khoản: nhập họ tên, điểm trình
-- tự khai, SĐT, rồi đăng ký N slot (họ tên, giới tính, điểm trình từng người) và chuyển khoản
-- tổng tiền một lần — bỏ qua bước xác nhận thông tin, Host xác nhận tiền là cả nhóm vào danh sách.

-- Khoá bí mật của link mời: có dòng = đang bật. Bảng riêng, chỉ backend đọc (không bao giờ
-- đi kèm dữ liệu kèo trả về cho web). Đổi khoá = mọi link / phiên đang mở hết hiệu lực.
create table if not exists public.event_quick_invites (
  event_id uuid primary key references public.events(id) on delete cascade,
  secret text not null check (char_length(secret) >= 32),
  created_at timestamptz not null default now()
);

create table if not exists public.event_guest_bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  token_hash text not null unique,          -- mã băm của mã truy cập trang đặt chỗ (không lưu mã gốc)
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  contact_phone text not null check (char_length(contact_phone) between 8 and 20),
  contact_level numeric(3,2),               -- điểm trình tự khai
  slots int not null check (slots between 1 and 10),
  amount numeric(12,0) not null default 0,  -- tổng tiền = phí × số slot
  created_at timestamptz not null default now()
);
create index if not exists event_guest_bookings_event_idx on public.event_guest_bookings (event_id);

alter table public.event_participants add column if not exists guest_booking_id uuid references public.event_guest_bookings(id) on delete set null;
alter table public.event_participants add column if not exists gender text check (gender is null or gender in ('male', 'female'));
create index if not exists event_participants_booking_idx on public.event_participants (guest_booking_id) where guest_booking_id is not null;

alter table public.event_guest_bookings enable row level security;
alter table public.event_quick_invites enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.event_guest_bookings from %I', r);
      execute format('revoke all on public.event_quick_invites from %I', r);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
