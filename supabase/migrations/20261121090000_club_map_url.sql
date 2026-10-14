-- Link Google Maps của sân / cụm sân cho CLB và cộng đồng: khai khi đăng ký, sửa trong
-- CLB của tôi, hiện ở trang tìm CLB và trang CLB của thành viên (nút Chỉ đường).
alter table public.club_requests add column if not exists map_url text
  check (map_url is null or (char_length(map_url) <= 500 and map_url ~* '^https://'));
alter table public.clubs add column if not exists map_url text
  check (map_url is null or (char_length(map_url) <= 500 and map_url ~* '^https://'));

notify pgrst, 'reload schema';
