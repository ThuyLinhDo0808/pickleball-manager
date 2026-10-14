-- DUPR tự liên kết: lưu danh sách thành viên của club trên DUPR (lần nhập file gần nhất) để
-- người chơi khai DUPR ID sau này vẫn được ghép ngay, và lịch sử điểm DUPR của từng thành viên
-- (thống kê điểm lên / xuống).
create table if not exists public.club_dupr_roster (
  club_id uuid not null references public.clubs(id) on delete cascade,
  dupr_id text not null check (dupr_id ~ '^[A-Z0-9]{4,10}$'),
  name text,
  doubles numeric(5,3),
  doubles_rel smallint,
  singles numeric(5,3),
  singles_rel smallint,
  first_seen_at timestamptz not null default now(),  -- lần đầu có trong file
  last_seen_at timestamptz not null default now(),   -- lần gần nhất có trong file
  primary key (club_id, dupr_id)
);

create table if not exists public.dupr_rating_history (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  dupr_id text not null,
  doubles numeric(5,3),
  singles numeric(5,3),
  recorded_at timestamptz not null default now()
);
create index if not exists dupr_rating_history_member_idx on public.dupr_rating_history (club_member_id, recorded_at);
create index if not exists dupr_rating_history_club_idx on public.dupr_rating_history (club_id, recorded_at);

-- Mỗi lần nhập file: bao nhiêu dòng, trùng, ID mới, người được ghép mới, người được cập nhật điểm.
create table if not exists public.club_dupr_imports (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  rows_total int not null default 0,
  duplicates int not null default 0,
  new_ids int not null default 0,
  linked_new int not null default 0,
  updated int not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists club_dupr_imports_club_idx on public.club_dupr_imports (club_id, created_at);

alter table public.club_dupr_roster enable row level security;
alter table public.dupr_rating_history enable row level security;
alter table public.club_dupr_imports enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.club_dupr_roster, public.dupr_rating_history, public.club_dupr_imports from %I', r);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
