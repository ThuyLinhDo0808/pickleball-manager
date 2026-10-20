-- ----------------------------------------------------------------------------
-- EVENT EXTRAS  (migration 20261208090000)
-- ----------------------------------------------------------------------------
-- 1. Participant notes the Host can toggle: 'invited' (Khách mời), 'free' (Miễn phí, no fee
--    owed) — plus 'host_guest' for someone the Host added by hand (Khách của Host).
-- 2. Quick booking (link đặt nhanh): the contact gives a gender, no phone; a signed-in
--    player's booking is kept on their account (to find the ticket / QR again).
-- 3. Matches: the challenge match (thách thức) the Host started from the kèo's rankings,
--    with its reward.
alter table public.event_participants drop constraint if exists event_participants_tags_check;
alter table public.event_participants add constraint event_participants_tags_check
  check (tags <@ array['coach', 'referee', 'invited', 'free', 'host_guest']::text[]);

alter table public.event_guest_bookings add column if not exists contact_gender text
  check (contact_gender is null or contact_gender in ('male', 'female'));
alter table public.event_guest_bookings alter column contact_phone drop not null;
alter table public.event_guest_bookings drop constraint if exists event_guest_bookings_contact_phone_check;
alter table public.event_guest_bookings add constraint event_guest_bookings_contact_phone_check
  check (contact_phone is null or char_length(contact_phone) between 8 and 20);
alter table public.event_guest_bookings add column if not exists user_id uuid references public.users(id) on delete set null;
create index if not exists event_guest_bookings_user_idx on public.event_guest_bookings (user_id) where user_id is not null;

alter table public.matches add column if not exists is_challenge boolean not null default false;
alter table public.matches add column if not exists challenge_reward text check (challenge_reward is null or char_length(challenge_reward) <= 200);
