-- ----------------------------------------------------------------------------
-- PAID PLAN UPGRADES  (migration 20261025090000)
-- ----------------------------------------------------------------------------
-- Upgrading a plan / turning on Social Manager is paid by bank transfer (VietQR) to
-- the app operator. Each order has a short code for the transfer note; the operator
-- confirms the money arrived, which switches the plan on until `*_paid_until`.
alter table public.host_subscriptions add column if not exists tier_paid_until date;
alter table public.host_subscriptions add column if not exists social_manager_paid_until date;

create table if not exists public.plan_payments (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('tier','social_manager')),
  tier subscription_tier,
  months int not null check (months between 1 and 24),
  amount numeric(12,0) not null check (amount >= 0),
  ref text not null unique,
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by text,
  check (kind = 'social_manager' or tier is not null)
);
create index if not exists ix_plan_payments_host on public.plan_payments (host_id, status);
create index if not exists ix_plan_payments_status on public.plan_payments (status, created_at);
-- Only the backend (service role) reads and writes orders.
alter table public.plan_payments enable row level security;
revoke all on public.plan_payments from anon, authenticated;
