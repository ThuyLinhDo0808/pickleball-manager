-- ----------------------------------------------------------------------------
-- MEMBER AREA / PLAYING TIME / REAL RANK, MATCHES WITHOUT A SCORE  (migration 20261014090000)
-- ----------------------------------------------------------------------------
-- Where the member lives (district), how long they have played, and the Host's own
-- A-D rank from watching them play.
alter table public.club_members add column if not exists district text
  check (district is null or length(district) <= 80);
alter table public.club_members add column if not exists play_duration text
  check (play_duration is null or play_duration in ('lt6','6_12','12_18','gt18'));
alter table public.club_members add column if not exists real_rank text
  check (real_rank is null or real_rank in ('A','B','C','D'));

-- A match can be set up first (who plays whom) and scored later: no score yet = null.
alter table public.matches alter column team1_score drop not null;
alter table public.matches alter column team2_score drop not null;

-- Rankings only count matches that have a score.
create or replace view public.v_club_rankings_all_time with (security_invoker = true) as
select
  cm.id as club_member_id,
  cm.club_id,
  cm.full_name,
  count(*) filter (where mp.team = case when m.team1_score > m.team2_score then 1
                                          when m.team2_score > m.team1_score then 2 else 0 end) as wins,
  count(*) as matches_played,
  sum(case when mp.team = 1 then m.team1_score else m.team2_score end) as points_scored,
  sum(case when mp.team = 1 then m.team2_score else m.team1_score end) as points_lost
from public.club_members cm
join public.match_players mp on mp.club_member_id = cm.id
join public.matches m on m.id = mp.match_id
where m.team1_score is not null and m.team2_score is not null
group by cm.id, cm.club_id, cm.full_name;

create or replace view public.v_club_rankings_monthly with (security_invoker = true) as
select
  cm.id as club_member_id,
  cm.club_id,
  cm.full_name,
  date_trunc('month', m.played_at) as month,
  count(*) filter (where mp.team = case when m.team1_score > m.team2_score then 1
                                          when m.team2_score > m.team1_score then 2 else 0 end) as wins,
  count(*) as matches_played,
  sum(case when mp.team = 1 then m.team1_score else m.team2_score end) as points_scored,
  sum(case when mp.team = 1 then m.team2_score else m.team1_score end) as points_lost
from public.club_members cm
join public.match_players mp on mp.club_member_id = cm.id
join public.matches m on m.id = mp.match_id
where m.team1_score is not null and m.team2_score is not null
group by cm.id, cm.club_id, cm.full_name, date_trunc('month', m.played_at);
