-- 20261217090000_event_schedule_changed.sql: when a kèo's date / time changed or it was
-- cancelled — the only event changes players are told about (bell + kèo page).
alter table public.events add column if not exists schedule_changed_at timestamptz;
notify pgrst, 'reload schema';
