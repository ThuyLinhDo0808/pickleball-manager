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

notify pgrst, 'reload schema';
