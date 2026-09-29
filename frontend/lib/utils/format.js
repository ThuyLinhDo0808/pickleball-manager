import { t, getLanguage } from '../i18n/core.js';

const pad = (n) => String(n).padStart(2, '0');

const DAYS = {
  vi: ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const DAYS_SHORT = {
  vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const MONTHS_SHORT = {
  vi: ['thg 1', 'thg 2', 'thg 3', 'thg 4', 'thg 5', 'thg 6', 'thg 7', 'thg 8', 'thg 9', 'thg 10', 'thg 11', 'thg 12'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const MONTHS_LONG = {
  vi: ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const L = () => (getLanguage() === 'en' ? 'en' : 'vi');

// ---- money -----------------------------------------------------------------
// Vietnamese dong: no decimals, dot as thousands separator. Written by hand
// (no Intl) so it behaves identically on every device.
export function formatMoney(value) {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`;
}

// "1.500.000" / "1500000" -> 1500000 (digits only)
export function parseMoney(text) {
  const digits = String(text ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

// Live formatting while typing: "1500000" -> "1.500.000"
export function groupDigits(text) {
  const digits = String(text ?? '').replace(/[^\d]/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ---- dates -----------------------------------------------------------------
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTime(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const parts = (iso) => String(iso).slice(0, 10).split('-').map(Number);
const dowOf = (iso) => { const [y, m, d] = parts(iso); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

// '2026-10-03' -> 'Thứ Bảy, 3 thg 10, 2026'  |  'Sat, 3 Oct 2026'
export function formatDate(iso) {
  if (!iso || !isValidDate(String(iso).slice(0, 10))) return iso || '';
  const [y, m, d] = parts(iso);
  const lang = L();
  const dow = lang === 'vi' ? DAYS.vi[dowOf(iso)] : DAYS_SHORT.en[dowOf(iso)];
  return lang === 'vi' ? `${dow}, ${d} ${MONTHS_SHORT.vi[m - 1]}, ${y}` : `${dow}, ${d} ${MONTHS_SHORT.en[m - 1]} ${y}`;
}

// '2026-10-03' -> '3 thg 10'  |  '3 Oct'
export function formatDayMonth(iso) {
  if (!iso || !isValidDate(String(iso).slice(0, 10))) return iso || '';
  const [, m, d] = parts(iso);
  return `${d} ${MONTHS_SHORT[L()][m - 1]}`;
}

export const weekdayShort = (dow) => DAYS_SHORT[L()][dow];       // dow: 0 = Sunday
export const weekdayLong = (dow) => DAYS[L()][dow];
export const monthShort = (monthIndex) => MONTHS_SHORT[L()][monthIndex];
export const monthTitle = (year, monthIndex) =>
  L() === 'vi' ? `${MONTHS_LONG.vi[monthIndex]}, ${year}` : `${MONTHS_LONG.en[monthIndex]} ${year}`;

// 'Hôm nay' / 'Ngày mai' / full date - for agenda headers
export function relativeDay(iso) {
  const today = todayISO();
  if (iso === today) return t('date.today');
  if (iso === addDaysISO(today, 1)) return t('date.tomorrow');
  if (iso === addDaysISO(today, -1)) return t('date.yesterday');
  return formatDate(iso);
}

export const dayOfMonth = (iso) => parts(iso)[2];
export const dowShortOf = (iso) => DAYS_SHORT[L()][dowOf(iso)];

// '19:00:00' -> '19:00'
export const formatTime = (tm) => (tm ? String(tm).slice(0, 5) : '');

export function formatTimeRange(start, end) {
  const s = formatTime(start);
  const e = formatTime(end);
  return e ? `${s} – ${e}` : s;
}

// ISO timestamp -> '28 thg 9, 19:05' in the phone's local time
export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_SHORT[L()][d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 'YYYY-MM' of an ISO timestamp in the phone's local time
export function localMonthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const pad2 = pad;
