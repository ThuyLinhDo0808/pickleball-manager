-- Rankings and the monthly race, set by the Host:
--   rank_min_matches  — matches a player needs in the period to get a place on the leaderboard
--                       (ranked by win rate); fewer = listed below, "not enough matches yet".
--   race_min_sessions — kèo a player needs in the month to be able to win the Top tháng.
alter table public.clubs
  add column if not exists rank_min_matches smallint check (rank_min_matches is null or rank_min_matches between 1 and 50),
  add column if not exists race_min_sessions smallint check (race_min_sessions is null or race_min_sessions between 1 and 31);
