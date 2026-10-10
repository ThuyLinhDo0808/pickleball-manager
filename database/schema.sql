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
-- Holds a place while a guest's transfer is checked by the Host. New enum values can't be
-- used in the same transaction, so SQL below compares status::text.
alter type participant_status add value if not exists 'pending';

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
-- Co-owner of one club: members + finance, never deletes the club or edits where payments go.
alter type event_role add value if not exists 'co_admin';

-- ----------------------------------------------------------------------------
-- USERS / HOST SUBSCRIPTIONS  (one row per authenticated Host)
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
-- Host notification webhook (e.g. Make/Zapier -> Zalo ZNS, a Telegram group, Slack...).
alter table public.users add column if not exists notify_webhook_url text;
-- Where guests transfer event fees (standalone events; club events use the club's account first).
alter table public.users add column if not exists bank_code text;
alter table public.users add column if not exists bank_account text;
alter table public.users add column if not exists bank_holder text;
-- The Host's own bank QR image (small data: URL), shown on the payment page.
alter table public.users add column if not exists payment_qr_image text
  check (payment_qr_image is null or length(payment_qr_image) <= 400000);

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
-- A player account linked to a member record counts as that member only once the Host
-- has verified it. Links that existed before this column are trusted (backfilled once).
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'club_members' and column_name = 'account_verified') then
    alter table public.club_members add column account_verified boolean not null default false;
    update public.club_members set account_verified = true where user_id is not null;
  end if;
end $$;
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
-- Cancellation policy: cancelling later than N hours before the start still uses the
-- session / still owes the fee. NULL = free cancellation at any time.
alter table public.events add column if not exists cancel_deadline_hours int
  check (cancel_deadline_hours is null or cancel_deadline_hours between 0 and 168);
-- What an event is: weekly club session, a game ("kèo"), training, meeting, or a
-- friendly challenge between members. Club events that existed before are weekly sessions.
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'kind') then
    alter table public.events add column kind text not null default 'game'
      check (kind in ('weekly','game','training','meeting','challenge'));
    update public.events set kind = 'weekly' where club_id is not null;
  end if;
end $$;
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
-- Cancelled after the event's cancel deadline: the session is used / the fee is still owed.
alter table public.event_participants add column if not exists late_cancel boolean not null default false;
-- Online sign-ups: member (verified club member) or guest; guests pay first, the Host
-- checks the transfer screenshot, then the registration gets its ticket QR.
alter table public.event_participants add column if not exists kind text not null default 'guest'
  check (kind in ('member','guest'));
alter table public.event_participants add column if not exists ticket_code uuid not null default gen_random_uuid();
create unique index if not exists ux_participant_ticket on public.event_participants (ticket_code);
alter table public.event_participants add column if not exists payment_status text not null default 'none'
  check (payment_status in ('none','awaiting_proof','proof_submitted','rejected','confirmed'));
alter table public.event_participants add column if not exists payment_ref text;
alter table public.event_participants add column if not exists payment_proof text
  check (payment_proof is null or length(payment_proof) <= 400000);
alter table public.event_participants add column if not exists payment_submitted_at timestamptz;
alter table public.event_participants add column if not exists payment_note text;
-- An unpaid hold is released automatically after this time.
alter table public.event_participants add column if not exists hold_expires_at timestamptz;
alter table public.event_participants add column if not exists transferred_from text;

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
do $$ begin
  alter table public.staff_grants add constraint chk_staff_co_admin_club
    check (role::text <> 'co_admin' or (club_id is not null and event_id is null));
exception when duplicate_object then null; end $$;

drop view if exists public.v_event_summary;
create view public.v_event_summary as
select
  e.*,
  c.name as club_name,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text in ('registered','checked_in','pending')) as main_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status = 'waitlisted') as waitlist_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text = 'pending') as pending_count
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
-- Personal check-in QR (shown in the player portal, scanned by the Host / coordinator).
alter table public.player_profiles add column if not exists checkin_token uuid not null default gen_random_uuid();
create unique index if not exists ux_player_checkin_token on public.player_profiles (checkin_token);
-- Telegram notifications: the player opens t.me/<bot>?start=<link code>, the bot stores the chat.
alter table public.player_profiles add column if not exists telegram_link_code text;
alter table public.player_profiles add column if not exists telegram_chat_id bigint;
create unique index if not exists ux_player_telegram_code on public.player_profiles (telegram_link_code);

-- ----------------------------------------------------------------------------
-- INVENTORY (balls & supplies): purchases, retirements (with how long they
-- lasted) and adjustments -> stock, durability and cost per ball per session.
-- ----------------------------------------------------------------------------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  category text not null default 'ball' check (category in ('ball','other')),
  holes int check (holes is null or holes between 10 and 80), -- e.g. 40-hole outdoor, 26-hole indoor
  unit text not null default 'quả',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_moves (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  kind text not null check (kind in ('purchase','retire','adjust')),
  quantity int not null check (quantity <> 0),
  unit_cost numeric(12,0) check (unit_cost is null or unit_cost >= 0),
  sessions_lasted numeric(6,1) check (sessions_lasted is null or sessions_lasted > 0),
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  constraint chk_move_shape check (
    (kind = 'purchase' and quantity > 0 and unit_cost is not null) or
    (kind = 'retire' and quantity > 0) or
    (kind = 'adjust')
  )
);
create index if not exists ix_inventory_moves_item on public.inventory_moves (item_id, occurred_on);

-- ----------------------------------------------------------------------------
-- CHANGE HISTORY (SCD Type 2): every change to a tracked attribute closes the
-- current row (valid_to) and opens a new one — nothing is overwritten.
-- Filled by triggers, so it is complete no matter which code path made the change.
-- ----------------------------------------------------------------------------
create table if not exists public.change_history (
  id bigserial primary key,
  entity text not null check (entity in ('club_member','membership','player')),
  entity_id uuid not null,
  club_id uuid references public.clubs(id) on delete cascade, -- null for player profiles
  attribute text not null,
  value text,
  valid_from timestamptz not null default now(),
  valid_to timestamptz -- null = current value
);
create index if not exists ix_history_entity on public.change_history (entity, entity_id, attribute, valid_from);
create unique index if not exists ux_history_current on public.change_history (entity, entity_id, attribute) where valid_to is null;

-- Trigger args: entity, id column, then the attributes to track.
create or replace function public.scd2_track() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ent text := TG_ARGV[0];
  id_col text := TG_ARGV[1];
  attr text;
  rec jsonb := to_jsonb(coalesce(new, old));
  eid uuid := (rec ->> id_col)::uuid;
  club uuid;
  old_v text;
  new_v text;
