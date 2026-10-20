-- Điểm trình: con số Host tự chấm cho từng thành viên (VD 3.25), khác với DUPR người chơi
-- tự nhập (club_members.dupr_level) và DUPR đã xác thực từ DUPR chính thức (dupr_doubles).
-- Bảng điều khiển cộng đồng ở chế độ "theo điểm" xếp Trình độ dựa trên con số này.
alter table public.club_members add column if not exists skill_score numeric(3,2)
  check (skill_score is null or (skill_score >= 1 and skill_score <= 8));
