-- ----------------------------------------------------------------------------
-- BALL LOG + XÉ VÉ BALL STORE  (migration 20261023090000)
-- ----------------------------------------------------------------------------
-- 1. A ball store can belong to an organiser's Xé Vé space (host_id, no club) as
--    well as to a club.
-- 2. Each session logs the new balls taken out of the box ('use') and the balls in
--    play that broke ('broken' — out of play, the box count doesn't change), so the
--    ball table shows new / old / broken / taken out / bought / left per session.
alter table public.inventory_items add column if not exists host_id uuid references public.users(id) on delete cascade;
update public.inventory_items i set host_id = c.host_id from public.clubs c where c.id = i.club_id and i.host_id is null;
alter table public.inventory_items alter column club_id drop not null;
alter table public.inventory_items drop constraint if exists chk_inventory_owner;
alter table public.inventory_items add constraint chk_inventory_owner check (club_id is not null or host_id is not null);
create index if not exists ix_inventory_items_host on public.inventory_items (host_id) where club_id is null;

alter table public.inventory_moves drop constraint if exists inventory_moves_kind_check;
alter table public.inventory_moves add constraint inventory_moves_kind_check check (kind in ('purchase','retire','adjust','use','broken'));
alter table public.inventory_moves drop constraint if exists chk_move_shape;
alter table public.inventory_moves add constraint chk_move_shape check (
  (kind = 'purchase' and quantity > 0 and unit_cost is not null) or
  (kind in ('retire','use','broken') and quantity > 0) or
  (kind = 'adjust')
);

drop policy if exists p_inventory_owner on public.inventory_items;
create policy p_inventory_owner on public.inventory_items for all
  using (host_id = auth.uid() or exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()))
  with check (host_id = auth.uid() or exists (select 1 from public.clubs c where c.id = club_id and c.host_id = auth.uid()));
drop policy if exists p_inventory_moves_owner on public.inventory_moves;
create policy p_inventory_moves_owner on public.inventory_moves for all
  using (exists (select 1 from public.inventory_items i left join public.clubs c on c.id = i.club_id
                 where i.id = item_id and (i.host_id = auth.uid() or c.host_id = auth.uid())))
  with check (exists (select 1 from public.inventory_items i left join public.clubs c on c.id = i.club_id
                      where i.id = item_id and (i.host_id = auth.uid() or c.host_id = auth.uid())));
