-- Coach Manager (đợt C4): attendance, package purchases and per-session fees.
-- A purchase is a package a student bought (the coach records it by hand in C4; C5 adds
-- the student's own purchase with a transfer proof). Attendance deducts a session from
-- the student's live purchase, or raises a per-session fee, by the class / coach rule.
create table if not exists public.coach_package_purchases (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  student_id uuid not null references public.coach_students(id) on delete cascade,
  package_id uuid references public.coach_packages(id) on delete set null,
  name text not null check (length(name) between 1 and 80),
  sessions_total int not null check (sessions_total between 1 and 200),
  sessions_used int not null default 0 check (sessions_used >= 0),
  price int not null default 0 check (price >= 0),
  starts_on date not null default current_date,
  expires_on date,
  status text not null default 'active' check (status in ('pending','active','expired','refunded','cancelled')),
  paid_at timestamptz,
  note text check (note is null or length(note) <= 300),
  refund_amount int check (refund_amount is null or refund_amount >= 0),
  refund_reason text check (refund_reason is null or length(refund_reason) <= 300),
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ix_coach_purchases_student on public.coach_package_purchases (student_id, status);
create index if not exists ix_coach_purchases_coach on public.coach_package_purchases (coach_id, status);

create table if not exists public.coach_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_sessions(id) on delete cascade,
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  student_id uuid not null references public.coach_students(id) on delete cascade,
  status text not null check (status in ('present','absent','excused')),
  late boolean not null default false,          -- excused after the cancel deadline: counts as absent
  by_student boolean not null default false,    -- the student reported it (Tôi không đi được)
  purchase_id uuid references public.coach_package_purchases(id) on delete set null,  -- the package a session was taken from
  checked_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 300)
);
create unique index if not exists ux_coach_attendance on public.coach_attendance (session_id, student_id);
create index if not exists ix_coach_attendance_student on public.coach_attendance (student_id, checked_at desc);
create index if not exists ix_coach_attendance_coach on public.coach_attendance (coach_id, checked_at desc);

create table if not exists public.coach_session_fees (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.coach_sessions(id) on delete cascade,
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  student_id uuid not null references public.coach_students(id) on delete cascade,
  amount int not null check (amount >= 0),
  status text not null default 'unpaid' check (status in ('unpaid','paid','free')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ux_coach_session_fees on public.coach_session_fees (session_id, student_id);
create index if not exists ix_coach_session_fees_coach on public.coach_session_fees (coach_id, status);

alter table public.coach_package_purchases enable row level security;
alter table public.coach_attendance enable row level security;
alter table public.coach_session_fees enable row level security;
revoke all on public.coach_package_purchases, public.coach_attendance, public.coach_session_fees from anon, authenticated;
