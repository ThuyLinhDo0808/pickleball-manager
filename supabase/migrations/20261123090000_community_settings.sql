-- Bảng điều khiển của cộng đồng (Social Manager): Host tự đặt
--  * ngưỡng khách thường xuyên (≥ N buổi / 30 ngày) và bật / tắt tự xếp thường xuyên ↔ vãng lai,
--  * số ngày không tham gia thì tính là "không hoạt động",
--  * cách chia trình độ: tự đặt tên (gán tay) / theo điểm DUPR (cầu lông: cấp) / theo thời gian đã chơi.
-- club_members.level_key: trình độ Host gán tay; events.level_keys: kèo dành cho trình độ nào.
alter table public.clubs add column if not exists community_settings jsonb not null default '{}'::jsonb;
alter table public.club_members add column if not exists level_key text
  check (level_key is null or char_length(level_key) <= 20);
alter table public.events add column if not exists level_keys text[]
  check (level_keys is null or cardinality(level_keys) <= 12);

notify pgrst, 'reload schema';
