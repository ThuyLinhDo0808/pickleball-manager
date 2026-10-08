-- ----------------------------------------------------------------------------
-- EMAIL NOTICES TO PLAYERS  (migration 20261024090000)
-- ----------------------------------------------------------------------------
-- The Host turns emails to players on (off by default — it needs the app's own
-- domain verified on Resend). Each player can opt out of them.
alter table public.users add column if not exists notify_players_email boolean not null default false;
alter table public.player_profiles add column if not exists email_notices boolean not null default true;
