-- Báo lỗi / Liên hệ nhà phát triển:
--   host_addons   — tính năng bật riêng cho từng Host (Owner bật / tắt):
--                   finance_pro (Phân tích tài chính), coach_manager, tournament_manager
--   dev_requests  — Host đăng ký quan tâm một tính năng trả phí; Owner duyệt = bật tính năng
--   featured_communities.host_note / host_info — lời nhắn + số liệu cộng đồng khi đăng ký Top 10
create table if not exists public.host_addons (
  host_id uuid not null references public.users(id) on delete cascade,
  addon text not null check (addon in ('finance_pro', 'coach_manager', 'tournament_manager')),
  enabled boolean not null default true,
  note text check (note is null or char_length(note) <= 500),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (host_id, addon)
);

create table if not exists public.dev_requests (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  kind text not null check (kind in ('finance_pro', 'coach_manager', 'tournament_manager')),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'approved', 'rejected', 'cancelled')),
  owner_note text check (owner_note is null or char_length(owner_note) <= 500),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dev_requests_status_idx on public.dev_requests (status, created_at desc);
-- One open request per Host and feature.
create unique index if not exists dev_requests_open_idx on public.dev_requests (host_id, kind) where status = 'open';

alter table public.featured_communities add column if not exists host_note text check (host_note is null or char_length(host_note) <= 1000);
alter table public.featured_communities add column if not exists host_info jsonb;

alter table public.host_addons enable row level security;
alter table public.dev_requests enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.host_addons from %I', r);
      execute format('revoke all on public.dev_requests from %I', r);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
