-- ----------------------------------------------------------------------------
-- CLUB STAFF ROLES: FINANCE + OPERATIONS  (migration 20261029090000)
-- ----------------------------------------------------------------------------
-- Besides co-admins (full rights), a club owner on the Advanced / Pro plan can give
-- someone the Finance role (money, plans, payments, reports) or the Operations role
-- (members' basic info, attendance, check-in, activities, matches, balls). Both are
-- for one club. What each may do is enforced by the backend (services/clubRoles.js).
alter type event_role add value if not exists 'finance';
alter type event_role add value if not exists 'operator';

alter table public.staff_grants drop constraint if exists chk_staff_club_roles;
alter table public.staff_grants add constraint chk_staff_club_roles
  check (role::text not in ('finance', 'operator') or (club_id is not null and event_id is null));
