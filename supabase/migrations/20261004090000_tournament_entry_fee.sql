-- ----------------------------------------------------------------------------
-- TOURNAMENT ENTRY FEE  (migration 20261004090000)
-- ----------------------------------------------------------------------------
alter table public.tournaments add column if not exists entry_fee numeric(12,0) not null default 0
  check (entry_fee >= 0);

notify pgrst, 'reload schema';
