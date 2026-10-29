-- Coach Manager (đợt C1): a coach's profile. A product of its own, beside the club /
-- community manager — not part of any plan. One profile per account; the public page
-- lives at /coach/<slug>. Students, classes, packages come in later migrations.
create table if not exists public.coach_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  display_name text not null check (length(display_name) between 2 and 80),
  sport text not null default 'pickleball' check (sport in ('pickleball','badminton')),
  bio text check (bio is null or length(bio) <= 2000),
  level_text text check (level_text is null or length(level_text) <= 80),
  dupr_id text check (dupr_id is null or length(dupr_id) <= 20),
  area text check (area is null or length(area) <= 120),
  court_name text check (court_name is null or length(court_name) <= 160),
  map_url text check (map_url is null or length(map_url) <= 500),
  price_note text check (price_note is null or length(price_note) <= 300),
  phone text check (phone is null or length(phone) <= 20),
  status text not null default 'active' check (status in ('active','paused','blocked')),
  public boolean not null default true,
  cancel_hours int not null default 12 check (cancel_hours between 0 and 168),
  deduct_mode text not null default 'present_or_noshow' check (deduct_mode in ('present_or_noshow','present_only','always')),
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_coach_profiles_public on public.coach_profiles (public, status) where public and status = 'active';
alter table public.coach_profiles enable row level security;
-- Only the backend (service key) reads / writes; no policy for anon / authenticated.
revoke all on public.coach_profiles from anon, authenticated;
