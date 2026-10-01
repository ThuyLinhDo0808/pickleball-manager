-- ----------------------------------------------------------------------------
-- GUESTS: PERKS, NOTES, AFTER-SESSION SURVEY, JOIN REQUESTS  (migration 20261009090000)
-- ----------------------------------------------------------------------------
-- Guests who got a confirmed place are kept in the club's guest list automatically.
-- The Host can give a guest a perk: 'priority' = first off the waitlist,
-- 'vip' = priority + the club's VIP discount on every session fee.
alter table public.club_members add column if not exists guest_perk text
  check (guest_perk is null or guest_perk in ('priority','vip'));
-- When the player asked to join the fixed team, and what they wrote.
alter table public.club_members add column if not exists join_requested_at timestamptz;
alter table public.club_members add column if not exists join_note text
  check (join_note is null or length(join_note) <= 1000);
alter table public.clubs add column if not exists guest_vip_discount numeric(12,0) not null default 0
  check (guest_vip_discount >= 0);

-- Which guest-list record a sign-up belongs to; perk priority on the waitlist;
-- the private link to the after-session survey and when it was sent.
alter table public.event_participants add column if not exists guest_member_id uuid
  references public.club_members(id) on delete set null;
create index if not exists ix_participants_guest_member on public.event_participants (guest_member_id);
alter table public.event_participants add column if not exists priority boolean not null default false;
alter table public.event_participants add column if not exists survey_token uuid not null default gen_random_uuid();
create unique index if not exists ux_participant_survey on public.event_participants (survey_token);
alter table public.event_participants add column if not exists survey_sent_at timestamptz;

-- One answer per sign-up: stars, comment, and whether they want to join the fixed team.
create table if not exists public.event_surveys (
  participant_id uuid primary key references public.event_participants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  level_fit text check (level_fit is null or level_fit in ('easy','right','hard')),
  comment text check (comment is null or length(comment) <= 1000),
  wants_join boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ix_event_surveys_event on public.event_surveys (event_id);
alter table public.event_surveys enable row level security;
drop policy if exists p_event_surveys_owner on public.event_surveys;
create policy p_event_surveys_owner on public.event_surveys for select
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

-- Guests now live in the club list too, so only FIXED members count towards capacity
-- (guests are already counted through their upcoming sign-ups).
create or replace view public.v_host_capacity_usage with (security_invoker = true) as
select
  h.host_id,
  h.tier,
  h.capacity_limit,
  coalesce(cm.member_count, 0) + coalesce(ep.participant_count, 0) as used,
  h.capacity_limit - (coalesce(cm.member_count, 0) + coalesce(ep.participant_count, 0)) as remaining
from public.host_subscriptions h
left join (
  select c.host_id, count(m.id) as member_count
  from public.clubs c
  join public.club_members m on m.club_id = c.id and m.is_active = true and m.member_type = 'fixed'
  group by c.host_id
) cm on cm.host_id = h.host_id
left join (
  select e.host_id, count(p.id) as participant_count
  from public.events e
  join public.event_participants p on p.event_id = e.id
    and p.status::text in ('registered','waitlisted','checked_in','pending')
  where e.status in ('draft','open','closed')
    and e.event_date >= current_date - 1
  group by e.host_id
) ep on ep.host_id = h.host_id;
notify pgrst, 'reload schema';
