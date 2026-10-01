-- ----------------------------------------------------------------------------
-- AUTO-LINK PLAYER ACCOUNTS TO CLUB MEMBERS BY PHONE  (migration 20261010090000)
-- ----------------------------------------------------------------------------
-- A player whose profile phone matches a club member's phone becomes that member
-- as soon as they sign up / log in (no "I'm a member" button any more).
-- phone_key = last 9 digits, so "0911 000 003", "+84911000003" and "0911000003" match.
alter table public.club_members add column if not exists phone_key text
  generated always as (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9)) stored;
create index if not exists ix_club_members_phone_key on public.club_members (phone_key);
-- The account the Host unlinked from this member: never auto-linked to it again.
alter table public.club_members add column if not exists unlinked_user_id uuid;
notify pgrst, 'reload schema';
