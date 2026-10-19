-- DUPR ID cho người đặt nhanh (không tài khoản) + điểm DUPR dùng chung theo DUPR ID.
--  * event_participants.dupr_id: DUPR ID người chơi tự nhập khi đặt nhanh (không bắt buộc) —
--    dùng khi xuất trận gửi DUPR mà không cần lưu họ thành thành viên.
--  * event_guest_bookings.contact_dupr_id: DUPR ID của người đặt.
--  * Điểm dùng chung: khi một CLB / cộng đồng nhập file DUPR, điểm mới được chép sang mọi
--    thành viên mang cùng DUPR ID ở các CLB / cộng đồng khác (không lưu / không hiện nguồn).
--    Index để tìm theo DUPR ID trên toàn bộ dữ liệu.
alter table public.event_participants add column if not exists dupr_id text
  check (dupr_id is null or dupr_id ~ '^[A-Z0-9]{4,10}$');
alter table public.event_guest_bookings add column if not exists contact_dupr_id text
  check (contact_dupr_id is null or contact_dupr_id ~ '^[A-Z0-9]{4,10}$');
create index if not exists club_members_dupr_id_idx on public.club_members (dupr_id) where dupr_id is not null;
create index if not exists club_dupr_roster_dupr_id_idx on public.club_dupr_roster (dupr_id);
create index if not exists player_profiles_dupr_id_idx on public.player_profiles (dupr_id) where dupr_id is not null;

notify pgrst, 'reload schema';
