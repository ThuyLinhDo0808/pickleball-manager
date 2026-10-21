-- Hạng hội viên của gói: Bạc / Vàng / Kim cương (Host chọn khi tạo gói, cùng với tên, số buổi,
-- hạn dùng). Bảng thành viên hiện hạng của gói đang dùng ở cột Hội viên.
alter table public.membership_plans add column if not exists tier text
  check (tier is null or tier in ('silver', 'gold', 'diamond'));

notify pgrst, 'reload schema';
