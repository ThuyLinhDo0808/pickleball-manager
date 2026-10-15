-- Owner-run reset of two-step sign-in (lost phone + lost recovery codes).
-- The Owner asks for it from the owner console after checking it is really the account
-- holder; it takes effect at reset_at (24 hours later by default). Until then the account
-- holder is emailed and can cancel it (signed in with the code, or from the email link).
alter table public.user_mfa
  add column if not exists reset_at           timestamptz,
  add column if not exists reset_requested_at timestamptz,
  add column if not exists reset_by           text,
  add column if not exists reset_reason       text,
  add column if not exists reset_cancel_hash  text;

create index if not exists ix_user_mfa_reset_cancel on public.user_mfa (reset_cancel_hash) where reset_cancel_hash is not null;
