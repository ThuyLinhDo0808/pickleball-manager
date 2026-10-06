-- ----------------------------------------------------------------------------
-- MEETING MONEY  (migration 20261021090000)
-- ----------------------------------------------------------------------------
-- A club meeting / get-together (events.kind = 'meeting') keeps its own small cash
-- box: what each person transferred and sponsored, guests a member brings (each one
-- costs the inviter one more share of the fee), what was spent, and how the result
-- was settled (surplus into the club fund; a deficit covered by a sponsor, the fund,
-- or split between the people who came).
create table if not exists public.meeting_money (
  event_id uuid not null references public.events(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  paid_amount numeric(12,0) not null default 0 check (paid_amount >= 0),
  sponsor_amount numeric(12,0) not null default 0 check (sponsor_amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (event_id, club_member_id)
);
create table if not exists public.meeting_guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 120),
  invited_by uuid not null references public.club_members(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ix_meeting_guests_event on public.meeting_guests (event_id);
create table if not exists public.meeting_expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null check (length(label) between 1 and 200),
  amount numeric(12,0) not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ix_meeting_expenses_event on public.meeting_expenses (event_id);
-- { mode: to_fund | from_fund | sponsor | split, amount, txn_id?, member_id?, per_person?, at }
alter table public.events add column if not exists meeting_settlement jsonb;

alter table public.meeting_money enable row level security;
alter table public.meeting_guests enable row level security;
alter table public.meeting_expenses enable row level security;
drop policy if exists p_meeting_money_owner on public.meeting_money;
create policy p_meeting_money_owner on public.meeting_money for select
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
drop policy if exists p_meeting_guests_owner on public.meeting_guests;
create policy p_meeting_guests_owner on public.meeting_guests for select
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
drop policy if exists p_meeting_expenses_owner on public.meeting_expenses;
create policy p_meeting_expenses_owner on public.meeting_expenses for select
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
