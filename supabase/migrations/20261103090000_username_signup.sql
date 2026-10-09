-- Sign-in with a username, and the details asked at sign-up.
--   username:   3–30 characters (a–z, 0–9, . and _), starts with a letter, unique
--               (case-insensitive). Signs in instead of the email; older accounts
--               without one keep signing in with their email.
--   birth_date, gender, region: asked at sign-up (region = province / city they live in).

alter table public.users add column if not exists username text;
alter table public.users add column if not exists birth_date date;
alter table public.users add column if not exists gender text;
alter table public.users add column if not exists region text;

do $$ begin
  alter table public.users add constraint chk_users_username
    check (username is null or username ~ '^[a-z][a-z0-9._]{2,29}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.users add constraint chk_users_gender
    check (gender is null or gender in ('male', 'female', 'other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.users add constraint chk_users_region
    check (region is null or char_length(region) <= 80);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.users add constraint chk_users_birth_date
    check (birth_date is null or birth_date between date '1900-01-01' and current_date);
exception when duplicate_object then null; end $$;

create unique index if not exists ux_users_username on public.users (lower(username)) where username is not null;

-- New accounts: copy the sign-up details (sent as user metadata) onto public.users.
-- Never blocks the sign-up: a bad or taken value is simply left empty.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb;
begin
  begin
    insert into public.users (id, email) values (new.id, new.email)
      on conflict (id) do nothing;
    insert into public.host_subscriptions (host_id) values (new.id)
      on conflict (host_id) do nothing;
  exception when others then
    raise warning 'handle_new_auth_user(%): %', new.id, sqlerrm;
  end;
  begin
    meta := coalesce(to_jsonb(new) -> 'raw_user_meta_data', '{}'::jsonb);
    update public.users set
      username = nullif(lower(meta->>'username'), ''),
      birth_date = nullif(meta->>'birth_date', '')::date,
      gender = nullif(meta->>'gender', ''),
      region = nullif(meta->>'region', '')
    where id = new.id;
  exception when others then
    raise warning 'handle_new_auth_user details(%): %', new.id, sqlerrm;
  end;
  return new;
end; $$;
