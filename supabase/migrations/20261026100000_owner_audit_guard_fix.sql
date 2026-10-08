-- ----------------------------------------------------------------------------
-- OWNER AUDIT GUARD FIX  (migration 20261026100000)
-- ----------------------------------------------------------------------------
-- Deleting an account sets owner_audit_logs.target_host_id to null (on delete set
-- null), which the append-only guard used to refuse — so the account could not be
-- deleted. Allow exactly that (and undo_of losing its row), still nothing else.
create or replace function public.owner_audit_guard() returns trigger
language plpgsql as $$
declare
  changed jsonb := to_jsonb(new) - 'undone_at' - 'target_host_id' - 'undo_of';
  before jsonb := to_jsonb(old) - 'undone_at' - 'target_host_id' - 'undo_of';
begin
  if tg_op = 'DELETE' then
    raise exception 'owner_audit_logs is append-only';
  end if;
  if changed <> before
     or (new.target_host_id is distinct from old.target_host_id and new.target_host_id is not null)
     or (new.undo_of is distinct from old.undo_of and new.undo_of is not null)
     or (new.undone_at is distinct from old.undone_at and (old.undone_at is not null or new.undone_at is null)) then
    raise exception 'owner_audit_logs is append-only (only undone_at may be set once)';
  end if;
  return new;
end; $$;
