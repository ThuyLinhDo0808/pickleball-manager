-- Events v6: the Host approves each sign-up before the player pays, organizers
-- (Host / co-hosts) on the participant list, and a short sign-up link.

-- 1. New participant states:
--    requested   = asked to join through the link, waiting for the Host to check them
--    not_playing = an organizer who runs the event but does not play
alter type public.participant_status add value if not exists 'requested';
alter type public.participant_status add value if not exists 'not_playing';

-- 2. "Duyệt tự động": off = the Host approves every sign-up first (the default for new
--    events). Events made before this keep working as they did (auto approve).
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'auto_approve') then
    alter table public.events add column auto_approve boolean not null default false;
    update public.events set auto_approve = true;
  end if;
end $$;

-- 3. Short sign-up link: /e/<8 characters> instead of the full token.
alter table public.events add column if not exists short_code text;
update public.events set short_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 8) where short_code is null;
alter table public.events alter column short_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
alter table public.events alter column short_code set not null;
create unique index if not exists ux_events_short_code on public.events (short_code);

-- 4. Organizers and roles on the participant list.
alter table public.event_participants add column if not exists is_organizer boolean not null default false;
alter table public.event_participants add column if not exists tags text[] not null default '{}'
  check (tags <@ array['coach', 'referee']::text[]);

-- v_event_summary selects e.*: rebuild it (new columns + waiting-for-approval count).
drop view if exists public.v_event_summary;
create view public.v_event_summary as
select
  e.*,
  c.name as club_name,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text in ('registered','checked_in','pending')) as main_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status = 'waitlisted') as waitlist_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text = 'pending') as pending_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text = 'requested') as requested_count
from public.events e
left join public.clubs c on c.id = e.club_id;

notify pgrst, 'reload schema';
