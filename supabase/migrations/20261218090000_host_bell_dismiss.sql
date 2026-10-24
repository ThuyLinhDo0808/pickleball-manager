-- Host bell (sign-ups, transfers, cancels, join requests): notifications the Host removed.
-- Kept apart from the player bell, since one account can be both. `host_bell_hidden` keeps
-- the removed item keys (newest 300), `host_bell_cleared_at` hides everything up to "Xóa tất cả".
alter table public.users add column if not exists host_bell_cleared_at timestamptz;
alter table public.users add column if not exists host_bell_hidden text[] not null default '{}';

notify pgrst, 'reload schema';
