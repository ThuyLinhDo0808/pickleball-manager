-- Điều chỉnh tiền thực tế & hoàn phí trong kèo. Tiền theo bảng giá (fee_amount / giá kèo)
-- giữ nguyên; Host nhập "tiền thực tế" của từng người (trước, trong hoặc sau buổi) vào
-- actual_fee. paid_amount ghi số tiền đã thu lúc xác nhận thanh toán ban đầu. Mỗi lần
-- điều chỉnh, thu thêm hay hoàn phí là một dòng riêng trong participant_fee_changes (chỉ
-- thêm, không sửa / xoá; hoàn tác thì đánh dấu undone_at) — khoản thu thêm / hoàn phí
-- còn có một dòng thu / chi riêng trong sổ quỹ (txn_id) để đối soát.
alter table public.event_participants add column if not exists actual_fee numeric(12,0) check (actual_fee is null or actual_fee >= 0);
alter table public.event_participants add column if not exists paid_amount numeric(12,0) check (paid_amount is null or paid_amount >= 0);

create table if not exists public.participant_fee_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  kind text not null check (kind in ('adjust','collect','refund')),
  amount numeric(12,0) check (amount is null or amount >= 0),
  old_amount numeric(12,0),
  note text check (note is null or length(note) <= 300),
  txn_id uuid references public.transactions(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references public.users(id) on delete set null
);
create index if not exists ix_fee_changes_event on public.participant_fee_changes (event_id, created_at);
create index if not exists ix_fee_changes_participant on public.participant_fee_changes (participant_id);
alter table public.participant_fee_changes enable row level security;
-- Only the backend (service key) reads / writes; no policy for anon / authenticated.
revoke all on public.participant_fee_changes from anon, authenticated;
