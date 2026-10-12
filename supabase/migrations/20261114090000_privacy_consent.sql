-- ----------------------------------------------------------------------------
-- PRIVACY: CONSENT + RETENTION  (migration 20261114090000)
-- ----------------------------------------------------------------------------
-- Which version of the Terms / Privacy Policy each account accepted, and when.
alter table public.users add column if not exists terms_version text;
alter table public.users add column if not exists terms_accepted_at timestamptz;
-- Transfer screenshots are deleted some time after the session (PROOF_RETENTION_DAYS,
-- default 90 days); this says when, so the Host sees why the picture is gone.
alter table public.event_participants add column if not exists proof_purged_at timestamptz;
create index if not exists ix_participants_has_proof on public.event_participants (event_id) where payment_proof is not null;

notify pgrst, 'reload schema';
