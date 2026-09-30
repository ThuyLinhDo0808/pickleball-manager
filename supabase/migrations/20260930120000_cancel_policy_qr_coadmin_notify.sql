-- Phase 8: cancellation policy, QR check-in, waitlist notifications, co-admin role.
-- Versioned migration for production (`supabase db push`). database/schema.sql holds
-- the same changes for fresh installs; every statement here is safe to re-run.

-- Co-owner of one club: members + finance, never deletes the club or edits where payments go.
alter type public.event_role add value if not exists 'co_admin';

do $$ begin
  alter table public.staff_grants add constraint chk_staff_co_admin_club
    check (role::text <> 'co_admin' or (club_id is not null and event_id is null));
exception when duplicate_object then null; end $$;

-- Cancellation policy: cancelling later than N hours before the start still uses the
-- session / still owes the fee. NULL = free cancellation at any time.
alter table public.events add column if not exists cancel_deadline_hours int
  check (cancel_deadline_hours is null or cancel_deadline_hours between 0 and 168);
alter table public.event_participants add column if not exists late_cancel boolean not null default false;

-- Personal check-in QR shown in the player portal.
alter table public.player_profiles add column if not exists checkin_token uuid not null default gen_random_uuid();
create unique index if not exists ux_player_checkin_token on public.player_profiles (checkin_token);

-- Telegram notifications (player connects via t.me/<bot>?start=<code>).
alter table public.player_profiles add column if not exists telegram_link_code text;
alter table public.player_profiles add column if not exists telegram_chat_id bigint;
create unique index if not exists ux_player_telegram_code on public.player_profiles (telegram_link_code);

-- Host notification webhook (Make / Zapier -> Zalo ZNS, SMS, Telegram group...).
alter table public.users add column if not exists notify_webhook_url text;

-- v_event_summary selects e.*, so rebuild it to include the new events column.
drop view if exists public.v_event_summary;
create view public.v_event_summary as
select
  e.*,
  c.name as club_name,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status in ('registered','checked_in')) as main_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status = 'waitlisted') as waitlist_count
from public.events e
left join public.clubs c on c.id = e.club_id;

notify pgrst, 'reload schema';
