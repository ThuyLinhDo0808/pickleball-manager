// Coach Manager helpers shared by the coach pages and the public coach page.
import { addDays, hhmm } from '@/lib/dates';

// 0 = Monday … 6 = Sunday (same as the backend and the club's weekday stats).
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
export const weekdayOf = (ymd) => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;

// Dates between from and to (inclusive) on the given weekdays; capped like the API.
export function expandDates(weekdays, from, to, cap = 200) {
  if (!from || !to || to < from) return [];
  const set = new Set(weekdays);
  const out = [];
  for (let d = from; d <= to && out.length <= cap; d = addDays(d, 1)) if (set.has(weekdayOf(d))) out.push(d);
  return out;
}

// "Thứ 3 · Thứ 5 · 18:00–19:30" for a class.
export function scheduleText(cls, t) {
  const days = cls.kind === 'single' ? [] : (cls.weekdays || []).map((d) => t(`insights.dow_${d}`));
  const end = endTime(cls.start_time, cls.duration_min);
  const time = `${hhmm(cls.start_time)}–${end}`;
  return [days.join(' · '), time].filter(Boolean).join(' · ');
}

export function endTime(start, minutes) {
  if (!start) return '';
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + Number(minutes || 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const dmy = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');

// Monday of the week holding `ymd`.
export function weekStart(ymd) {
  return addDays(ymd, -weekdayOf(ymd));
}
