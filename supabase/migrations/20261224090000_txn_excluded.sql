-- "Không tính vào sổ thu chi": an entry stays in the book (and the player stays "đã thu",
-- the pass / ball stock stays) but its money is left out of every total, balance and chart.
alter table public.transactions add column if not exists excluded boolean not null default false;
comment on column public.transactions.excluded is 'Ticked by the Host: shown in the ledger, not counted in totals / balance.';

create or replace view public.v_club_fund_balance with (security_invoker = true) as
select
  club_id,
  sum(case when type = 'income' then amount else -amount end) as balance
from public.transactions
where owner_type = 'club' and is_voided = false and excluded = false
group by club_id;

create or replace view public.v_event_finance with (security_invoker = true) as
select
  event_id,
  sum(case when type = 'income' then amount else 0 end) as income,
  sum(case when type = 'expense' then amount else 0 end) as expense,
  sum(case when type = 'income' then amount else -amount end) as net
from public.transactions
where owner_type = 'event' and is_voided = false and excluded = false
group by event_id;
