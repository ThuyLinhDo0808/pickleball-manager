-- ---- 20261127090000_merge_member_rows.sql ----
-- Merging two member records (auto-merge of duplicates, "Gộp" of a join request): move the
-- source's rows to the target ONE ROW AT A TIME. Before, one clash (both records in the
-- same tournament fee / meeting money / vote) made the whole table's update fail, so the
-- source's other rows of that table were lost with it.
create or replace function public.merge_club_member(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  k record;
begin
  if p_source = p_target then
    return;
  end if;
  if (select club_id from public.club_members where id = p_source) is distinct from (select club_id from public.club_members where id = p_target) then
    raise exception 'members are in different clubs';
  end if;
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.club_members'::regclass and array_length(c.conkey, 1) = 1
  loop
    begin
      -- usual case: no clash, one statement
      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col) using p_target, p_source;
    exception when unique_violation then
      -- a clash: move row by row; a row the target already has stays with the source
      for k in execute format('select ctid as c from %s where %I = $1', r.tbl, r.col) using p_source loop
        begin
          execute format('update %s set %I = $1 where ctid = $2', r.tbl, r.col) using p_target, k.c;
        exception when unique_violation then
          null;
        end;
      end loop;
    end;
  end loop;
  delete from public.club_members where id = p_source;
end
$$;
revoke all on function public.merge_club_member(uuid, uuid) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.merge_club_member(uuid, uuid) from %I', r);
    end if;
  end loop;
end $$;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.merge_club_member(uuid, uuid) to service_role; -- the API server only
  end if;
end $$;

notify pgrst, 'reload schema';