begin
  if ent = 'club_member' then
    club := (rec ->> 'club_id')::uuid;
  elsif ent = 'membership' then
    select cm.club_id into club from public.club_members cm where cm.id = (rec ->> 'club_member_id')::uuid;
  end if;

  if TG_OP = 'DELETE' then
    update public.change_history set valid_to = now()
      where entity = ent and entity_id = eid and valid_to is null;
    return old;
  end if;

  for i in 2 .. TG_NARGS - 1 loop
    attr := TG_ARGV[i];
    new_v := to_jsonb(new) ->> attr;
    old_v := case when TG_OP = 'UPDATE' then to_jsonb(old) ->> attr end;
    if TG_OP = 'INSERT' and new_v is null then continue; end if;
    if TG_OP = 'UPDATE' and old_v is not distinct from new_v then continue; end if;
    update public.change_history set valid_to = now()
      where entity = ent and entity_id = eid and attribute = attr and valid_to is null;
    insert into public.change_history (entity, entity_id, club_id, attribute, value)
      values (ent, eid, club, attr, new_v);
  end loop;
  return new;
end; $$;

drop trigger if exists trg_hist_club_members on public.club_members;
create trigger trg_hist_club_members after insert or update or delete on public.club_members
  for each row execute function public.scd2_track('club_member', 'id', 'dupr_level', 'member_type', 'tier', 'is_active');

drop trigger if exists trg_hist_memberships on public.memberships;
create trigger trg_hist_memberships after insert or update or delete on public.memberships
  for each row execute function public.scd2_track('membership', 'id', 'status', 'amount');

drop trigger if exists trg_hist_player_profiles on public.player_profiles;
create trigger trg_hist_player_profiles after insert or update or delete on public.player_profiles
  for each row execute function public.scd2_track('player', 'user_id', 'dupr_level');

-- Backfill: open a history row for data that existed before tracking started.
insert into public.change_history (entity, entity_id, club_id, attribute, value, valid_from)
select 'club_member', cm.id, cm.club_id, a.attr, a.val, cm.created_at
from public.club_members cm
cross join lateral (values ('dupr_level', cm.dupr_level::text), ('member_type', cm.member_type::text),
                           ('tier', cm.tier::text), ('is_active', cm.is_active::text)) as a(attr, val)
where a.val is not null
  and not exists (select 1 from public.change_history h where h.entity = 'club_member' and h.entity_id = cm.id and h.attribute = a.attr);

insert into public.change_history (entity, entity_id, club_id, attribute, value, valid_from)
select 'membership', m.id, cm.club_id, a.attr, a.val, m.created_at
from public.memberships m
join public.club_members cm on cm.id = m.club_member_id
cross join lateral (values ('status', m.status::text), ('amount', m.amount::text)) as a(attr, val)
where not exists (select 1 from public.change_history h where h.entity = 'membership' and h.entity_id = m.id and h.attribute = a.attr);

insert into public.change_history (entity, entity_id, attribute, value, valid_from)
select 'player', p.user_id, 'dupr_level', p.dupr_level::text, p.updated_at
from public.player_profiles p
where p.dupr_level is not null
  and not exists (select 1 from public.change_history h where h.entity = 'player' and h.entity_id = p.user_id);

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
-- Club-fund expense written for a ball purchase (added here: transactions must exist first).
alter table public.inventory_moves add column if not exists transaction_id uuid references public.transactions(id) on delete set null;

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
    and p.status::text in ('registered','waitlisted','checked_in','pending')
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
alter table public.change_history enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_moves enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_matches enable row level security;

drop policy if exists p_users_self on public.users;
create policy p_users_self on public.users for all
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists p_sub_self on public.host_subscriptions;
create policy p_sub_self on public.host_subscriptions for all
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists p_inventory_owner on public.inventory_items;
create policy p_inventory_owner on public.inventory_items for all
  using (exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()))
  with check (exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()));
drop policy if exists p_inventory_moves_owner on public.inventory_moves;
create policy p_inventory_moves_owner on public.inventory_moves for all
  using (exists (select 1 from public.inventory_items i join public.clubs c on c.id = i.club_id where i.id = item_id and c.host_id = auth.uid()))
  with check (exists (select 1 from public.inventory_items i join public.clubs c on c.id = i.club_id where i.id = item_id and c.host_id = auth.uid()));

drop policy if exists p_history_owner on public.change_history;
create policy p_history_owner on public.change_history for select
  using (exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid())
         or (entity = 'player' and entity_id = auth.uid()));

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
-- ----------------------------------------------------------------------------
-- ACTIVITIES & TEAM TOURNAMENTS
-- ----------------------------------------------------------------------------
-- A player asked to join the club from an event page and no member had their phone:
-- a member record was created for the request. Rejecting it deletes the record.
alter table public.club_members add column if not exists join_requested boolean not null default false;


-- Tournaments: 'pairs' (singles / fixed pairs, groups -> knockout) or 'team' (teams of
-- 4-8 play fixtures made of several sub-matches). Dated so they show on the calendar.
alter table public.tournaments add column if not exists kind text not null default 'pairs' check (kind in ('pairs','team'));
alter table public.tournaments add column if not exists division text not null default 'open' check (division in ('open','men','women'));
alter table public.tournaments add column if not exists event_date date;
alter table public.tournaments add column if not exists start_time time;
alter table public.tournaments add column if not exists end_time time;
alter table public.tournaments add column if not exists location text;
alter table public.tournaments add column if not exists win_rule text not null default 'sub_wins' check (win_rule in ('sub_wins','points'));
alter table public.tournaments add column if not exists sub_formats text[] not null default '{}';

create table if not exists public.tournament_team_members (
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  primary key (team_id, club_member_id)
);

-- One sub-match of a team fixture (the fixture is a tournament_matches row).
create table if not exists public.tournament_sub_matches (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.tournament_matches(id) on delete cascade,
  slot int not null,
  format text not null check (format in ('mens','womens','mixed','doubles','singles')),
  team1_p1 uuid references public.club_members(id) on delete set null,
  team1_p2 uuid references public.club_members(id) on delete set null,
  team2_p1 uuid references public.club_members(id) on delete set null,
  team2_p2 uuid references public.club_members(id) on delete set null,
  team1_score int check (team1_score between 0 and 99),
  team2_score int check (team2_score between 0 and 99),
  played_at timestamptz
);
create index if not exists ix_sub_matches_fixture on public.tournament_sub_matches (fixture_id);

