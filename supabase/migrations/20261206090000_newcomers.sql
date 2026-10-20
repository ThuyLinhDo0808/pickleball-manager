-- "Người mới" (Social Manager): a player counts as new for 30 days from joining the
-- community. After that the control panel's rule decides: more than N sessions in the last
-- 30 days -> khách thường xuyên; no session for 3 weeks -> khách vãng lai.
-- newcomer_until = last day they are "new" (null = not new).
alter table public.club_members add column if not exists newcomer_until date;
