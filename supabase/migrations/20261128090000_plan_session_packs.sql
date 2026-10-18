-- Session packs (Social Manager): a plan can be "N sessions, valid for M months from the day it
-- starts" (e.g. VIP 1 = 10 sessions within 6 months for 300,000đ) instead of a month / quarter /
-- year period. validity_months set = a pack; null = the old period plan (clubs).
alter table public.membership_plans add column if not exists validity_months int
  check (validity_months is null or validity_months between 1 and 36);
