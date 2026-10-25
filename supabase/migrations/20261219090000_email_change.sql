-- Đổi email đăng nhập: the new address waits here until the 6-digit code sent to it is typed.
-- The code is kept only as an HMAC (server key), with an expiry and a try counter.
alter table public.users add column if not exists pending_email text;
alter table public.users add column if not exists pending_email_hash text;
alter table public.users add column if not exists pending_email_until timestamptz;
alter table public.users add column if not exists pending_email_tries integer not null default 0;
