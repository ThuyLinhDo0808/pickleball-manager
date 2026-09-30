-- Paid sign-ups: login-required registration, guest payment proof checked by the Host,
-- ticket QR per registration, slot transfer, Host-verified member accounts.
-- Safe to re-run. database/schema.sql carries the same changes for fresh installs.

-- 'pending' holds a place while the Host checks a guest's transfer. A new enum value
-- can't be used in the same transaction, so the views below compare status::text.
alter type public.participant_status add value if not exists 'pending';

-- Where guests transfer event fees (standalone events; club events use the club's account first).
alter table public.users add column if not exists bank_code text;
alter table public.users add column if not exists bank_account text;
alter table public.users add column if not exists bank_holder text;
-- The Host's own bank QR image (small data: URL), shown on the payment page.
alter table public.users add column if not exists payment_qr_image text
  check (payment_qr_image is null or length(payment_qr_image) <= 400000);

-- A player account linked to a member record counts as that member only once the Host
-- has verified it. Links that existed before this column are trusted (backfilled once).
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'club_members' and column_name = 'account_verified') then
    alter table public.club_members add column account_verified boolean not null default false;
    update public.club_members set account_verified = true where user_id is not null;
  end if;
end $$;

-- Online sign-ups: member (verified club member) or guest; guests pay first, the Host
-- checks the transfer screenshot, then the registration gets its ticket QR.
alter table public.event_participants add column if not exists kind text not null default 'guest'
  check (kind in ('member','guest'));
alter table public.event_participants add column if not exists ticket_code uuid not null default gen_random_uuid();
create unique index if not exists ux_participant_ticket on public.event_participants (ticket_code);
alter table public.event_participants add column if not exists payment_status text not null default 'none'
  check (payment_status in ('none','awaiting_proof','proof_submitted','rejected','confirmed'));
alter table public.event_participants add column if not exists payment_ref text;
alter table public.event_participants add column if not exists payment_proof text
  check (payment_proof is null or length(payment_proof) <= 400000);
alter table public.event_participants add column if not exists payment_submitted_at timestamptz;
alter table public.event_participants add column if not exists payment_note text;
-- An unpaid hold is released automatically after this time.
alter table public.event_participants add column if not exists hold_expires_at timestamptz;
alter table public.event_participants add column if not exists transferred_from text;

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
     where p.event_id = e.id and p.status::text = 'pending') as pending_count
from public.events e
left join public.clubs c on c.id = e.club_id;

create or replace view public.v_host_capacity_usage as
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
  join public.club_members m on m.club_id = c.id and m.is_active = true
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
