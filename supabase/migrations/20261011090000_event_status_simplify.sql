-- ----------------------------------------------------------------------------
-- EVENT STATUS: OPEN / COMPLETED / CANCELLED ONLY  (migration 20261011090000)
-- ----------------------------------------------------------------------------
-- No more drafts or "closed" sessions: a session is open until its time slot is over
-- (then the app marks it completed), or cancelled. Old drafts / closed ones become open;
-- past ones are completed by the app on the next load.
update public.events set status = 'open' where status in ('draft', 'closed');
alter table public.events alter column status set default 'open';
notify pgrst, 'reload schema';
