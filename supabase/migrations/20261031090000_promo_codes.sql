-- Promo codes (Owner Console → Khuyến mãi).
--   percent: X% off a plan order (bank transfer), optionally only for a first order.
--   trial:   switches a plan on for N days at once, then it drops back to Free.
-- Each code: optional expiry date and maximum number of uses; one use per Host.

create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  kind text not null check (kind in ('percent', 'trial')),
  percent int check (percent between 1 and 100),
  applies_to text not null default 'any' check (applies_to in ('any', 'tier', 'social_manager')),
  trial_tier subscription_tier,
  trial_days int check (trial_days between 1 and 365),
  expires_on date,
  max_uses int check (max_uses > 0),
  first_order_only boolean not null default false,
  active boolean not null default true,
  note text check (char_length(note) <= 300),
  created_by text,
  created_at timestamptz not null default now(),
  constraint promo_kind_fields check (
    (kind = 'percent' and percent is not null) or
    (kind = 'trial' and trial_tier is not null and trial_tier <> 'free' and trial_days is not null)
  )
);

-- A use: reserved when a discounted order is created (freed again if that order is
-- cancelled), or right away for a trial code.
create table if not exists promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references promo_codes(id) on delete cascade,
  host_id uuid not null references users(id) on delete cascade,
  payment_id uuid references plan_payments(id) on delete set null,
  discount_amount int not null default 0,
  created_at timestamptz not null default now(),
  unique (code_id, host_id)
);
create index if not exists promo_redemptions_code_idx on promo_redemptions(code_id);

alter table plan_payments add column if not exists promo_code_id uuid references promo_codes(id) on delete set null;
alter table plan_payments add column if not exists discount_amount int not null default 0;

alter table promo_codes enable row level security;
alter table promo_redemptions enable row level security;
revoke all on promo_codes, promo_redemptions from anon, authenticated;
