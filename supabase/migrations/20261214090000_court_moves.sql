-- Host moves a player to another court: when, and from which court group (the player sees
-- "Bạn đã được chuyển sang sân …" on the kèo page and in the bell).
alter table public.event_participants add column if not exists group_moved_at timestamptz;
alter table public.event_participants add column if not exists group_moved_from text;
notify pgrst, 'reload schema';