alter table public.tournament_team_members enable row level security;
alter table public.tournament_sub_matches enable row level security;
drop policy if exists p_tteam_members_owner on public.tournament_team_members;
create policy p_tteam_members_owner on public.tournament_team_members for all
  using (exists (select 1 from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id where tt.id = team_id and t.host_id = auth.uid()))
  with check (exists (select 1 from public.tournament_teams tt join public.tournaments t on t.id = tt.tournament_id where tt.id = team_id and t.host_id = auth.uid()));
drop policy if exists p_tsub_owner on public.tournament_sub_matches;
create policy p_tsub_owner on public.tournament_sub_matches for all
  using (exists (select 1 from public.tournament_matches m join public.tournaments t on t.id = m.tournament_id where m.id = fixture_id and t.host_id = auth.uid()))
  with check (exists (select 1 from public.tournament_matches m join public.tournaments t on t.id = m.tournament_id where m.id = fixture_id and t.host_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- SIGN-UP SAFETY, MEMBER JOIN DATE & BIRTHDAY  (migration 20261003090000)
-- ----------------------------------------------------------------------------
-- A new sign-up must never fail because of our bootstrap rows: Supabase then shows
-- "Database error saving new user". The API recreates missing rows on first request.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.users (id, email) values (new.id, new.email)
      on conflict (id) do nothing;
    insert into public.host_subscriptions (host_id) values (new.id)
      on conflict (host_id) do nothing;
  exception when others then
    raise warning 'handle_new_auth_user(%): %', new.id, sqlerrm;
  end;
  return new;
end; $$;

-- When the member joined the club (seniority) and full birth date (birthday gifts).
alter table public.club_members add column if not exists joined_on date;
alter table public.club_members add column if not exists birth_date date;
update public.club_members set joined_on = created_at::date where joined_on is null;
alter table public.club_members alter column joined_on set default current_date;
create index if not exists ix_club_members_birth_md on public.club_members (club_id, (extract(month from birth_date)));

-- ----------------------------------------------------------------------------
-- TOURNAMENT ENTRY FEE  (migration 20261004090000)
-- ----------------------------------------------------------------------------
alter table public.tournaments add column if not exists entry_fee numeric(12,0) not null default 0
  check (entry_fee >= 0);

-- ----------------------------------------------------------------------------
-- TOURNAMENT ENTRY FEES  (migration 20261005090000)
-- ----------------------------------------------------------------------------
-- Fee per player (also in 20261004090000; repeated so either file alone is enough).
alter table public.tournaments add column if not exists entry_fee numeric(12,0) not null default 0
  check (entry_fee >= 0);

-- Who has paid the entry fee; each payment is a club-fund income (voided if unmarked).
create table if not exists public.tournament_fee_payments (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  amount numeric(12,0) not null default 0 check (amount >= 0),
  transaction_id uuid references public.transactions(id) on delete set null,
  paid_at timestamptz not null default now(),
  primary key (tournament_id, club_member_id)
);
alter table public.tournament_fee_payments enable row level security;
drop policy if exists p_tfee_owner on public.tournament_fee_payments;
create policy p_tfee_owner on public.tournament_fee_payments for all
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- PLAYER BIRTH DATE  (migration 20261006090000)
-- ----------------------------------------------------------------------------
-- Players give their full birth date (not just the year); it fills the club record.
alter table public.player_profiles add column if not exists birth_date date;

-- ----------------------------------------------------------------------------
-- GUESTS: PERKS, NOTES, AFTER-SESSION SURVEY, JOIN REQUESTS  (migration 20261009090000)
-- ----------------------------------------------------------------------------
-- Guests who got a confirmed place are kept in the club's guest list automatically.
-- The Host can give a guest a perk: 'priority' = first off the waitlist,
-- 'vip' = priority + the club's VIP discount on every session fee.
alter table public.club_members add column if not exists guest_perk text
  check (guest_perk is null or guest_perk in ('priority','vip'));
-- When the player asked to join the fixed team, and what they wrote.
alter table public.club_members add column if not exists join_requested_at timestamptz;
alter table public.club_members add column if not exists join_note text
  check (join_note is null or length(join_note) <= 1000);
alter table public.clubs add column if not exists guest_vip_discount numeric(12,0) not null default 0
  check (guest_vip_discount >= 0);

-- Which guest-list record a sign-up belongs to; perk priority on the waitlist;
-- the private link to the after-session survey and when it was sent.
alter table public.event_participants add column if not exists guest_member_id uuid
  references public.club_members(id) on delete set null;
create index if not exists ix_participants_guest_member on public.event_participants (guest_member_id);
alter table public.event_participants add column if not exists priority boolean not null default false;
alter table public.event_participants add column if not exists survey_token uuid not null default gen_random_uuid();
create unique index if not exists ux_participant_survey on public.event_participants (survey_token);
alter table public.event_participants add column if not exists survey_sent_at timestamptz;

-- One answer per sign-up: stars, comment, and whether they want to join the fixed team.
create table if not exists public.event_surveys (
  participant_id uuid primary key references public.event_participants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  level_fit text check (level_fit is null or level_fit in ('easy','right','hard')),
  comment text check (comment is null or length(comment) <= 1000),
  wants_join boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ix_event_surveys_event on public.event_surveys (event_id);
alter table public.event_surveys enable row level security;
drop policy if exists p_event_surveys_owner on public.event_surveys;
create policy p_event_surveys_owner on public.event_surveys for select
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

-- Guests now live in the club list too, so only FIXED members count towards capacity
-- (guests are already counted through their upcoming sign-ups).
create or replace view public.v_host_capacity_usage with (security_invoker = true) as
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
  join public.club_members m on m.club_id = c.id and m.is_active = true and m.member_type = 'fixed'
  group by c.host_id
) cm on cm.host_id = h.host_id
left join (
  select e.host_id, count(p.id) as participant_count
  from public.events e
  join public.event_participants p on p.event_id = e.id
    and p.status::text in ('registered','waitlisted','checked_in','pending')
  where e.status in ('draft','open','closed')
    and e.event_date >= current_date - 1
  group by e.host_id
) ep on ep.host_id = h.host_id;

-- ----------------------------------------------------------------------------
-- AUTO-LINK PLAYER ACCOUNTS TO CLUB MEMBERS BY PHONE  (migration 20261010090000)
-- ----------------------------------------------------------------------------
-- A player whose profile phone matches a club member's phone becomes that member
-- as soon as they sign up / log in (no "I'm a member" button any more).
-- phone_key = last 9 digits, so "0911 000 003", "+84911000003" and "0911000003" match.
alter table public.club_members add column if not exists phone_key text
  generated always as (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9)) stored;
create index if not exists ix_club_members_phone_key on public.club_members (phone_key);
-- The account the Host unlinked from this member: never auto-linked to it again.
alter table public.club_members add column if not exists unlinked_user_id uuid;

-- ----------------------------------------------------------------------------
-- EVENT STATUS: OPEN / COMPLETED / CANCELLED ONLY  (migration 20261011090000)
-- ----------------------------------------------------------------------------
-- No more drafts or "closed" sessions: a session is open until its time slot is over
-- (then the app marks it completed), or cancelled. Old drafts / closed ones become open;
-- past ones are completed by the app on the next load.
update public.events set status = 'open' where status in ('draft', 'closed');
alter table public.events alter column status set default 'open';

-- ----------------------------------------------------------------------------
-- MULTI-SPORT: BADMINTON CLUBS  (migration 20261012090000)
-- ----------------------------------------------------------------------------
-- Each club plays one sport, chosen when it is created. Existing clubs are pickleball.
alter table public.clubs add column if not exists sport text not null default 'pickleball'
  check (sport in ('pickleball', 'badminton'));

-- Badminton levels are steps 1-6 (Yếu, TB-, TB, TB+, Khá, Giỏi). In a badminton club the
-- level columns (club_members.dupr_level, events.level_min/max, event_participants.dupr_level)
-- hold that step; a player's own badminton level is kept apart from their DUPR.
alter table public.player_profiles add column if not exists badminton_level smallint
  check (badminton_level is null or badminton_level between 1 and 6);

-- Badminton scores game by game, e.g. [[21,18],[19,21],[21,15]]; team1/team2_score then
-- hold the games won (2-1), so winners and standings work the same for both sports.
alter table public.matches add column if not exists games jsonb;
alter table public.tournament_matches add column if not exists games jsonb;
alter table public.tournament_sub_matches add column if not exists games jsonb;

-- Shuttles are used up: a 'use' move takes N shuttles out of stock for one session,
-- so the club sees what each session's shuttles cost and the share per player.
alter table public.inventory_moves add column if not exists event_id uuid references public.events(id) on delete set null;
create index if not exists ix_inventory_moves_event on public.inventory_moves (event_id) where event_id is not null;
alter table public.inventory_moves drop constraint if exists inventory_moves_kind_check;
alter table public.inventory_moves add constraint inventory_moves_kind_check check (kind in ('purchase','retire','adjust','use'));
alter table public.inventory_moves drop constraint if exists chk_move_shape;
alter table public.inventory_moves add constraint chk_move_shape check (
  (kind = 'purchase' and quantity > 0 and unit_cost is not null) or
  (kind = 'retire' and quantity > 0) or
  (kind = 'use' and quantity > 0) or
  (kind = 'adjust')
);

-- ----------------------------------------------------------------------------
-- GUEST PRIORITY DISCOUNT  (migration 20261013090000)
-- ----------------------------------------------------------------------------
-- Guests buy single tickets only (no membership plans, no VIP). The one perk is
-- "Ưu tiên": first off the waitlist, plus an optional % off the ticket price that the
-- Host sets per guest (e.g. 10, 20, 50).
alter table public.club_members add column if not exists guest_discount_pct smallint
  check (guest_discount_pct is null or guest_discount_pct between 0 and 100);

-- Former VIP guests keep their priority.
update public.club_members set guest_perk = 'priority' where guest_perk = 'vip';

-- ----------------------------------------------------------------------------
-- MEMBER AREA / PLAYING TIME / REAL RANK, MATCHES WITHOUT A SCORE  (migration 20261014090000)
-- ----------------------------------------------------------------------------
-- Where the member lives (district), how long they have played, and the Host's own
-- A-D rank from watching them play.
alter table public.club_members add column if not exists district text
  check (district is null or length(district) <= 80);
alter table public.club_members add column if not exists play_duration text
  check (play_duration is null or play_duration in ('lt6','6_12','12_18','gt18'));
alter table public.club_members add column if not exists real_rank text
  check (real_rank is null or real_rank in ('A','B','C','D'));

-- A match can be set up first (who plays whom) and scored later: no score yet = null.
alter table public.matches alter column team1_score drop not null;
alter table public.matches alter column team2_score drop not null;

-- Rankings only count matches that have a score.
create or replace view public.v_club_rankings_all_time with (security_invoker = true) as
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
where m.team1_score is not null and m.team2_score is not null
group by cm.id, cm.club_id, cm.full_name;

create or replace view public.v_club_rankings_monthly with (security_invoker = true) as
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
where m.team1_score is not null and m.team2_score is not null
group by cm.id, cm.club_id, cm.full_name, date_trunc('month', m.played_at);

-- ----------------------------------------------------------------------------
-- STAFF ACCESS: WIDER SCOPES AND A VALIDITY WINDOW  (migration 20261015090000)
-- ----------------------------------------------------------------------------
-- With no club and no event, a grant covers: 'all' = every event of the Host (as before),
-- 'clubs' = every club's sessions (not Xé Vé), 'xeve' = only the Host's Xé Vé games.
alter table public.staff_grants add column if not exists scope text not null default 'all'
  check (scope in ('all','clubs','xeve'));
-- Optional dates the access is valid for (inclusive). Empty = no limit.
alter table public.staff_grants add column if not exists valid_from date;
alter table public.staff_grants add column if not exists valid_until date;
do $$ begin
  alter table public.staff_grants add constraint chk_staff_valid_range
    check (valid_from is null or valid_until is null or valid_until >= valid_from);
exception when duplicate_object then null; end $$;

drop index if exists public.ux_staff_grants_scope;
create unique index if not exists ux_staff_grants_scope on public.staff_grants (
  host_id, email, scope,
  coalesce(club_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- ----------------------------------------------------------------------------
-- TOURNAMENT LIVE SCORING  (migration 20261016090000)
-- ----------------------------------------------------------------------------
-- One row per tournament match (or team-league sub-match) being scored point by point.
-- The score is rebuilt from `log` (one event per rally / serve choice, see
-- backend/src/services/liveScore.js), so undo = drop the last event.
create table if not exists public.tournament_live (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid references public.tournament_matches(id) on delete cascade,
  sub_match_id uuid references public.tournament_sub_matches(id) on delete cascade,
  court text,
  config jsonb not null,
  players jsonb not null default '{}'::jsonb,
  log text[] not null default '{}',
  status text not null default 'live' check (status in ('live','saved')),
  scorer_name text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((match_id is null) <> (sub_match_id is null))
);
create unique index if not exists ux_tlive_match on public.tournament_live (match_id) where match_id is not null;
create unique index if not exists ux_tlive_sub on public.tournament_live (sub_match_id) where sub_match_id is not null;
create index if not exists ix_tlive_tournament on public.tournament_live (tournament_id);
alter table public.tournament_live enable row level security;
drop policy if exists p_tlive_owner on public.tournament_live;
create policy p_tlive_owner on public.tournament_live for all
  using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id and t.host_id = auth.uid()));

-- Public live board link (/live/<token>): off until the Host turns it on.
alter table public.tournaments add column if not exists live_token text;
create unique index if not exists ux_tournaments_live_token on public.tournaments (live_token) where live_token is not null;

-- ----------------------------------------------------------------------------
-- MATCH TIMING + SCORE FORMAT  (migration 20261017090000)
-- ----------------------------------------------------------------------------
-- Live scoring keeps the time of every event (epoch ms, same order as `log`), so the
-- app knows when the match / each game started and ended.
alter table public.tournament_live add column if not exists stamps bigint[] not null default '{}';
-- How long a match took (seconds; from live scoring or typed in) and the format its games
-- were played to ({ points, win_by, best_of, scoring }), so a later edit checks the score
-- against the right rules (e.g. badminton games to 15).
alter table public.tournament_matches add column if not exists duration_sec int;
alter table public.tournament_matches add column if not exists score_format jsonb;
alter table public.tournament_sub_matches add column if not exists duration_sec int;
alter table public.tournament_sub_matches add column if not exists score_format jsonb;
do $$ begin
  alter table public.tournament_matches add constraint chk_tmatch_duration check (duration_sec is null or duration_sec between 0 and 86400);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tournament_sub_matches add constraint chk_tsub_duration check (duration_sec is null or duration_sec between 0 and 86400);
exception when duplicate_object then null; end $$;

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

-- ----------------------------------------------------------------------------
-- ROUND ROBIN TOURNAMENTS + MEETING VOTES  (migration 20261019090000)
-- ----------------------------------------------------------------------------
-- Round robin ("vòng tròn tính điểm"): one table, every team plays every other team,
-- no knockout. Stored as group_count = 1 and advance_per_group = 0.
alter table public.tournaments drop constraint if exists tournaments_advance_per_group_check;
alter table public.tournaments add constraint tournaments_advance_per_group_check
  check (advance_per_group between 0 and 8);

-- Meetings / get-togethers (events.kind = 'meeting'): club members vote whether they
-- come. One vote per member per event; the Host can also mark votes for members.
create table if not exists public.event_votes (
  event_id uuid not null references public.events(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  choice text not null check (choice in ('yes','no')),
  by_host boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (event_id, club_member_id)
);
create index if not exists ix_event_votes_member on public.event_votes (club_member_id);
alter table public.event_votes enable row level security;
drop policy if exists p_event_votes_owner on public.event_votes;
create policy p_event_votes_owner on public.event_votes for select
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- RANKS PER TOURNAMENT  (migration 20261020090000)
-- ----------------------------------------------------------------------------
-- Rank A–D is set for each tournament (only to pair players evenly), not kept on the
-- member: who is "A" changes as the club grows. { "<club_member_id>": "A" | "B" | "C" | "D" }
alter table public.tournaments add column if not exists player_ranks jsonb not null default '{}'::jsonb;
-- club_members.real_rank is no longer shown or edited (kept so nothing is lost).

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

-- ----------------------------------------------------------------------------
-- MONTHLY FUND CALCULATOR  (migration 20261022090000)
-- ----------------------------------------------------------------------------
-- The Host's worksheet for the monthly fee each member pays (court rent per hour,
-- hours per session, sessions per month, fixed-booking discount, balls, water,
-- members, rounding, guest prices per time slot). Kept per club as JSON so the
-- Host opens it with last month's numbers.
alter table public.clubs add column if not exists fund_calc jsonb;

-- ----------------------------------------------------------------------------
-- BALL LOG + XÉ VÉ BALL STORE  (migration 20261023090000)
-- ----------------------------------------------------------------------------
-- 1. A ball store can belong to an organiser's Xé Vé space (host_id, no club) as
--    well as to a club.
-- 2. Each session logs the new balls taken out of the box ('use') and the balls in
--    play that broke ('broken' — out of play, the box count doesn't change), so the
--    ball table shows new / old / broken / taken out / bought / left per session.
alter table public.inventory_items add column if not exists host_id uuid references public.users(id) on delete cascade;
update public.inventory_items i set host_id = c.host_id from public.clubs c where c.id = i.club_id and i.host_id is null;
alter table public.inventory_items alter column club_id drop not null;
alter table public.inventory_items drop constraint if exists chk_inventory_owner;
alter table public.inventory_items add constraint chk_inventory_owner check (club_id is not null or host_id is not null);
create index if not exists ix_inventory_items_host on public.inventory_items (host_id) where club_id is null;

alter table public.inventory_moves drop constraint if exists inventory_moves_kind_check;
alter table public.inventory_moves add constraint inventory_moves_kind_check check (kind in ('purchase','retire','adjust','use','broken'));
alter table public.inventory_moves drop constraint if exists chk_move_shape;
alter table public.inventory_moves add constraint chk_move_shape check (
  (kind = 'purchase' and quantity > 0 and unit_cost is not null) or
  (kind in ('retire','use','broken') and quantity > 0) or
  (kind = 'adjust')
);

drop policy if exists p_inventory_owner on public.inventory_items;
create policy p_inventory_owner on public.inventory_items for all
  using (host_id = auth.uid() or exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()))
  with check (host_id = auth.uid() or exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()));
