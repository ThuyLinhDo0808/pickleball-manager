-- v7: deleting an account that runs clubs / Xé Vé needs a handover first (approved by the
-- app owner, who checks the new owner is real), and "register now, transfer later".

-- 1. Handover requests: the account hands every club and Xé Vé event to another account.
create table if not exists public.account_handovers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid references public.users(id) on delete set null,
  from_email text,
  to_user uuid references public.users(id) on delete set null,
  to_email text,
  note text check (note is null or char_length(note) <= 1000),
  clubs jsonb not null default '[]'::jsonb,       -- [{id, name}] when asked
  xeve_events int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  owner_note text check (owner_note is null or char_length(owner_note) <= 1000),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ux_account_handovers_pending on public.account_handovers (from_user) where status = 'pending';
create index if not exists ix_account_handovers_status on public.account_handovers (status, created_at desc);
alter table public.account_handovers enable row level security;
revoke all on public.account_handovers from anon, authenticated;

-- 2. "Đăng ký, chuyển khoản sau": the place is held until the sign-up deadline (or the start).
alter table public.event_participants add column if not exists pay_later boolean not null default false;
alter table public.events add column if not exists allow_pay_later boolean not null default true;

-- v_event_summary selects e.*: rebuild it for the new events column.
drop view if exists public.v_event_summary;
create view public.v_event_summary as
select
  e.*,
  c.name as club_name,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text in ('registered','checked_in','pending')) as main_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status = 'waitlisted') as waitlist_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text = 'pending') as pending_count,
  (select count(*) from public.event_participants p
     where p.event_id = e.id and p.status::text = 'requested') as requested_count
from public.events e
left join public.clubs c on c.id = e.club_id;

notify pgrst, 'reload schema';
