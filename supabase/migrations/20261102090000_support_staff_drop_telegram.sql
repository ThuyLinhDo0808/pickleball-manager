-- Support staff for the owner console, and the end of Telegram notifications.

-- People who help run the app (support desk). Added and removed by an owner
-- (OWNER_EMAILS) in Owner Console → Nhân viên; each gets only the parts of the console
-- listed in `permissions`. Owner rights themselves are never stored in the database.
create table if not exists support_staff (
  email text primary key check (email = lower(trim(email)) and email like '%_@_%'),
  full_name text check (char_length(full_name) <= 80),
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table support_staff enable row level security;
revoke all on support_staff from anon, authenticated;

-- Telegram notifications were removed (the bot API is no longer free): forget the
-- players' chat ids and link codes.
drop index if exists ux_player_telegram_code;
alter table player_profiles drop column if exists telegram_chat_id;
alter table player_profiles drop column if exists telegram_link_code;
