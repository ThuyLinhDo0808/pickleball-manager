-- ----------------------------------------------------------------------------
-- OWNER CONSOLE  (migration 20261026090000)
-- ----------------------------------------------------------------------------
-- The app owner's back office (/owner): suspend accounts, internal CRM notes and an
-- append-only audit log of every change the owner makes. Only the backend (service
-- role) reads or writes these.
alter table public.users add column if not exists suspended_at timestamptz;
alter table public.users add column if not exists suspended_reason text;

create table if not exists public.owner_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_email text not null,
  action text not null,
  target_host_id uuid references public.users(id) on delete set null,
  target_email text,
  old_value jsonb,
  new_value jsonb,
  note text,
  undone_at timestamptz,
  undo_of uuid references public.owner_audit_logs(id) on delete set null
);
create index if not exists ix_owner_audit_created on public.owner_audit_logs (created_at desc);
create index if not exists ix_owner_audit_target on public.owner_audit_logs (target_host_id, created_at desc);

-- Append-only: rows are never deleted; the only change allowed is marking one undone.
create or replace function public.owner_audit_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'owner_audit_logs is append-only';
  end if;
  if old.undone_at is not null or new.undone_at is null
     or (to_jsonb(new) - 'undone_at') <> (to_jsonb(old) - 'undone_at') then
    raise exception 'owner_audit_logs is append-only (only undone_at may be set once)';
  end if;
  return new;
end; $$;
drop trigger if exists trg_owner_audit_guard on public.owner_audit_logs;
create trigger trg_owner_audit_guard before update or delete on public.owner_audit_logs
  for each row execute function public.owner_audit_guard();

create table if not exists public.owner_notes (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  author_email text not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_owner_notes_host on public.owner_notes (host_id, created_at desc);

-- Last sign-in time lives in auth.users, which the REST API can't read directly.
create or replace function public.owner_last_sign_in(ids uuid[])
returns table (id uuid, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query select u.id, u.last_sign_in_at from auth.users u where u.id = any(ids);
end; $$;

alter table public.owner_audit_logs enable row level security;
alter table public.owner_notes enable row level security;
revoke all on public.owner_audit_logs from anon, authenticated;
revoke all on public.owner_notes from anon, authenticated;
revoke all on function public.owner_last_sign_in(uuid[]) from public, anon, authenticated;
grant execute on function public.owner_last_sign_in(uuid[]) to service_role;
