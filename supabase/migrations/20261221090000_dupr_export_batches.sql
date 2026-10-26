-- DUPR: every CSV download is a "lượt tải" kept on the server, so the Host can confirm it
-- was uploaded to DUPR (its matches become "đã gửi") or cancel it (they go back to "chờ
-- gửi") from any device, and matches waiting in a lượt tải are never put in a second file.
-- Safe to run more than once.
create table if not exists public.dupr_export_batches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  items jsonb not null default '[]'::jsonb, -- [{kind: match|tournament|sub, id}]
  match_count integer not null default 0,
  with_missing integer not null default 0, -- matches in the file where someone had no DUPR ID
  score_type text not null default 'SIDEOUT',
  file_name text,
  decided_at timestamptz,
  decided_by uuid
);
create index if not exists dupr_export_batches_club_idx on public.dupr_export_batches (club_id, status, created_at desc);
alter table public.dupr_export_batches enable row level security;
revoke all on public.dupr_export_batches from anon, authenticated;
