-- ----------------------------------------------------------------------------
-- GUEST PRIORITY DISCOUNT  (migration 20261013090000)
-- ----------------------------------------------------------------------------
-- Guests buy single tickets only (no membership plans, no VIP). The one perk is
-- "Ưu tiên": first off the waitlist, plus an optional % off the ticket price that the
-- Host sets per guest (e.g. 10, 20, 50).
alter table public.club_members add column if not exists guest_discount_pct smallint
  check (guest_discount_pct is null or guest_discount_pct between 0 and 100);

-- Former VIP guests keep their priority.
update public.club_members set guest_perk = 'priority' where guest_perk = 'vip';