drop policy if exists p_inventory_moves_owner on public.inventory_moves;
create policy p_inventory_moves_owner on public.inventory_moves for all
  using (exists (select 1 from public.inventory_items i left join public.clubs c on c.id = i.club_id
                 where i.id = item_id and (i.host_id = auth.uid() or c.host_id = auth.uid())))
  with check (exists (select 1 from public.inventory_items i left join public.clubs c on c.id = i.club_id
                      where i.id = item_id and (i.host_id = auth.uid() or c.host_id = auth.uid())));

-- ----------------------------------------------------------------------------
-- EMAIL NOTICES TO PLAYERS  (migration 20261024090000)
-- ----------------------------------------------------------------------------
-- The Host turns emails to players on (off by default — it needs the app's own
-- domain verified on Resend). Each player can opt out of them.
alter table public.users add column if not exists notify_players_email boolean not null default false;
alter table public.player_profiles add column if not exists email_notices boolean not null default true;

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

-- ----------------------------------------------------------------------------
-- OWNER CONSOLE  (migration 20261026090000)
-- ----------------------------------------------------------------------------
-- The app owner's back office (/owner): suspend accounts, internal CRM notes and an
-- append-only audit log of every change the owner makes. Only the backend (service
-- role) reads or writes these.
alter table public.users add column if not exists suspended_at timestamptz;
alter table public.users add column if not exists suspended_reason text;

