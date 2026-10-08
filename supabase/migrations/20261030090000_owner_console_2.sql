-- ----------------------------------------------------------------------------
-- OWNER CONSOLE 2  (migration 20261030090000)
-- ----------------------------------------------------------------------------
-- Feedback inbox with a status, app-wide settings the owner can switch from the web
-- (e.g. self-serve upgrades), and announcements shown as a banner to every user.
alter table public.feedback add column if not exists status text not null default 'new'
  check (status in ('new', 'in_progress', 'closed'));
alter table public.feedback add column if not exists status_changed_at timestamptz;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (length(message) between 1 and 500),
  level text not null default 'info' check (level in ('info', 'warning')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  show_public boolean not null default false,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists ix_announcements_live on public.announcements (active, starts_at);

alter table public.app_settings enable row level security;
alter table public.announcements enable row level security;
revoke all on public.app_settings from anon, authenticated;
revoke all on public.announcements from anon, authenticated;
