-- ----------------------------------------------------------------------------
-- BALL SESSIONS: OLD BALLS PLAYED  (migration 20261207090000)
-- ----------------------------------------------------------------------------
-- Each session of the ball table now also records how many old balls (from earlier
-- sessions) were played: a 'play' move, quantity = old balls played (0 allowed), with
-- balls_played = old + new balls on court. A session with 0 new and 0 broken balls is
-- kept in the table, and ball durability = ball-sessions played / balls broken.
alter table public.inventory_moves add column if not exists balls_played int check (balls_played is null or balls_played >= 0);
alter table public.inventory_moves drop constraint if exists inventory_moves_quantity_check;
alter table public.inventory_moves add constraint inventory_moves_quantity_check check (quantity <> 0 or kind = 'play');
alter table public.inventory_moves drop constraint if exists inventory_moves_kind_check;
alter table public.inventory_moves add constraint inventory_moves_kind_check check (kind in ('purchase','retire','adjust','use','broken','play'));
alter table public.inventory_moves drop constraint if exists chk_move_shape;
alter table public.inventory_moves add constraint chk_move_shape check (
  (kind = 'purchase' and quantity > 0 and unit_cost is not null) or
  (kind in ('retire','use','broken') and quantity > 0) or
  (kind = 'play' and quantity >= 0) or
  (kind = 'adjust')
);
