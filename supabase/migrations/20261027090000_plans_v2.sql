-- ----------------------------------------------------------------------------
-- PLANS V2  (migration 20261027090000)
-- ----------------------------------------------------------------------------
-- Five plans per account: free / basic / standard / advanced / pro. Each limits the
-- clubs an account may own and the official / guest members per club, and unlocks
-- features (see backend/src/services/planFeatures.js). A new organiser tries Standard
-- for 14 days (trial_*), then drops to Free unless they pay.
alter type subscription_tier add value if not exists 'advanced' before 'pro';

alter table public.host_subscriptions add column if not exists trial_started_at timestamptz;
alter table public.host_subscriptions add column if not exists trial_ends_on date;

-- "People under management" stays as an abuse guard, well above the member limits.
-- (Compared as text so this works in the same transaction that adds 'advanced'.)
create or replace function public.tier_capacity(t subscription_tier) returns int
language sql immutable as $$
  select case t::text
    when 'free' then 100
    when 'basic' then 200
    when 'standard' then 600
    when 'advanced' then 1500
    when 'pro' then 100000
    else 100
  end;
$$;
update public.host_subscriptions set capacity_limit = public.tier_capacity(tier);
