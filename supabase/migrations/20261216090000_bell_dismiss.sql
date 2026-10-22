-- Player bell: notifications a player removed. The bell's items are worked out from sign-ups,
-- court moves, club messages and link requests, so removing one only hides it: `bell_hidden`
-- keeps the removed item ids (newest 200), `bell_cleared_at` hides everything up to "Xóa tất cả".
alter table public.users add column if not exists bell_cleared_at timestamptz;
alter table public.users add column if not exists bell_hidden text[] not null default '{}';

notify pgrst, 'reload schema';
