-- Security hardening (Supabase advisor "Function Search Path Mutable"): pin search_path on
-- the trigger / helper functions so nobody can make them run a look-alike function or
-- table from another schema. Every overload of each name is fixed; names that do not exist
-- on this database are skipped. Safe to run more than once.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'trg_fixed_since', 'fn_block_transaction_mutation', 'fn_set_default_capacity', 'tier_capacity',
        'block_txn_mutation', 'sync_capacity_limit', 'club_activity_guard', 'owner_audit_guard',
        'member_moderation_guard', 'handle_new_user'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;

-- Which hardening steps this database has (read by the API's schema check).
create table if not exists public.security_revisions (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.security_revisions enable row level security;
revoke all on public.security_revisions from anon, authenticated;
insert into public.security_revisions (name) values ('function_search_path') on conflict (name) do nothing;
