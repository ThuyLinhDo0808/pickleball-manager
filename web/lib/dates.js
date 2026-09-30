// Calendar helpers on plain "YYYY-MM-DD" strings (no timezone surprises: events are
// stored as a local date + local times, so we never convert them to instants here).

const pad = (n) => String(n).padStart(2, '0');

export function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toUtc(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt) {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(ymd, n) {
  const dt = toUtc(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

export function addMonths(ymd, n) {
  const [y, m] = ymd.split('-').map(Number);
  return fromUtc(new Date(Date.UTC(y, m - 1 + n, 1)));
}

// Monday = 0 … Sunday = 6
export function weekday(ymd) {
  return (toUtc(ymd).getUTCDay() + 6) % 7;
}

export function startOfWeek(ymd) {
  return addDays(ymd, -weekday(ymd));
}

export function monthStart(ymd) {
  return `${ymd.slice(0, 7)}-01`;
}

// 6 x 7 grid of days covering the month of `ymd`, starting on a Monday.
export function monthGrid(ymd) {
  const first = startOfWeek(monthStart(ymd));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function weekDays(ymd) {
  const first = startOfWeek(ymd);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

// "19:30:00" -> 1170
export function minutes(time) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function hhmm(time) {
  return time ? time.slice(0, 5) : '';
}

// Start/end in minutes; a missing end counts as a 2-hour session.
export function span(e) {
  const start = minutes(e.start_time);
  if (start == null) return null;
  let end = minutes(e.end_time);
  if (end == null || end <= start) end = Math.min(start + 120, 24 * 60);
  return { start, end };
}

// Side-by-side columns for overlapping blocks (greedy interval partitioning).
export function layoutLanes(items) {
  const sorted = [...items].sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const it of cluster) {
      let lane = lanes.findIndex((end) => end <= it.span.start);
      if (lane === -1) lane = lanes.push(0) - 1;
      lanes[lane] = it.span.end;
      out.push({ ...it, lane });
    }
    for (const it of out.slice(out.length - cluster.length)) it.lanes = lanes.length;
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.span.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.span.end);
  }
  if (cluster.length) flush();
  return out;
}

export function formatDay(ymd, lang, opts = { weekday: 'short', day: 'numeric', month: 'numeric' }) {
  return toUtc(ymd).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { ...opts, timeZone: 'UTC' });
}

export function monthTitle(ymd, lang) {
  return toUtc(ymd).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function weekdayLabels(lang) {
  return lang === 'vi' ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
}
