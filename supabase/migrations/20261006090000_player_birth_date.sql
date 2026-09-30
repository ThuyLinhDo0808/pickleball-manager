-- ----------------------------------------------------------------------------
-- PLAYER BIRTH DATE  (migration 20261006090000)
-- ----------------------------------------------------------------------------
-- Players give their full birth date (not just the year); it fills the club record.
alter table public.player_profiles add column if not exists birth_date date;

notify pgrst, 'reload schema';
