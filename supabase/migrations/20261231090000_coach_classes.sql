-- Coach Manager (đợt C2): session packages, classes and their sessions.
create table if not exists public.coach_packages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  sessions int not null check (sessions between 1 and 200),
  price int not null check (price >= 0),
  valid_months int not null default 2 check (valid_months between 1 and 24),
  note text check (note is null or length(note) <= 300),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ix_coach_packages_coach on public.coach_packages (coach_id);

create table if not exists public.coach_classes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  kind text not null default 'group' check (kind in ('group','private','single')),
  court_name text check (court_name is null or length(court_name) <= 160),
  map_url text check (map_url is null or length(map_url) <= 500),
  start_time time not null,
  duration_min int not null default 90 check (duration_min between 15 and 480),
  weekdays int[] not null default '{}',             -- 0 = Monday … 6 = Sunday
  date_from date,
  date_to date,
  capacity int not null default 8 check (capacity between 1 and 100),
  fee int not null default 0 check (fee >= 0),      -- per session, 0 = package only
  signup_deadline_hours int not null default 2 check (signup_deadline_hours between 0 and 168),
  waitlist boolean not null default true,
  deduct_mode text check (deduct_mode is null or deduct_mode in ('present_or_noshow','present_only','always')),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'open' check (status in ('open','closed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_coach_classes_coach on public.coach_classes (coach_id, status);

create table if not exists public.coach_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.coach_classes(id) on delete cascade,
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  session_date date not null,
  start_time time not null,
  duration_min int not null check (duration_min between 15 and 480),
  court_name text,
  status text not null default 'scheduled' check (status in ('scheduled','done','cancelled')),
  note text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists ix_coach_sessions_coach_date on public.coach_sessions (coach_id, session_date);
create index if not exists ix_coach_sessions_class on public.coach_sessions (class_id, session_date);

alter table public.coach_packages enable row level security;
alter table public.coach_classes enable row level security;
alter table public.coach_sessions enable row level security;
revoke all on public.coach_packages, public.coach_classes, public.coach_sessions from anon, authenticated;
