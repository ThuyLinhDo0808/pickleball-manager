-- ============================================================================
-- Pickleball Ecosystem — Full Database Schema (Supabase / PostgreSQL)
-- Single-Administrator architecture: one Host owns and edits everything.
-- Safe to re-run: uses `create ... if not exists` / `drop policy if exists`.
-- Run this whole file once in the Supabase SQL Editor, top to bottom.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
do $$ begin
  create type subscription_tier as enum ('free','basic','standard','pro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_type as enum ('fixed','guest');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_tier as enum ('vip','standard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type match_type as enum ('singles','doubles','mixed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_status as enum ('draft','open','closed','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type participant_status as enum ('registered','waitlisted','checked_in','no_show','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_type as enum ('income','expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_owner as enum ('club','event');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_period as enum ('month','quarter','year');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending','paid','overdue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_role as enum ('referee','coordinator');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- USERS / HOST SUBSCRIPTIONS  (one row per authenticated Host)
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.host_subscriptions (
  host_id uuid primary key references public.users(id) on delete cascade,
  tier subscription_tier not null default 'free',
  capacity_limit int not null default 30,
  updated_at timestamptz not null default now()
);

create or replace function public.tier_capacity(t subscription_tier) returns int
language sql immutable as $$
  select case t
    when 'free' then 30
    when 'basic' then 100
    when 'standard' then 300
    when 'pro' then 1000
  end;
$$;

create or replace function public.sync_capacity_limit() returns trigger
language plpgsql as $$
begin
  new.capacity_limit := public.tier_capacity(new.tier);
  return new;
end; $$;

drop trigger if exists trg_sync_capacity on public.host_subscriptions;
create trigger trg_sync_capacity before insert or update of tier
  on public.host_subscriptions for each row execute function public.sync_capacity_limit();

-- Bootstrap: auto-create users/host_subscriptions row for every new auth user
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  insert into public.host_subscriptions (host_id) values (new.id)
    on conflict (host_id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_new_auth_user on auth.users;
create trigger trg_new_auth_user after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill for accounts that existed before this schema ran
insert into public.users (id, email)
  select id, email from auth.users
  on conflict (id) do nothing;
insert into public.host_subscriptions (host_id)
  select id from auth.users
  on conflict (host_id) do nothing;

-- ----------------------------------------------------------------------------
-- CLUBS / CLUB MEMBERS
-- ----------------------------------------------------------------------------
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Player self-service: a join link per club + where players send membership payments.
alter table public.clubs add column if not exists join_token uuid not null default gen_random_uuid();
alter table public.clubs add column if not exists allow_join boolean not null default false;
alter table public.clubs add column if not exists join_note text;
alter table public.clubs add column if not exists bank_code text;      -- e.g. VCB, TCB, MB (VietQR bank id)
alter table public.clubs add column if not exists bank_account text;
alter table public.clubs add column if not exists bank_holder text;
create unique index if not exists ux_clubs_join_token on public.clubs (join_token);

create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  full_name text not null,
  phone text,
  dupr_level numeric(3,2),
  member_type member_type not null default 'fixed',
  tier member_tier,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.club_members add column if not exists tier member_tier;
alter table public.club_members add column if not exists notes text;
alter table public.club_members add column if not exists gender text;
alter table public.club_members add column if not exists birth_year int;
-- Internal reminders only the Host sees: 'unpaid', 'late', 'attitude'.
alter table public.club_members add column if not exists flags text[] not null default '{}';
-- The player's own login, when they joined through the portal (Host can unlink).
alter table public.club_members add column if not exists user_id uuid references public.users(id) on delete set null;
create index if not exists ix_club_members_user on public.club_members (user_id);
create unique index if not exists ux_club_members_club_user on public.club_members (club_id, user_id) where user_id is not null;

do $$ begin
  alter table public.club_members
    add constraint chk_member_gender check (gender is null or gender in ('male','female'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.club_members
    add constraint chk_member_birth_year check (birth_year is null or birth_year between 1900 and 2100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.club_members
    add constraint chk_tier_only_fixed
    check (tier is null or member_type = 'fixed');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- MEMBERSHIP PLANS / REGISTRATIONS (subscription-style billing for members)
-- ----------------------------------------------------------------------------
create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  period plan_period not null,
  price numeric(12,0) not null,
  sessions_included int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  plan_id uuid not null references public.membership_plans(id) on delete restrict,
  period_label text not null, -- e.g. "2026-08" or "Q3-2026" or "2026"
  starts_on date not null,
  ends_on date not null,
  status payment_status not null default 'pending',
  amount numeric(12,0) not null,
  created_at timestamptz not null default now()
);

-- Set when the player signs up themselves; payment_ref is the bank-transfer note to match on.
alter table public.memberships add column if not exists requested_by_player boolean not null default false;
alter table public.memberships add column if not exists payment_ref text;

create table if not exists public.membership_sessions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  event_id uuid,
  used_on timestamptz not null default now()
);

-- One session per membership per event (check-in is idempotent).
create unique index if not exists ux_membership_sessions_event
  on public.membership_sessions (membership_id, event_id) where event_id is not null;

create or replace view public.v_membership_status as
select
  m.id as membership_id,
  m.club_member_id,
  m.plan_id,
  m.period_label,
  m.starts_on,
  m.ends_on,
  m.status,
  m.amount,
  p.sessions_included,
  coalesce(s.used_count, 0) as sessions_used,
  greatest(p.sessions_included - coalesce(s.used_count, 0), 0) as sessions_remaining
from public.memberships m
join public.membership_plans p on p.id = m.plan_id
left join (
  select membership_id, count(*) as used_count
  from public.membership_sessions
  group by membership_id
) s on s.membership_id = m.id;

-- ----------------------------------------------------------------------------
-- EVENTS (Xé Vé) / PARTICIPANTS
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  courts int not null default 1,
  slots int not null default 16,
  level_min numeric(3,2),
  level_max numeric(3,2),
  fee_amount numeric(12,0) not null default 0,
  status event_status not null default 'draft',
  registration_deadline timestamptz,
  public_token uuid not null default gen_random_uuid(),
  allow_public_registration boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.events add column if not exists club_id uuid references public.clubs(id) on delete set null;
alter table public.events add column if not exists registration_deadline timestamptz;
alter table public.events add column if not exists public_token uuid not null default gen_random_uuid();
alter table public.events add column if not exists allow_public_registration boolean not null default false;
-- Message from the Host shown on the public registration page.
alter table public.events add column if not exists notice text;

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null,
  phone text,
  dupr_level numeric(3,2),
  source_club_member_id uuid references public.club_members(id) on delete set null,
  status participant_status not null default 'registered',
  fee_amount numeric(12,0),
  fee_paid boolean not null default false,
  joined_at timestamptz not null default now(),
  checked_in_at timestamptz,
  no_show_at timestamptz,
  cancelled_at timestamptz
);

alter table public.event_participants add column if not exists dupr_level numeric(3,2);
alter table public.event_participants add column if not exists source_club_member_id uuid references public.club_members(id) on delete set null;
-- Signed-in players registering via the public link (drives their history).
alter table public.event_participants add column if not exists user_id uuid references public.users(id) on delete set null;

-- Event-scoped roles (referee / coordinator) — limited access, no finance view
create table if not exists public.event_scorers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null,
  role event_role not null,
  access_code text not null default encode(gen_random_bytes(4), 'hex'),
  created_at timestamptz not null default now()
);

-- Dropped first: `e.*` expands at creation, so new events columns would
-- otherwise shift this view's columns and make CREATE OR REPLACE fail.
-- Staff access: the Host lets another account (by email) act as referee
-- (scores only) or coordinator (check-in + scores) — never finances.
-- Scope: one event, every event of one club, or (both null) all the Host's events.
create table if not exists public.staff_grants (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  full_name text,
  role event_role not null,
  club_id uuid references public.clubs(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chk_staff_scope check (club_id is null or event_id is null)
);
create unique index if not exists ux_staff_grants_scope on public.staff_grants (
  host_id, email,
  coalesce(club_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index if not exists ix_staff_grants_email on public.staff_grants (email);

drop view if exists public.v_event_summary;
create view public.v_event_summary as
select
  e.*,
  c.name as club_name,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status in ('registered','checked_in')) as main_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status = 'waitlisted') as waitlist_count
from public.events e
left join public.clubs c on c.id = e.club_id;

-- ----------------------------------------------------------------------------
-- MATCHES / MATCH PLAYERS (polymorphic: belongs to a club OR an event)
-- ----------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  match_type match_type not null default 'doubles',
  played_at timestamptz not null default now(),
  team1_score int not null default 0,
  team2_score int not null default 0,
  video_url text,
  created_at timestamptz not null default now(),
  constraint chk_matches_one_parent check (
    (club_id is not null and event_id is null) or
    (club_id is null and event_id is not null)
  )
);

alter table public.matches add column if not exists video_url text;

create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team int not null check (team in (1,2)),
  club_member_id uuid references public.club_members(id) on delete cascade,
  event_participant_id uuid references public.event_participants(id) on delete cascade,
  constraint chk_players_one_parent check (
    (club_member_id is not null and event_participant_id is null) or
    (club_member_id is null and event_participant_id is not null)
  )
);

-- ----------------------------------------------------------------------------
-- PLAYER PROFILES (player portal accounts)
-- ----------------------------------------------------------------------------
create table if not exists public.player_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  full_name text not null,
  phone text,
  dupr_level numeric(3,2) check (dupr_level is null or dupr_level between 1 and 8),
  gender text check (gender is null or gender in ('male','female')),
  birth_year int check (birth_year is null or birth_year between 1900 and 2100),
  avatar text check (avatar is null or length(avatar) <= 150000), -- small data: URL
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TOURNAMENTS (internal club tournaments: round-robin groups -> knockout)
-- ----------------------------------------------------------------------------
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  format match_type not null default 'doubles',
  group_count int not null default 0 check (group_count between 0 and 16), -- 0 = straight knockout
  advance_per_group int not null default 2 check (advance_per_group between 1 and 8),
  status text not null default 'groups' check (status in ('groups','knockout','completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  player1_id uuid references public.club_members(id) on delete set null,
  player2_id uuid references public.club_members(id) on delete set null,
  strength numeric(4,2),
  seed int,
  group_no int
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage text not null check (stage in ('group','knockout')),
  group_no int,
  round int not null,
  slot int not null default 0,
  team1_id uuid references public.tournament_teams(id) on delete cascade,
  team2_id uuid references public.tournament_teams(id) on delete cascade,
  team1_score int check (team1_score between 0 and 99),
  team2_score int check (team2_score between 0 and 99),
  winner_id uuid references public.tournament_teams(id) on delete set null,
  is_bye boolean not null default false,
  played_at timestamptz
);
create index if not exists ix_tmatches_tournament on public.tournament_matches (tournament_id);

-- ----------------------------------------------------------------------------
-- TRANSACTIONS (append-only ledger; polymorphic club/event owner)
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  owner_type transaction_owner not null,
  club_id uuid references public.clubs(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  type transaction_type not null,
  category text,
  amount numeric(12,0) not null check (amount >= 0),
  note text,
  occurred_on date not null default current_date,
  is_voided boolean not null default false,
  voided_at timestamptz,
  void_reason text,
  replaced_by uuid references public.transactions(id),
  created_at timestamptz not null default now(),
  constraint chk_txn_owner check (
    (owner_type = 'club' and club_id is not null and event_id is null) or
    (owner_type = 'event' and event_id is not null and club_id is null)
  )
);

create or replace function public.block_txn_mutation() returns trigger
language plpgsql as $$
begin
  if (old.amount, old.type, old.owner_type, old.club_id, old.event_id)
     is distinct from (new.amount, new.type, new.owner_type, new.club_id, new.event_id) then
    raise exception 'transactions are append-only: amount/type/owner cannot be changed, void instead';
  end if;
  return new;
end; $$;

drop trigger if exists trg_block_txn_mutation on public.transactions;
create trigger trg_block_txn_mutation before update on public.transactions
  for each row execute function public.block_txn_mutation();

-- Club-fund income written when a membership is marked paid (voided if unpaid again).
alter table public.memberships add column if not exists transaction_id uuid references public.transactions(id) on delete set null;

-- ----------------------------------------------------------------------------
-- FEEDBACK (emailed to developer)
-- ----------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references public.users(id) on delete set null,
  message text not null,
  contact text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- VIEWS
-- ----------------------------------------------------------------------------

-- Capacity usage: fixed club members + upcoming/active event participants only
create or replace view public.v_host_capacity_usage as
select
  h.host_id,
  h.tier,
  h.capacity_limit,
  coalesce(cm.member_count, 0) + coalesce(ep.participant_count, 0) as used,
  h.capacity_limit - (coalesce(cm.member_count, 0) + coalesce(ep.participant_count, 0)) as remaining
from public.host_subscriptions h
left join (
  select c.host_id, count(m.id) as member_count
  from public.clubs c
  join public.club_members m on m.club_id = c.id and m.is_active = true
  group by c.host_id
) cm on cm.host_id = h.host_id
left join (
  select e.host_id, count(p.id) as participant_count
  from public.events e
  join public.event_participants p on p.event_id = e.id
    and p.status in ('registered','waitlisted','checked_in')
  where e.status in ('draft','open','closed')
    and e.event_date >= current_date - 1
  group by e.host_id
) ep on ep.host_id = h.host_id;

create or replace view public.v_club_rankings_all_time as
select
  cm.id as club_member_id,
  cm.club_id,
  cm.full_name,
  count(*) filter (where mp.team = case when m.team1_score > m.team2_score then 1
                                          when m.team2_score > m.team1_score then 2 else 0 end) as wins,
  count(*) as matches_played,
  sum(case when mp.team = 1 then m.team1_score else m.team2_score end) as points_scored,
  sum(case when mp.team = 1 then m.team2_score else m.team1_score end) as points_lost
from public.club_members cm
join public.match_players mp on mp.club_member_id = cm.id
join public.matches m on m.id = mp.match_id
group by cm.id, cm.club_id, cm.full_name;

create or replace view public.v_club_rankings_monthly as
select
  cm.id as club_member_id,
  cm.club_id,
  cm.full_name,
  date_trunc('month', m.played_at) as month,
  count(*) filter (where mp.team = case when m.team1_score > m.team2_score then 1
                                          when m.team2_score > m.team1_score then 2 else 0 end) as wins,
  count(*) as matches_played,
  sum(case when mp.team = 1 then m.team1_score else m.team2_score end) as points_scored,
  sum(case when mp.team = 1 then m.team2_score else m.team1_score end) as points_lost
from public.club_members cm
join public.match_players mp on mp.club_member_id = cm.id
join public.matches m on m.id = mp.match_id
group by cm.id, cm.club_id, cm.full_name, date_trunc('month', m.played_at);

create or replace view public.v_club_fund_balance as
select
  club_id,
  sum(case when type = 'income' then amount else -amount end) as balance
from public.transactions
where owner_type = 'club' and is_voided = false
group by club_id;

create or replace view public.v_event_finance as
select
  event_id,
  sum(case when type = 'income' then amount else 0 end) as income,
  sum(case when type = 'expense' then amount else 0 end) as expense,
  sum(case when type = 'income' then amount else -amount end) as net
from public.transactions
where owner_type = 'event' and is_voided = false
group by event_id;

create or replace view public.v_player_reliability as
select
  source_club_member_id as club_member_id,
  count(*) as total_registrations,
  count(*) filter (where status = 'no_show') as no_shows,
  count(*) filter (where status = 'checked_in') as attended,
  round(
    100.0 * count(*) filter (where status = 'checked_in') /
    nullif(count(*) filter (where status in ('checked_in','no_show')), 0)
  , 1) as reliability_pct
from public.event_participants
where source_club_member_id is not null
group by source_club_member_id;

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (Host can only see/edit their own data)
-- ----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.host_subscriptions enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.membership_plans enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_sessions enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_scorers enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.transactions enable row level security;
alter table public.feedback enable row level security;
alter table public.staff_grants enable row level security;
alter table public.player_profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_matches enable row level security;

drop policy if exists p_users_self on public.users;
create policy p_users_self on public.users for all
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists p_sub_self on public.host_subscriptions;
create policy p_sub_self on public.host_subscriptions for all
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists p_profile_self on public.player_profiles;
create policy p_profile_self on public.player_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists p_tournaments_owner on public.tournaments;
create policy p_tournaments_owner on public.tournaments for all
  using (host_id = auth.uid()) with check (host_id = auth.uid());
drop policy if exists p_tteams_owner on public.tournament_teams;
create policy p_tteams_owner on public.tournament_teams for all
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()));
drop policy if exists p_tmatches_owner on public.tournament_matches;
create policy p_tmatches_owner on public.tournament_matches for all
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()));

