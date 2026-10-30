-- Khảo sát sau buổi chơi (bản 3): câu hỏi mới "Bạn có hài lòng với khâu tổ chức không?"
-- (chưa hài lòng / hài lòng / rất hài lòng) và "Host có xếp trận hợp lý, cân bằng không?"
-- (có / không / vẫn còn vài trận hơi lệch). Câu cũ (chấm sao sân, tổ chức, trình độ) vẫn giữ
-- dữ liệu cũ. clubs.survey_window: khảo sát mở đến khi nào — 'next_session' (trước giờ
-- bắt đầu buổi tiếp theo của CLB / cộng đồng) hoặc '12h' (12 giờ sau khi buổi kết thúc).
alter table public.event_surveys add column if not exists org_satisfaction text check (org_satisfaction is null or org_satisfaction in ('no','yes','very'));
alter table public.event_surveys add column if not exists match_balance text check (match_balance is null or match_balance in ('yes','no','some'));
alter table public.clubs add column if not exists survey_window text not null default 'next_session' check (survey_window in ('next_session','12h'));
