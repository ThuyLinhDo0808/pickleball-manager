-- Coach Manager (đợt C3): students and class enrolments.
-- A student is a person the coach teaches: an account (user_id) or, for a quick sign-up
-- without one, a name + phone; the account is linked later by the same phone.
create table if not exists public.coach_students (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  full_name text not null check (length(full_name) between 1 and 120),
  phone text check (phone is null or length(phone) <= 20),
  phone_key text,                               -- digits only, last 9, for matching
  level_text text check (level_text is null or length(level_text) <= 80),
  note text check (note is null or length(note) <= 2000),   -- coach's own notes, never shown to the student
  status text not null default 'active' check (status in ('active','left','blocked')),
  first_seen timestamptz not null default now()
);
create unique index if not exists ux_coach_students_user on public.coach_students (coach_id, user_id) where user_id is not null;
create index if not exists ix_coach_students_coach on public.coach_students (coach_id, status);
create index if not exists ix_coach_students_phone on public.coach_students (coach_id, phone_key);

create table if not exists public.coach_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.coach_classes(id) on delete cascade,
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  student_id uuid not null references public.coach_students(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','confirmed','waitlist','cancelled','removed')),
  pay_mode text not null default 'package' check (pay_mode in ('package','per_session','free')),
  source text not null default 'account' check (source in ('account','quick','coach')),
  token uuid not null default gen_random_uuid(),   -- the quick sign-up's own link
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  cancelled_at timestamptz
);
create unique index if not exists ux_coach_enrollments_token on public.coach_enrollments (token);
create unique index if not exists ux_coach_enrollments_live on public.coach_enrollments (class_id, student_id) where status in ('requested','confirmed','waitlist');
create index if not exists ix_coach_enrollments_class on public.coach_enrollments (class_id, status);
create index if not exists ix_coach_enrollments_coach on public.coach_enrollments (coach_id, status);

alter table public.coach_students enable row level security;
alter table public.coach_enrollments enable row level security;
revoke all on public.coach_students, public.coach_enrollments from anon, authenticated;
