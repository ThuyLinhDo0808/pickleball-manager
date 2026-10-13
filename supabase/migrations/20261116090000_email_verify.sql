-- ----------------------------------------------------------------------------
-- ĐĂNG KÝ NHANH + XÁC NHẬN EMAIL BẰNG MÃ  (migration 20261116090000)
-- ----------------------------------------------------------------------------
-- Sign-up asks only username, password, email and gender; the account works at once and
-- the email is confirmed with a 6-digit code. Until then email_unverified_since is set:
-- one upcoming sign-up, 48 hours, and no rights given by email. Older accounts stay null
-- (= verified).
alter table public.users add column if not exists email_unverified_since timestamptz;
alter table public.users add column if not exists email_verified_at timestamptz;
create index if not exists ix_users_unverified on public.users (email_unverified_since) where email_unverified_since is not null;

notify pgrst, 'reload schema';
