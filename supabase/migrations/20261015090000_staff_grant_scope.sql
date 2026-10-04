-- ----------------------------------------------------------------------------
-- STAFF ACCESS: WIDER SCOPES AND A VALIDITY WINDOW  (migration 20261015090000)
-- ----------------------------------------------------------------------------
-- With no club and no event, a grant covers: 'all' = every event of the Host (as before),
-- 'clubs' = every club's sessions (not Xé Vé), 'xeve' = only the Host's Xé Vé games.
alter table public.staff_grants add column if not exists scope text not null default 'all'
  check (scope in ('all','clubs','xeve'));
-- Optional dates the access is valid for (inclusive). Empty = no limit.
alter table public.staff_grants add column if not exists valid_from date;
alter table public.staff_grants add column if not exists valid_until date;
do $$ begin
  alter table public.staff_grants add constraint chk_staff_valid_range
    check (valid_from is null or valid_until is null or valid_until >= valid_from);
exception when duplicate_object then null; end $$;

drop index if exists public.ux_staff_grants_scope;
create unique index if not exists ux_staff_grants_scope on public.staff_grants (
  host_id, email, scope,
  coalesce(club_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
