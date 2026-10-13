-- ----------------------------------------------------------------------------
-- CUỘC ĐUA TOP THÁNG + VOUCHER QUÀ  (migration 20261117090000)
-- ----------------------------------------------------------------------------
-- A community (Social Manager) can run a monthly race among its fixed members:
-- +1 per kèo checked in, +2 per match won, -2 per no-show; at least 4 kèo in the month
-- and a member since the 15th to win. At the end of the month the app gives the top 3
-- (of each level group when split) a voucher: free kèo / 50% off, used at sign-up.
alter table public.clubs add column if not exists race_enabled boolean not null default false;
alter table public.clubs add column if not exists race_started_on date;
alter table public.clubs add column if not exists race_split_levels boolean not null default false;
alter table public.clubs add column if not exists race_rewards jsonb not null default '{"1":"free","2":"half","3":"half"}'::jsonb;
alter table public.clubs add column if not exists race_voucher_days int not null default 30
  check (race_voucher_days between 7 and 90);

-- When the person became a fixed member (the race needs "member before the 15th").
alter table public.club_members add column if not exists fixed_since timestamptz;
update public.club_members set fixed_since = coalesce(joined_on::timestamptz, created_at)
  where member_type = 'fixed' and fixed_since is null;

-- One row per community and month once the month is closed (the final table).
create table if not exists public.race_results (
  club_id uuid not null references public.clubs(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  standings jsonb not null,
  closed_at timestamptz not null default now(),
  primary key (club_id, month)
);

create table if not exists public.race_vouchers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  club_member_id uuid references public.club_members(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  full_name text,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  level_group text,
  rank int not null check (rank between 1 and 3),
  kind text not null check (kind in ('free', 'half')),
  expires_on date not null,
  participant_id uuid references public.event_participants(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ux_race_vouchers_slot on public.race_vouchers (club_id, month, coalesce(level_group, ''), rank);
create index if not exists ix_race_vouchers_member on public.race_vouchers (club_member_id);
create index if not exists ix_race_vouchers_user on public.race_vouchers (user_id);

-- The voucher used for a sign-up and how much it took off.
alter table public.event_participants add column if not exists voucher_id uuid references public.race_vouchers(id) on delete set null;
alter table public.event_participants add column if not exists voucher_discount int;

alter table public.race_results enable row level security;
alter table public.race_vouchers enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.race_results, public.race_vouchers from %I', r);
    end if;
  end loop;
end $$;

-- fixed_since follows member_type: set when someone becomes a fixed member.
create or replace function public.trg_fixed_since() returns trigger language plpgsql as $$
begin
  if new.member_type = 'fixed' and (tg_op = 'INSERT' or old.member_type is distinct from 'fixed') then
    new.fixed_since := coalesce(case when tg_op = 'INSERT' then new.fixed_since end, now());
  elsif new.member_type <> 'fixed' then
    new.fixed_since := null;
  end if;
  return new;
end $$;
drop trigger if exists club_members_fixed_since on public.club_members;
create trigger club_members_fixed_since before insert or update of member_type on public.club_members
  for each row execute function public.trg_fixed_since();
revoke all on function public.trg_fixed_since() from public;

notify pgrst, 'reload schema';