create table if not exists public.owner_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_email text not null,
  action text not null,
  target_host_id uuid references public.users(id) on delete set null,
  target_email text,
  old_value jsonb,
  new_value jsonb,
  note text,
  undone_at timestamptz,
  undo_of uuid references public.owner_audit_logs(id) on delete set null
);
create index if not exists ix_owner_audit_created on public.owner_audit_logs (created_at desc);
create index if not exists ix_owner_audit_target on public.owner_audit_logs (target_host_id, created_at desc);

-- Append-only: rows are never deleted; the only change allowed is marking one undone.
create or replace function public.owner_audit_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'owner_audit_logs is append-only';
  end if;
  if old.undone_at is not null or new.undone_at is null
     or (to_jsonb(new) - 'undone_at') <> (to_jsonb(old) - 'undone_at') then
    raise exception 'owner_audit_logs is append-only (only undone_at may be set once)';
  end if;
  return new;
end; $$;
drop trigger if exists trg_owner_audit_guard on public.owner_audit_logs;
create trigger trg_owner_audit_guard before update or delete on public.owner_audit_logs
  for each row execute function public.owner_audit_guard();

create table if not exists public.owner_notes (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  author_email text not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_owner_notes_host on public.owner_notes (host_id, created_at desc);

-- Last sign-in time lives in auth.users, which the REST API can't read directly.
create or replace function public.owner_last_sign_in(ids uuid[])
returns table (id uuid, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query select u.id, u.last_sign_in_at from auth.users u where u.id = any(ids);
end; $$;

alter table public.owner_audit_logs enable row level security;
alter table public.owner_notes enable row level security;
revoke all on public.owner_audit_logs from anon, authenticated;
revoke all on public.owner_notes from anon, authenticated;
revoke all on function public.owner_last_sign_in(uuid[]) from public, anon, authenticated;
grant execute on function public.owner_last_sign_in(uuid[]) to service_role;

-- ----------------------------------------------------------------------------
-- OWNER AUDIT GUARD FIX  (migration 20261026100000)
-- ----------------------------------------------------------------------------
-- Deleting an account sets owner_audit_logs.target_host_id to null (on delete set
-- null), which the append-only guard used to refuse — so the account could not be
-- deleted. Allow exactly that (and undo_of losing its row), still nothing else.
create or replace function public.owner_audit_guard() returns trigger
language plpgsql as $$
declare
  changed jsonb := to_jsonb(new) - 'undone_at' - 'target_host_id' - 'undo_of';
  before jsonb := to_jsonb(old) - 'undone_at' - 'target_host_id' - 'undo_of';
begin
  if tg_op = 'DELETE' then
    raise exception 'owner_audit_logs is append-only';
  end if;
  if changed <> before
     or (new.target_host_id is distinct from old.target_host_id and new.target_host_id is not null)
     or (new.undo_of is distinct from old.undo_of and new.undo_of is not null)
     or (new.undone_at is distinct from old.undone_at and (old.undone_at is not null or new.undone_at is null)) then
    raise exception 'owner_audit_logs is append-only (only undone_at may be set once)';
  end if;
  return new;
end; $$;

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

-- ----------------------------------------------------------------------------
-- CLUB MEMBER ADD-ON + OWNER TRANSFER  (migration 20261028090000)
-- ----------------------------------------------------------------------------
-- Plans are bought per account; a club that outgrows its plan's member limit can get
-- extra places from the app owner (a paid licence) without changing plan.
alter table public.clubs add column if not exists extra_fixed_members int not null default 0 check (extra_fixed_members >= 0);
alter table public.clubs add column if not exists extra_guest_members int not null default 0 check (extra_guest_members >= 0);

-- The app owner hands a club to another account: the club and everything filed under
-- its owner (its sessions, their money, tournaments, ball store, staff grants) move
-- together, in one transaction. Only the backend (service role) may call it.
create or replace function public.owner_transfer_club(p_club uuid, p_new_host uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  old_host uuid;
begin
  select host_id into old_host from public.clubs where id = p_club for update;
  if old_host is null then raise exception 'club not found'; end if;
  if old_host = p_new_host then return; end if;
  update public.clubs set host_id = p_new_host where id = p_club;
  update public.events set host_id = p_new_host where club_id = p_club;
  update public.transactions set host_id = p_new_host
    where club_id = p_club or event_id in (select id from public.events where club_id = p_club);
  update public.tournaments set host_id = p_new_host where club_id = p_club;
  update public.inventory_items set host_id = p_new_host where club_id = p_club and host_id is not null;
  update public.staff_grants set host_id = p_new_host where club_id = p_club;
end; $$;
revoke all on function public.owner_transfer_club(uuid, uuid) from public, anon, authenticated;
grant execute on function public.owner_transfer_club(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- CLUB STAFF ROLES: FINANCE + OPERATIONS  (migration 20261029090000)
-- ----------------------------------------------------------------------------
-- Besides co-admins (full rights), a club owner on the Advanced / Pro plan can give
-- someone the Finance role (money, plans, payments, reports) or the Operations role
-- (members' basic info, attendance, check-in, activities, matches, balls). Both are
-- for one club. What each may do is enforced by the backend (services/clubRoles.js).
alter type event_role add value if not exists 'finance';
alter type event_role add value if not exists 'operator';

alter table public.staff_grants drop constraint if exists chk_staff_club_roles;
alter table public.staff_grants add constraint chk_staff_club_roles
  check (role::text not in ('finance', 'operator') or (club_id is not null and event_id is null));

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

-- ---- 20261031090000_promo_codes.sql ----
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

-- ---- 20261101090000_pro_club_tools.sql ----
-- Pro club tools: activity log, custom permissions per staff grant, duty roster.

-- Who did what in a club (every successful change made through the app). Written
-- by the backend only; nobody edits or deletes entries (the club's deletion removes them).
create table if not exists club_activity_logs (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  actor_email text,
  actor_role text,
  action text not null,
  method text not null,
  path text not null,
  target text check (char_length(target) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists club_activity_logs_club_idx on club_activity_logs(club_id, created_at desc);

create or replace function club_activity_guard() returns trigger language plpgsql as $$
begin
  -- The only change allowed: the actor's account was deleted (FK sets actor_id to null).
  if new.actor_id is null and old.actor_id is not null
     and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;
  raise exception 'club_activity_logs is append-only';
end $$;
drop trigger if exists trg_club_activity_guard on club_activity_logs;
create trigger trg_club_activity_guard before update on club_activity_logs
  for each row execute function club_activity_guard();

-- Custom permissions for a Finance / Operations grant (Pro): permission groups that
-- replace the role's defaults. null = the role's defaults.
alter table staff_grants add column if not exists permissions text[];

-- Duty roster: shifts in a club and who is on each.
create table if not exists duty_shifts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  shift_date date not null,
  start_time time,
  end_time time,
  notes text check (char_length(notes) <= 300),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists duty_shifts_club_date_idx on duty_shifts(club_id, shift_date);

create table if not exists duty_shift_people (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references duty_shifts(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  full_name text,
  unique (shift_id, email)
);

alter table club_activity_logs enable row level security;
alter table duty_shifts enable row level security;
alter table duty_shift_people enable row level security;
revoke all on club_activity_logs, duty_shifts, duty_shift_people from anon, authenticated;

-- ---- 20261102090000_support_staff_drop_telegram.sql ----
-- Support staff for the owner console, and the end of Telegram notifications.

-- People who help run the app (support desk). Added and removed by an owner
-- (OWNER_EMAILS) in Owner Console → Nhân viên; each gets only the parts of the console
-- listed in `permissions`. Owner rights themselves are never stored in the database.
create table if not exists support_staff (
  email text primary key check (email = lower(trim(email)) and email like '%_@_%'),
  full_name text check (char_length(full_name) <= 80),
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table support_staff enable row level security;
revoke all on support_staff from anon, authenticated;

-- Telegram notifications were removed (the bot API is no longer free): forget the
-- players' chat ids and link codes.
drop index if exists ux_player_telegram_code;
alter table player_profiles drop column if exists telegram_chat_id;
alter table player_profiles drop column if exists telegram_link_code;

-- ---- 20261103090000_username_signup.sql ----
-- Sign-in with a username, and the details asked at sign-up.
--   username:   3–30 characters (a–z, 0–9, . and _), starts with a letter, unique
--               (case-insensitive). Signs in instead of the email; older accounts
--               without one keep signing in with their email.
--   birth_date, gender, region: asked at sign-up (region = province / city they live in).

alter table public.users add column if not exists username text;
alter table public.users add column if not exists birth_date date;
alter table public.users add column if not exists gender text;
alter table public.users add column if not exists region text;

do $$ begin
  alter table public.users add constraint chk_users_username
    check (username is null or username ~ '^[a-z][a-z0-9._]{2,29}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.users add constraint chk_users_gender
    check (gender is null or gender in ('male', 'female', 'other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.users add constraint chk_users_region
    check (region is null or char_length(region) <= 80);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.users add constraint chk_users_birth_date
    check (birth_date is null or birth_date between date '1900-01-01' and current_date);
exception when duplicate_object then null; end $$;

create unique index if not exists ux_users_username on public.users (lower(username)) where username is not null;

-- New accounts: copy the sign-up details (sent as user metadata) onto public.users.
-- Never blocks the sign-up: a bad or taken value is simply left empty.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb;
begin
  begin
    insert into public.users (id, email) values (new.id, new.email)
      on conflict (id) do nothing;
    insert into public.host_subscriptions (host_id) values (new.id)
      on conflict (host_id) do nothing;
  exception when others then
    raise warning 'handle_new_auth_user(%): %', new.id, sqlerrm;
  end;
  begin
    meta := coalesce(to_jsonb(new) -> 'raw_user_meta_data', '{}'::jsonb);
    update public.users set
      username = nullif(lower(meta->>'username'), ''),
      birth_date = nullif(meta->>'birth_date', '')::date,
      gender = nullif(meta->>'gender', ''),
      region = nullif(meta->>'region', '')
    where id = new.id;
  exception when others then
    raise warning 'handle_new_auth_user details(%): %', new.id, sqlerrm;
  end;
  return new;
end; $$;

-- ---- 20261104090000_club_requests_discovery.sql ----
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


-- ---- 20261105090000_member_moderation_invites.sql ----
-- Paid club requests, invite links, the "to review" table, moderation history,
-- blocks and on-screen notices for players.
--   1. club_requests.payment_id: the plan order paid with the request (every club
--      request pays for its plan; there is no free trial any more).
--   2. club_members.join_source: also 'manual' (added by the Host with type "---") and
--      'invite' (joined through the club's invite link).
--   3. clubs.invite_token / invite_enabled: a link to join the club's waiting list.
--   4. club_members.review_*: a member moved to "to review" (suspended until a date).
--   5. member_moderation_log: every review / restore / removal / (un)block, kept even
--      after the member is deleted or the club changes hands — the next manager sees it.
--   6. member_blocks: people who may not sign up for a club's events (or for all of a
--      Host's events, Xé Vé included).
--   7. player_notices: messages shown to the player on screen (warned, back, removed).

-- ---- 1 ---------------------------------------------------------------------------------------
alter table public.club_requests add column if not exists payment_id uuid references public.plan_payments(id) on delete set null;

-- ---- 2 ---------------------------------------------------------------------------------------
alter table public.club_members drop constraint if exists chk_members_join_source;
do $$ begin
  alter table public.club_members add constraint chk_members_join_source
    check (join_source is null or join_source in ('survey', 'search', 'manual', 'invite'));
exception when duplicate_object then null; end $$;

-- ---- 3 ---------------------------------------------------------------------------------------
alter table public.clubs add column if not exists invite_token uuid not null default gen_random_uuid();
alter table public.clubs add column if not exists invite_enabled boolean not null default false;
create unique index if not exists ux_clubs_invite_token on public.clubs (invite_token);

-- ---- 4 ---------------------------------------------------------------------------------------
alter table public.club_members add column if not exists review_until timestamptz;
alter table public.club_members add column if not exists review_started_at timestamptz;
alter table public.club_members add column if not exists review_reason text;
alter table public.club_members add column if not exists review_from text;
do $$ begin
  alter table public.club_members add constraint chk_members_review check (
    (review_reason is null or char_length(review_reason) <= 500)
    and (review_from is null or review_from in ('fixed', 'guest', 'waiting')));
exception when duplicate_object then null; end $$;

-- ---- 5 ---------------------------------------------------------------------------------------
create table if not exists public.member_moderation_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  member_id uuid,              -- no foreign key: the history outlives the member
  user_id uuid,                -- no foreign key: the history outlives the account
  phone text,
  full_name text,
  action text not null check (action in ('review', 'restore', 'remove', 'unblock')),
  reason text check (reason is null or char_length(reason) <= 500),
  until timestamptz,
  from_type text,
  to_type text,
  blocked boolean not null default false,
  block_scope text check (block_scope is null or block_scope in ('club', 'all')),
  actor_email text,
  created_at timestamptz not null default now()
);
create index if not exists ix_moderation_club on public.member_moderation_log (club_id, created_at desc);
create index if not exists ix_moderation_user on public.member_moderation_log (club_id, user_id);
alter table public.member_moderation_log enable row level security;

-- Append-only: rows are never edited; they only go when their club is deleted.
create or replace function public.member_moderation_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.clubs where id = old.club_id) then
    return old;
  end if;
  raise exception 'member_moderation_log is append-only';
end; $$;
drop trigger if exists trg_member_moderation_guard on public.member_moderation_log;
create trigger trg_member_moderation_guard before update or delete on public.member_moderation_log
  for each row execute function public.member_moderation_guard();

-- ---- 6 ---------------------------------------------------------------------------------------
create table if not exists public.member_blocks (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete cascade,
  scope text not null default 'club' check (scope in ('club', 'all')),
  user_id uuid,
  phone text,
  full_name text,
  reason text check (reason is null or char_length(reason) <= 500),
  created_by text,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by text,
  check (user_id is not null or phone is not null)
);
create index if not exists ix_member_blocks_club on public.member_blocks (club_id) where lifted_at is null;
create index if not exists ix_member_blocks_host on public.member_blocks (host_id) where lifted_at is null;
alter table public.member_blocks enable row level security;

-- ---- 7 ---------------------------------------------------------------------------------------
create table if not exists public.player_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  club_name text,
  kind text not null check (kind in ('warning', 'restored', 'removed')),
  reason text check (reason is null or char_length(reason) <= 500),
  until timestamptz,
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists ix_player_notices_user on public.player_notices (user_id, created_at desc);
alter table public.player_notices enable row level security;


-- ============================================================================
-- 20261106090000_weekly_series_costs
-- ============================================================================
-- Weekly schedule v5: sessions of one weekly schedule share a series (edit them all at
-- once), what the fee includes, which play format, a Google Maps link for the court,
-- and the costs of each session (court, water…) booked into the ledger automatically.

-- 1. Series: every session created together by "Tạo lịch chơi hàng tuần".
alter table public.events add column if not exists series_id uuid;
create index if not exists ix_events_series on public.events (series_id) where series_id is not null;
-- Older weekly schedules: sessions inserted together share created_at (one insert).
with groups as (
  select club_id, created_at, title, gen_random_uuid() as sid
  from public.events
  where kind = 'weekly' and club_id is not null and series_id is null
  group by club_id, created_at, title
  having count(*) > 1
)
update public.events e set series_id = g.sid
from groups g
where e.series_id is null and e.kind = 'weekly'
  and e.club_id = g.club_id and e.created_at = g.created_at and e.title = g.title;

-- 2. What the fee includes (balls, water, fruit…), shown under the fee.
alter table public.events add column if not exists services text
  check (services is null or char_length(services) <= 300);

-- 3. Play format: full men / full women / mixed / open to all.
alter table public.events add column if not exists play_format text
  check (play_format is null or play_format in ('men', 'women', 'mixed', 'open'));

-- 4. A Google Maps link to the court (otherwise the address is searched on Google Maps).
alter table public.events add column if not exists map_url text
  check (map_url is null or (char_length(map_url) <= 500 and map_url ~* '^https://'));

-- 5. Costs of one session: [{ "category": "court", "amount": 300000, "note": "..." }].
alter table public.events add column if not exists cost_items jsonb not null default '[]'::jsonb;
-- Ledger entries written from those costs (re-written when the costs change).
alter table public.transactions add column if not exists event_cost boolean not null default false;
create index if not exists ix_transactions_event on public.transactions (event_id) where event_id is not null;

-- v_event_summary selects e.*, so rebuild it to include the new columns.
drop view if exists public.v_event_summary;
create view public.v_event_summary as
select
  e.*,
  c.name as club_name,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text in ('registered','checked_in','pending')) as main_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status = 'waitlisted') as waitlist_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text = 'pending') as pending_count
from public.events e
left join public.clubs c on c.id = e.club_id;


-- ============================================================================
-- 20261107090000_event_approval_organizers
-- ============================================================================
-- Events v6: the Host approves each sign-up before the player pays, organizers
-- (Host / co-hosts) on the participant list, and a short sign-up link.

-- 1. New participant states:
--    requested   = asked to join through the link, waiting for the Host to check them
--    not_playing = an organizer who runs the event but does not play
alter type public.participant_status add value if not exists 'requested';
alter type public.participant_status add value if not exists 'not_playing';

-- 2. "Duyệt tự động": off = the Host approves every sign-up first (the default for new
--    events). Events made before this keep working as they did (auto approve).
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'auto_approve') then
    alter table public.events add column auto_approve boolean not null default false;
    update public.events set auto_approve = true;
  end if;
end $$;

-- 3. Short sign-up link: /e/<8 characters> instead of the full token.
alter table public.events add column if not exists short_code text;
update public.events set short_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) where short_code is null;
alter table public.events alter column short_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
alter table public.events alter column short_code set not null;
create unique index if not exists ux_events_short_code on public.events (short_code);

-- 4. Organizers and roles on the participant list.
alter table public.event_participants add column if not exists is_organizer boolean not null default false;
alter table public.event_participants add column if not exists tags text[] not null default '{}'
  check (tags <@ array['coach', 'referee']::text[]);

-- v_event_summary selects e.*: rebuild it (new columns + waiting-for-approval count).
drop view if exists public.v_event_summary;
create view public.v_event_summary as
select
  e.*,
  c.name as club_name,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text in ('registered','checked_in','pending')) as main_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status = 'waitlisted') as waitlist_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text = 'pending') as pending_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text = 'requested') as requested_count
from public.events e
left join public.clubs c on c.id = e.club_id;


select 1; -- done
notify pgrst, 'reload schema';
