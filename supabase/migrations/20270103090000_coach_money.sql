-- Coach Manager (đợt C5): students buy packages themselves (transfer + screenshot, the
-- coach confirms), partial refunds, and the coach's own ledger.
--
-- The coach's ledger is its own table (not public.transactions): transactions is tied to a
-- club or an event by an enum + check constraint and is read by every club view; a coach
-- book beside it keeps the club money untouched. Same rules: entries are never edited in
-- amount / type, a mistake is voided; "excluded" leaves an entry out of the totals.
alter table public.coach_package_purchases add column if not exists source text not null default 'coach' check (source in ('coach','student'));
alter table public.coach_package_purchases add column if not exists payment_ref text;
alter table public.coach_package_purchases add column if not exists payment_proof text;          -- data URL, ≤ 400 KB, deleted after the retention period
alter table public.coach_package_purchases add column if not exists proof_submitted_at timestamptz;
alter table public.coach_package_purchases add column if not exists proof_purged_at timestamptz;
alter table public.coach_package_purchases add column if not exists reject_note text check (reject_note is null or length(reject_note) <= 300);
alter table public.coach_package_purchases add column if not exists decided_at timestamptz;

alter table public.coach_session_fees add column if not exists ledger_id uuid;
alter table public.coach_package_purchases add column if not exists ledger_id uuid;
alter table public.coach_package_purchases add column if not exists refund_ledger_id uuid;

create table if not exists public.coach_ledger (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  type text not null check (type in ('income','expense')),
  category text not null default 'other' check (category in ('package','session_fee','refund','court','equipment','other')),
  amount int not null check (amount >= 0),
  note text check (note is null or length(note) <= 300),
  occurred_on date not null default current_date,
  student_id uuid references public.coach_students(id) on delete set null,
  purchase_id uuid references public.coach_package_purchases(id) on delete set null,
  fee_id uuid references public.coach_session_fees(id) on delete set null,
  auto boolean not null default false,          -- written by the app (package paid, fee paid, refund)
  excluded boolean not null default false,      -- "không tính vào sổ thu chi"
  is_voided boolean not null default false,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ix_coach_ledger_coach on public.coach_ledger (coach_id, occurred_on desc);

create or replace function public.block_coach_ledger_mutation() returns trigger
language plpgsql as $$
begin
  if (old.amount, old.type, old.coach_id) is distinct from (new.amount, new.type, new.coach_id) then
    raise exception 'coach_ledger is append-only: amount/type cannot be changed, void instead';
  end if;
  return new;
end; $$;
drop trigger if exists trg_block_coach_ledger_mutation on public.coach_ledger;
create trigger trg_block_coach_ledger_mutation before update on public.coach_ledger
  for each row execute function public.block_coach_ledger_mutation();

alter table public.coach_ledger enable row level security;
revoke all on public.coach_ledger from anon, authenticated;
