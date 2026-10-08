-- ----------------------------------------------------------------------------
-- MONTHLY FUND CALCULATOR  (migration 20261022090000)
-- ----------------------------------------------------------------------------
-- The Host's worksheet for the monthly fee each member pays (court rent per hour,
-- hours per session, sessions per month, fixed-booking discount, balls, water,
-- members, rounding, guest prices per time slot). Kept per club as JSON so the
-- Host opens it with last month's numbers.
alter table public.clubs add column if not exists fund_calc jsonb;
