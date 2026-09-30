-- ----------------------------------------------------------------------------
-- TOURNAMENT ENTRY FEES  (migration 20261005090000)
-- ----------------------------------------------------------------------------
-- Fee per player (also in 20261004090000; repeated so either file alone is enough).
alter table public.tournaments add column if not exists entry_fee numeric(12,0) not null default 0
  check (entry_fee >= 0);

-- Who has paid the entry fee; each payment is a club-fund income (voided if unmarked).
create table if not exists public.tournament_fee_payments (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  amount numeric(12,0) not null default 0 check (amount >= 0),
  transaction_id uuid references public.transactions(id) on delete set null,
  paid_at timestamptz not null default now(),
  primary key (tournament_id, club_member_id)
);
alter table public.tournament_fee_payments enable row level security;
drop policy if exists p_tfee_owner on public.tournament_fee_payments;
create policy p_tfee_owner on public.tournament_fee_payments for all
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()));

notify pgrst, 'reload schema';
