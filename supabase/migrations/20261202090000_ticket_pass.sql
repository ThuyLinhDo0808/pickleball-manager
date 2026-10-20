-- Pass vé: người đã có chỗ nhường vé cho một người trong danh sách chờ, qua Host.
--   open            — người pass bấm "Liên hệ pass vé"; Host liên hệ người trong danh sách chờ
--   matched         — Host chọn người nhận; người nhận chuyển khoản cho người pass
--   proof_submitted — người pass gửi ảnh đã nhận tiền + đồng ý điều khoản
--   done            — Host xác nhận: vé người pass huỷ (không hoàn tiền), người nhận vào danh sách chính
--   cancelled       — người pass / Host huỷ yêu cầu
create table if not exists public.event_ticket_passes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  from_participant_id uuid not null references public.event_participants(id) on delete cascade,
  to_participant_id uuid references public.event_participants(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'matched', 'proof_submitted', 'done', 'cancelled')),
  amount numeric(12,0) not null default 0,
  proof text check (proof is null or char_length(proof) <= 400000),
  terms_accepted_at timestamptz,
  host_note text check (host_note is null or char_length(host_note) <= 300),
  created_at timestamptz not null default now(),
  matched_at timestamptz,
  submitted_at timestamptz,
  decided_at timestamptz
);
create index if not exists event_ticket_passes_event_idx on public.event_ticket_passes (event_id, created_at desc);
-- One live pass per ticket.
create unique index if not exists event_ticket_passes_live_idx on public.event_ticket_passes (from_participant_id) where status in ('open', 'matched', 'proof_submitted');

alter table public.event_ticket_passes enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.event_ticket_passes from %I', r);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
