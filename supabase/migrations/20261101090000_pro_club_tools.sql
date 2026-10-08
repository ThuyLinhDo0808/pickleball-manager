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
