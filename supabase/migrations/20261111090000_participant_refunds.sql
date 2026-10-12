-- Refunds after a cancellation: the host marks "đã hoàn tiền" on a player who paid and
-- then cancelled in time. When, how much, who marked it, and the expense written to the
-- ledger for it (so it can be taken back).
alter table public.event_participants add column if not exists refunded_at timestamptz;
alter table public.event_participants add column if not exists refund_amount numeric(12,0);
alter table public.event_participants add column if not exists refunded_by text;
alter table public.event_participants add column if not exists refund_txn_id uuid references public.transactions(id) on delete set null;
