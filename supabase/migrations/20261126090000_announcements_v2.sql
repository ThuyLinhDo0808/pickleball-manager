-- ---- 20261126090000_announcements_v2.sql ----
-- Owner Console → Thông báo, more kinds:
--   kind 'maintenance': from starts_at to ends_at nobody but the Owner can sign in or use the
--   app (everyone sees the maintenance page with the time it comes back); before that the
--   notice shows as a warning banner.
--   audience: everyone / Host (club & community managers) / players; or one club's people.
--   send_email: also email the audience once (emailed_at / emailed_count record it).
alter table public.announcements add column if not exists kind text not null default 'notice';
alter table public.announcements add column if not exists audience text not null default 'all';
alter table public.announcements add column if not exists club_id uuid references public.clubs(id) on delete cascade;
alter table public.announcements add column if not exists title text;
alter table public.announcements add column if not exists send_email boolean not null default false;
alter table public.announcements add column if not exists emailed_at timestamptz;
alter table public.announcements add column if not exists emailed_count int;
do $$ begin
  alter table public.announcements add constraint chk_announcements_kind check (kind in ('notice', 'maintenance'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.announcements add constraint chk_announcements_audience check (audience in ('all', 'hosts', 'players'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.announcements add constraint chk_announcements_title check (title is null or length(title) <= 120);
exception when duplicate_object then null; end $$;
create index if not exists ix_announcements_kind on public.announcements (kind, active, starts_at);
