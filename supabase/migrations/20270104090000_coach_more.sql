-- Coach Manager (đợt C6 – C8): Owner moderation, progress notes, reviews, open hours with
-- 1-1 booking, reports, assistants.

-- C6: why the Ban quản trị blocked a profile (status = 'blocked' already exists).
alter table public.coach_profiles add column if not exists blocked_at timestamptz;
alter table public.coach_profiles add column if not exists block_reason text check (block_reason is null or length(block_reason) <= 500);

-- C6: a signed-in person reports a coach profile; the Ban quản trị reads them.
create table if not exists public.coach_reports (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  reason text not null check (length(reason) between 3 and 1000),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists ix_coach_reports_coach on public.coach_reports (coach_id, status);

-- C7: notes on a student's progress (optionally tied to a session, optionally a video link);
-- "shared" notes are shown to the student, the others stay the coach's own.
create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  student_id uuid not null references public.coach_students(id) on delete cascade,
  session_id uuid references public.coach_sessions(id) on delete set null,
  body text not null check (length(body) between 1 and 2000),
  video_url text check (video_url is null or (length(video_url) <= 500 and video_url ~ '^https://')),
  shared boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ix_coach_notes_student on public.coach_notes (student_id, created_at desc);

-- C7: a student's review of the coach (one per student; editable). Only someone who was
-- present at least once may write one. The Ban quản trị can hide a review.
create table if not exists public.coach_reviews (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  student_id uuid not null references public.coach_students(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  body text check (body is null or length(body) <= 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_coach_reviews on public.coach_reviews (coach_id, student_id);

-- C7: open hours for 1-1 lessons (weekly) and the bookings students ask for in them.
create table if not exists public.coach_slots (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),           -- 0 = Monday … 6 = Sunday
  start_time time not null,
  end_time time not null,
  lesson_min int not null default 60 check (lesson_min between 30 and 240),
  price int not null default 0 check (price >= 0),                 -- per lesson; 0 = package only
  court_name text check (court_name is null or length(court_name) <= 160),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists ix_coach_slots_coach on public.coach_slots (coach_id, weekday);

create table if not exists public.coach_bookings (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  student_id uuid not null references public.coach_students(id) on delete cascade,
  slot_id uuid references public.coach_slots(id) on delete set null,
  session_date date not null,
  start_time time not null,
  duration_min int not null check (duration_min between 30 and 240),
  pay_mode text not null default 'package' check (pay_mode in ('package','per_session','free')),
  note text check (note is null or length(note) <= 500),
  status text not null default 'requested' check (status in ('requested','accepted','declined','cancelled')),
  decline_note text check (decline_note is null or length(decline_note) <= 300),
  class_id uuid references public.coach_classes(id) on delete set null,
  session_id uuid references public.coach_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists ix_coach_bookings_coach on public.coach_bookings (coach_id, status, session_date);
create unique index if not exists ux_coach_bookings_live on public.coach_bookings (coach_id, session_date, start_time) where status in ('requested','accepted');

-- C8: assistants the coach invites by email; they take attendance (no money, no phones).
create table if not exists public.coach_assistants (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  email text not null check (length(email) between 3 and 200),
  user_id uuid references public.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now()
);
create unique index if not exists ux_coach_assistants on public.coach_assistants (coach_id, lower(email)) where status = 'active';

alter table public.coach_attendance add column if not exists by_assistant uuid references public.users(id) on delete set null;

alter table public.coach_reports enable row level security;
alter table public.coach_notes enable row level security;
alter table public.coach_reviews enable row level security;
alter table public.coach_slots enable row level security;
alter table public.coach_bookings enable row level security;
alter table public.coach_assistants enable row level security;
revoke all on public.coach_reports, public.coach_notes, public.coach_reviews, public.coach_slots, public.coach_bookings, public.coach_assistants from anon, authenticated;
