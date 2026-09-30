-- ----------------------------------------------------------------------------
-- SIGN-UP SAFETY, MEMBER JOIN DATE & BIRTHDAY  (migration 20261003090000)
-- ----------------------------------------------------------------------------
-- A new sign-up must never fail because of our bootstrap rows: Supabase then shows
-- "Database error saving new user". The API recreates missing rows on first request.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.users (id, email) values (new.id, new.email)
      on conflict (id) do nothing;
    insert into public.host_subscriptions (host_id) values (new.id)
      on conflict (host_id) do nothing;
  exception when others then
    raise warning 'handle_new_auth_user(%): %', new.id, sqlerrm;
  end;
  return new;
end; $$;

-- When the member joined the club (seniority) and full birth date (birthday gifts).
alter table public.club_members add column if not exists joined_on date;
alter table public.club_members add column if not exists birth_date date;
update public.club_members set joined_on = created_at::date where joined_on is null;
alter table public.club_members alter column joined_on set default current_date;
create index if not exists ix_club_members_birth_md on public.club_members (club_id, (extract(month from birth_date)));

notify pgrst, 'reload schema';
