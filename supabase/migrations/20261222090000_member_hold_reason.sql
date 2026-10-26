-- Thành viên "tạm nghỉ" (chấn thương, đi xa / công tác, bận việc, lý do khác): Ban quản trị
-- đánh dấu ở Sửa thành viên, và người đó không bị tự chuyển xuống vãng lai dù lâu không
-- chơi. Safe to run more than once.
alter table public.club_members add column if not exists hold_reason text
  check (hold_reason is null or hold_reason in ('injury', 'away', 'busy', 'other'));
