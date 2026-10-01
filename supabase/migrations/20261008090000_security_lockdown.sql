-- ----------------------------------------------------------------------------
-- SECURITY LOCKDOWN  (migration 20261008090000)
-- ----------------------------------------------------------------------------
-- The web app never reads the database directly: every query goes through the API,
-- which uses the service-role key. The browser only holds the public "anon" key for
-- sign-in. So the anon / authenticated roles need NO access to the public schema.
--
-- 1. Views run with the caller's rights (otherwise a view bypasses row-level security
--    and anyone holding the anon key could read every club's data through it).
do $$
declare v record;
begin
  for v in select schemaname, viewname from pg_views where schemaname = 'public' loop
    execute format('alter view %I.%I set (security_invoker = true)', v.schemaname, v.viewname);
  end loop;
end $$;

-- 2. No direct table / view / function access for anon and signed-in browser sessions.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke execute on all functions in schema public from %I', r);
      -- objects created later (new migrations) don't get the grant either
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke execute on functions from %I', r);
      if exists (select 1 from pg_roles where rolname = 'postgres') then
        execute format('alter default privileges for role postgres in schema public revoke all on tables from %I', r);
        execute format('alter default privileges for role postgres in schema public revoke all on sequences from %I', r);
        execute format('alter default privileges for role postgres in schema public revoke execute on functions from %I', r);
      end if;
    end if;
  end loop;
end $$;
revoke execute on all functions in schema public from public;

-- 3. Row-level security stays on for every table (defence in depth if a grant comes back).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

notify pgrst, 'reload schema';