drop policy if exists p_staff_owner on public.staff_grants;
create policy p_staff_owner on public.staff_grants for all
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists p_clubs_owner on public.clubs;
create policy p_clubs_owner on public.clubs for all
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists p_members_owner on public.club_members;
create policy p_members_owner on public.club_members for all
  using (exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()))
  with check (exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()));

drop policy if exists p_plans_owner on public.membership_plans;
create policy p_plans_owner on public.membership_plans for all
  using (exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()))
  with check (exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()));

drop policy if exists p_memberships_owner on public.memberships;
create policy p_memberships_owner on public.memberships for all
  using (exists (
    select 1 from public.club_members cm join public.clubs c on c.id = cm.club_id
    where cm.id = club_member_id and c.host_id = auth.uid()))
  with check (exists (
    select 1 from public.club_members cm join public.clubs c on c.id = cm.club_id
    where cm.id = club_member_id and c.host_id = auth.uid()));

drop policy if exists p_msessions_owner on public.membership_sessions;
create policy p_msessions_owner on public.membership_sessions for all
  using (exists (
    select 1 from public.memberships m
    join public.club_members cm on cm.id = m.club_member_id
    join public.clubs c on c.id = cm.club_id
    where m.id = membership_id and c.host_id = auth.uid()))
  with check (exists (
    select 1 from public.memberships m
    join public.club_members cm on cm.id = m.club_member_id
    join public.clubs c on c.id = cm.club_id
    where m.id = membership_id and c.host_id = auth.uid()));

