-- Flow v3:
--   1. Onboarding after sign-up: the sports someone plays and whether they came as a
--      player or a club manager (users.sports / account_role / onboarded_at).
--   2. New clubs are asked for (club_requests) and created only when the app owner
--      approves them. The request carries the club's profile, pictures and the plan picked.
--   3. Club profile shown in the club search: country, province, district, address,
--      regular schedule, size, contact email, avatar / cover (club_images), listed or not.
--   4. Join requests sent from the club search are told apart (club_members.join_source).
--   5. Upgrade orders pay only the difference for the days left (plan_payments.upgrade_*).
--   6. There is no Free plan any more: accounts that run clubs on Free get 30 days of
--      Basic once, so nothing stops overnight.

-- ---- 1. Onboarding ----------------------------------------------------------------------
alter table public.users add column if not exists sports text[] not null default '{}';
alter table public.users add column if not exists account_role text;
do $$ begin
  -- Added once; everyone who signed up before counts as onboarded.
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'onboarded_at') then
    alter table public.users add column onboarded_at timestamptz;
    update public.users set onboarded_at = now();
  end if;
end $$;
do $$ begin
  alter table public.users add constraint chk_users_sports check (sports <@ array['pickleball', 'badminton']::text[]);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.users add constraint chk_users_account_role check (account_role is null or account_role in ('player', 'manager'));
exception when duplicate_object then null; end $$;

-- ---- 3. Club profile ----------------------------------------------------------------------
alter table public.clubs add column if not exists country text not null default 'Việt Nam';
alter table public.clubs add column if not exists province text;
alter table public.clubs add column if not exists district text;
alter table public.clubs add column if not exists address text;
alter table public.clubs add column if not exists schedule text;
alter table public.clubs add column if not exists member_count_hint int;
alter table public.clubs add column if not exists contact_email text;
alter table public.clubs add column if not exists is_listed boolean not null default true;
alter table public.clubs add column if not exists avatar_version int;
alter table public.clubs add column if not exists cover_version int;
do $$ begin
  alter table public.clubs add constraint chk_clubs_profile check (
    char_length(country) <= 60 and (province is null or char_length(province) <= 80)
    and (district is null or char_length(district) <= 80) and (address is null or char_length(address) <= 200)
    and (schedule is null or char_length(schedule) <= 300) and (contact_email is null or char_length(contact_email) <= 200)
    and (member_count_hint is null or member_count_hint between 1 and 100000));
exception when duplicate_object then null; end $$;
create index if not exists ix_clubs_listed on public.clubs (is_listed, province);

-- Pictures live apart from clubs (clubs rows are read everywhere; pictures are big).
create table if not exists public.club_images (
  club_id uuid primary key references public.clubs(id) on delete cascade,
  avatar text check (avatar is null or length(avatar) <= 200000),
  cover text check (cover is null or length(cover) <= 600000),
  updated_at timestamptz not null default now()
);
alter table public.club_images enable row level security;

-- ---- 2. Club requests ----------------------------------------------------------------------
create table if not exists public.club_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  sport text not null default 'pickleball' check (sport in ('pickleball', 'badminton')),
  member_count int check (member_count is null or member_count between 1 and 100000),
  address text not null check (char_length(address) between 2 and 200),
  schedule text check (schedule is null or char_length(schedule) <= 300),
  description text check (description is null or char_length(description) <= 1000),
  contact_email text not null check (char_length(contact_email) between 3 and 200),
  country text not null default 'Việt Nam' check (char_length(country) <= 60),
  province text check (province is null or char_length(province) <= 80),
  district text check (district is null or char_length(district) <= 80),
  avatar text check (avatar is null or length(avatar) <= 200000),
  cover text check (cover is null or length(cover) <= 600000),
  plan_tier text check (plan_tier is null or plan_tier in ('basic', 'standard', 'advanced', 'pro')),
  plan_months int check (plan_months is null or plan_months between 1 and 24),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  owner_note text check (owner_note is null or char_length(owner_note) <= 500),
  club_id uuid references public.clubs(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);
create index if not exists ix_club_requests_status on public.club_requests (status, created_at desc);
create index if not exists ix_club_requests_user on public.club_requests (user_id, created_at desc);
-- One waiting request per account at a time.
create unique index if not exists ux_club_requests_one_pending on public.club_requests (user_id) where status = 'pending';
alter table public.club_requests enable row level security;

-- ---- 4. Join requests from the club search ----------------------------------------------------
alter table public.club_members add column if not exists join_source text;
do $$ begin
  alter table public.club_members add constraint chk_members_join_source check (join_source is null or join_source in ('survey', 'search'));
exception when duplicate_object then null; end $$;

-- ---- 5. Upgrade orders (pay the difference for the days left) -----------------------------------
alter table public.plan_payments add column if not exists upgrade_from text;
alter table public.plan_payments add column if not exists upgrade_days int;
alter table public.plan_payments drop constraint if exists plan_payments_months_check;
do $$ begin
  alter table public.plan_payments add constraint plan_payments_months_check check (months between 0 and 24);
exception when duplicate_object then null; end $$;

-- ---- 6. No Free plan: 30 days of Basic, once, for accounts running clubs on Free ----------------
do $$ begin
  if not exists (select 1 from public.app_settings where key = 'migr_20261104_basic_grace') then
    update public.host_subscriptions s
       set tier = 'basic', tier_paid_until = current_date + 30
     where s.tier = 'free'
       and exists (select 1 from public.clubs c where c.host_id = s.host_id);
    insert into public.app_settings (key, value, updated_by) values ('migr_20261104_basic_grace', 'true'::jsonb, 'migration');
  end if;
end $$;

notify pgrst, 'reload schema';
