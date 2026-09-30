// Helpers for member birthdays and club seniority.
import { todayYmd } from '@/lib/dates';

// 'YYYY-MM-DD' -> 'dd/mm/yyyy'
export function dmy(d) {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

// 'YYYY-MM-DD' -> 'mm/yyyy'
export function my(d) {
  if (!d) return '';
  const [y, m] = d.slice(0, 7).split('-');
  return `${m}/${y}`;
}

// Whole months since the join date (0 in the first month).
export function monthsSince(d, today = todayYmd()) {
  if (!d) return null;
  const [y1, m1, d1] = d.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  const n = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return Math.max(n, 0);
}

// "2 năm 3 tháng" / "5 tháng" / "< 1 tháng"
export function tenureLabel(d, t) {
  const n = monthsSince(d);
  if (n == null) return '';
  if (n === 0) return t('members.tenureNew');
  const y = Math.floor(n / 12);
  const m = n % 12;
  return [y && t('members.tenureYears', { n: y }), m && t('members.tenureMonths', { n: m })].filter(Boolean).join(' ');
}

export const isBirthdayMonth = (d, today = todayYmd()) => !!d && d.slice(5, 7) === today.slice(5, 7);
