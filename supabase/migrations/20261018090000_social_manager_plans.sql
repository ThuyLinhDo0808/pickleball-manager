-- ----------------------------------------------------------------------------
-- SOCIAL MANAGER ADD-ON  (migration 20261018090000)
-- ----------------------------------------------------------------------------
-- Running Xé Vé games (one-off paid games outside a club) is a paid add-on,
-- "Social Manager", on top of the club plan. Hosts who already ran Xé Vé games keep it.
alter table public.host_subscriptions add column if not exists social_manager boolean not null default false;
-- When the Host asked for it (no self-serve billing yet: the request reaches the team).
alter table public.host_subscriptions add column if not exists social_manager_requested_at timestamptz;
-- When the Host last asked for a bigger plan (more clubs), and which one.
alter table public.host_subscriptions add column if not exists upgrade_requested_at timestamptz;
alter table public.host_subscriptions add column if not exists upgrade_requested_tier text;
update public.host_subscriptions s set social_manager = true
  where social_manager = false
    and exists (select 1 from public.events e where e.host_id = s.host_id and e.club_id is null);
