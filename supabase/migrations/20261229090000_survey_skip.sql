-- "Không đánh giá": a player can dismiss the after-session survey. The prompt (home card,
-- player page, event page) stops showing; the link itself keeps working until it closes.
alter table public.event_participants add column if not exists survey_skipped_at timestamptz;
