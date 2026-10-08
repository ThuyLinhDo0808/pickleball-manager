-- ----------------------------------------------------------------------------
-- CLUB MEMBER ADD-ON + OWNER TRANSFER  (migration 20261028090000)
-- ----------------------------------------------------------------------------
-- Plans are bought per account; a club that outgrows its plan's member limit can get
-- extra places from the app owner (a paid licence) without changing plan.
alter table public.clubs add column if not exists extra_fixed_members int not null default 0 check (extra_fixed_members >= 0);
alter table public.clubs add column if not exists extra_guest_members int not null default 0 check (extra_guest_members >= 0);

-- The app owner hands a club to another account: the club and everything filed under
-- its owner (its sessions, their money, tournaments, ball store, staff grants) move
-- together, in one transaction. Only the backend (service role) may call it.
create or replace function public.owner_transfer_club(p_club uuid, p_new_host uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  old_host uuid;
begin
  select host_id into old_host from public.clubs where id = p_club for update;
  if old_host is null then raise exception 'club not found'; end if;
  if old_host = p_new_host then return; end if;
  update public.clubs set host_id = p_new_host where id = p_club;
  update public.events set host_id = p_new_host where club_id = p_club;
  update public.transactions set host_id = p_new_host
    where club_id = p_club or event_id in (select id from public.events where club_id = p_club);
  update public.tournaments set host_id = p_new_host where club_id = p_club;
  update public.inventory_items set host_id = p_new_host where club_id = p_club and host_id is not null;
  update public.staff_grants set host_id = p_new_host where club_id = p_club;
end; $$;
revoke all on function public.owner_transfer_club(uuid, uuid) from public, anon, authenticated;
grant execute on function public.owner_transfer_club(uuid, uuid) to service_role;
