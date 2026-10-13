-- ----------------------------------------------------------------------------
-- ACCOUNT SECURITY  (migration 20261113090000)
-- ----------------------------------------------------------------------------
-- Two-step sign-in (authenticator app codes, TOTP), "sign out everywhere", and the
-- list of devices an account signed in from (new-device email). Only the backend
-- (service role) reads or writes these tables.

-- Two-step sign-in. The secret is stored encrypted (AES-256-GCM, key in the backend's
-- MFA_ENC_KEY), recovery codes only as SHA-256 hashes. last_step blocks reusing a code.
create table if not exists public.user_mfa (
  user_id        uuid primary key references public.users(id) on delete cascade,
  secret_enc     text not null,
  enabled_at     timestamptz,                 -- null = set up started, not confirmed yet
  recovery_hashes text[] not null default '{}',
  last_step      bigint not null default 0,  -- last 30-second step used (a code works once)
  created_at     timestamptz not null default now()
);

-- Sign-in sessions that passed the second step (one row per Supabase session).
create table if not exists public.mfa_sessions (
  session_key  text primary key,
  user_id      uuid not null references public.users(id) on delete cascade,
  verified_at  timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index if not exists ix_mfa_sessions_user on public.mfa_sessions (user_id);

-- Devices that signed in (a random id the browser keeps; never the raw IP).
create table if not exists public.login_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  device_hash text not null,
  user_agent  text,
  ip_hint     text,                           -- e.g. 113.161.12.x
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (user_id, device_hash)
);

-- "Sign out on every device": tokens issued before this moment are refused.
alter table public.users add column if not exists sessions_revoked_at timestamptz;

alter table public.user_mfa enable row level security;
alter table public.mfa_sessions enable row level security;
alter table public.login_devices enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.user_mfa, public.mfa_sessions, public.login_devices from %I', r);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