drop policy if exists p_events_owner on public.events;
create policy p_events_owner on public.events for all
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists p_participants_owner on public.event_participants;
create policy p_participants_owner on public.event_participants for all
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

drop policy if exists p_scorers_owner on public.event_scorers;
create policy p_scorers_owner on public.event_scorers for all
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

drop policy if exists p_matches_owner on public.matches;
create policy p_matches_owner on public.matches for all
  using (
    (club_id is not null and exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()))
    or
    (event_id is not null and exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()))
  )
  with check (
    (club_id is not null and exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()))
    or
    (event_id is not null and exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()))
  );

drop policy if exists p_match_players_owner on public.match_players;
create policy p_match_players_owner on public.match_players for all
  using (exists (
    select 1 from public.matches m where m.id = match_id and (
      (m.club_id is not null and exists (select 1 from public.clubs c where c.id = m.club_id and c.host_id = auth.uid()))
      or
      (m.event_id is not null and exists (select 1 from public.events e where e.id = m.event_id and e.host_id = auth.uid()))
    )))
  with check (exists (
    select 1 from public.matches m where m.id = match_id and (
      (m.club_id is not null and exists (select 1 from public.clubs c where c.id = m.club_id and c.host_id = auth.uid()))
      or
      (m.event_id is not null and exists (select 1 from public.events e where e.id = m.event_id and e.host_id = auth.uid()))
    )));

drop policy if exists p_txn_owner on public.transactions;
create policy p_txn_owner on public.transactions for all
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists p_feedback_owner on public.feedback;
create policy p_feedback_owner on public.feedback for all
  using (host_id = auth.uid()) with check (host_id = auth.uid());

-- ----------------------------------------------------------------------------
select 1; -- done
notify pgrst, 'reload schema';
