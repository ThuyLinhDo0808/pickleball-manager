-- Top 10 cộng đồng uy tín (quảng bá trả phí, Owner kiểm duyệt):
--   awaiting_payment — Host đăng ký, chờ chuyển khoản (nội dung CK = ref)
--   in_review        — Owner đã nhận tiền, đang xem mức độ uy tín
--   active           — được duyệt: hiện trong Top 10 từ starts_on đến ends_on, theo position
--   rejected / cancelled / ended
create table if not exists public.featured_communities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  host_id uuid references public.users(id) on delete set null,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'in_review', 'active', 'rejected', 'cancelled', 'ended')),
  months int not null check (months between 1 and 12),
  amount numeric(12,0) not null check (amount >= 0),
  ref text not null unique,
  paid_at timestamptz,
  trust_score smallint check (trust_score is null or trust_score between 0 and 100),
  position smallint check (position is null or position between 1 and 10),
  owner_note text check (owner_note is null or char_length(owner_note) <= 500),
  starts_on date,
  ends_on date,
  decided_by text,
  created_at timestamptz not null default now()
);
create index if not exists featured_communities_club_idx on public.featured_communities (club_id, created_at desc);
create index if not exists featured_communities_active_idx on public.featured_communities (status, ends_on);
-- One open request / placement per community at a time.
create unique index if not exists featured_communities_open_idx on public.featured_communities (club_id) where status in ('awaiting_payment', 'in_review', 'active');

alter table public.featured_communities enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.featured_communities from %I', r);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
