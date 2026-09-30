-- ----------------------------------------------------------------------------
-- PLAYER PRIVACY  (migration 20261007090000)
-- ----------------------------------------------------------------------------
-- A player can hide their name on public sign-up pages (applies where the host's plan
-- includes the privacy feature); the host still sees the real name.
alter table public.player_profiles add column if not exists hide_identity boolean not null default false;

notify pgrst, 'reload schema';
