-- ----------------------------------------------------------------------------
-- BÁO LỖI / LIÊN HỆ + ĐÁNH GIÁ SAU BUỔI  (migration 20261115090000)
-- ----------------------------------------------------------------------------
-- "Báo lỗi / Liên hệ": each message has a kind (bug / hard to use / idea / plan &
-- payment / personal data), the page and device it came from, and can be marked as
-- spam. The Owner can stop one account from sending more.
alter table public.feedback add column if not exists category text
  check (category is null or category in ('bug', 'ux', 'idea', 'billing', 'privacy'));
alter table public.feedback add column if not exists page text check (page is null or length(page) <= 200);
alter table public.feedback add column if not exists device text check (device is null or length(device) <= 300);
alter table public.feedback drop constraint if exists feedback_status_check;
alter table public.feedback add constraint feedback_status_check check (status in ('new', 'in_progress', 'closed', 'spam'));
create index if not exists ix_feedback_host_created on public.feedback (host_id, created_at desc);
alter table public.users add column if not exists feedback_blocked_at timestamptz;

-- After-session review: separate stars for the court and for the organisation, and
-- "would you come back to a session like this?". Fixed members get it too now.
alter table public.event_surveys add column if not exists court_rating int
  check (court_rating is null or court_rating between 1 and 5);
alter table public.event_surveys add column if not exists organization_rating int
  check (organization_rating is null or organization_rating between 1 and 5);
alter table public.event_surveys add column if not exists come_back text
  check (come_back is null or come_back in ('yes', 'maybe', 'no'));

notify pgrst, 'reload schema';
