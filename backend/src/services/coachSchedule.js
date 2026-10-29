// Coach Manager (đợt C2): packages, classes and the sessions a class is made of.
// A class is "every Tue / Thu 18:00 from 1/11 to 31/12": its sessions are written out
// when it is created (like the club's weekly schedule), so each one can be moved,
// cancelled, attended and paid for on its own.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { fail } = require('./coachAccess');

const MIGRATION = '20261231090000_coach_classes.sql';
async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const KINDS = ['group', 'private', 'single'];
const DEDUCT = ['present_or_noshow', 'present_only', 'always'];
const MAX_SESSIONS = 200;

// 0 = Monday … 6 = Sunday (the way the club's weekday stats and the UI count).
const weekdayOf = (ymd) => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Every date between from and to (inclusive) that falls on one of the weekdays.
function expandDates(weekdays, from, to) {
  const set = new Set(weekdays);
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (set.has(weekdayOf(d))) out.push(d);
    if (out.length > MAX_SESSIONS) throw fail(`A class may have at most ${MAX_SESSIONS} sessions; shorten the date range.`, 400, 'too_many_sessions');
  }
  return out;
}

const text = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw fail(`Too long (max ${max} characters).`, 400, 'too_long');
  return s;
};
const int = (v, min, max, what) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw fail(`${what} must be ${min}–${max}.`, 400, `bad_${what}`);
  return n;
};
const time = (v) => {
  const s = String(v || '').trim();
  if (!HM.test(s)) throw fail('start_time must be HH:MM.', 400, 'bad_start_time');
  return s.length === 5 ? `${s}:00` : s;
};
const day = (v, what) => {
  const s = String(v || '').trim();
  if (!YMD.test(s) || Number.isNaN(Date.parse(s))) throw fail(`${what} must be YYYY-MM-DD.`, 400, `bad_${what}`);
  return s;
};

// ---- Packages ----------------------------------------------------------------------------
function cleanPackage(b, { creating = false } = {}) {
  const out = {};
  const has = (k) => k in (b || {});
  if (creating || has('name')) {
    const n = text(b.name, 80);
    if (!n) throw fail('Package name is required.', 400, 'bad_name');
    out.name = n;
  }
  if (creating || has('sessions')) out.sessions = int(b.sessions, 1, 200, 'sessions');
  if (creating || has('price')) out.price = int(b.price, 0, 1e9, 'price');
  if (creating || has('valid_months')) out.valid_months = int(b.valid_months ?? 2, 1, 24, 'valid_months');
  if (has('note')) out.note = text(b.note, 300);
  if (has('active')) out.active = !!b.active;
  if (has('sort')) out.sort = int(b.sort, 0, 1000, 'sort');
  return out;
}

async function listPackages(coachId) {
  const { data, error } = await supabase.from('coach_packages').select('*').eq('coach_id', coachId).order('sort').order('created_at');
  if (error) throw error;
  return data || [];
}

// ---- Classes -------------------------------------------------------------------------------
function cleanClass(b, coach, { creating = false } = {}) {
  const out = {};
  const has = (k) => k in (b || {});
  if (creating || has('title')) {
    const t = text(b.title, 120);
    if (!t) throw fail('Class title is required.', 400, 'bad_title');
    out.title = t;
  }
  if (creating || has('kind')) {
    const k = b.kind || 'group';
    if (!KINDS.includes(k)) throw fail('Unknown class kind.', 400, 'bad_kind');
    out.kind = k;
  }
  if (has('court_name')) out.court_name = text(b.court_name, 160);
  else if (creating) out.court_name = coach.court_name || null;
  if (has('map_url')) {
    const u = text(b.map_url, 500);
    if (u && !/^https:\/\/\S+$/i.test(u)) throw fail('The map link must be an https link.', 400, 'bad_map_url');
    out.map_url = u;
  } else if (creating) out.map_url = coach.map_url || null;
  if (creating || has('start_time')) out.start_time = time(b.start_time);
  if (creating || has('duration_min')) out.duration_min = int(b.duration_min ?? 90, 15, 480, 'duration_min');
  if (creating || has('capacity')) out.capacity = int(b.capacity ?? (out.kind === 'private' ? 1 : 8), 1, 100, 'capacity');
  if (creating || has('fee')) out.fee = int(b.fee ?? 0, 0, 1e9, 'fee');
  if (creating || has('signup_deadline_hours')) out.signup_deadline_hours = int(b.signup_deadline_hours ?? 2, 0, 168, 'signup_deadline_hours');
  if (has('waitlist')) out.waitlist = !!b.waitlist;
  if (has('deduct_mode')) {
    if (b.deduct_mode != null && b.deduct_mode !== '' && !DEDUCT.includes(b.deduct_mode)) throw fail('Unknown deduct_mode.', 400, 'bad_deduct_mode');
    out.deduct_mode = b.deduct_mode || null;
  }
  if (has('note')) out.note = text(b.note, 1000);
  if (has('status')) {
    if (!['open', 'closed', 'archived'].includes(b.status)) throw fail('Unknown status.', 400, 'bad_status');
    out.status = b.status;
  }
  // The schedule: a single session has one date; the others repeat on weekdays between two dates.
  if (creating) {
    if (out.kind === 'single') {
      out.date_from = day(b.date || b.date_from, 'date');
      out.date_to = out.date_from;
      out.weekdays = [weekdayOf(out.date_from)];
    } else {
      out.date_from = day(b.date_from, 'date_from');
      out.date_to = day(b.date_to, 'date_to');
      if (out.date_to < out.date_from) throw fail('date_to must be on or after date_from.', 400, 'bad_date_to');
      const wd = [...new Set((Array.isArray(b.weekdays) ? b.weekdays : []).map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6).sort();
      if (!wd.length) throw fail('Pick at least one weekday.', 400, 'bad_weekdays');
      out.weekdays = wd;
    }
  }
  return out;
}

// Sessions a new class writes out.
function sessionsFor(cls) {
  const dates = cls.kind === 'single' ? [cls.date_from] : expandDates(cls.weekdays, cls.date_from, cls.date_to);
  if (!dates.length) throw fail('No session falls in that range on those weekdays.', 400, 'no_sessions');
  return dates.map((d) => ({ class_id: cls.id, coach_id: cls.coach_id, session_date: d, start_time: cls.start_time, duration_min: cls.duration_min, court_name: cls.court_name }));
}

async function createClass(coach, body) {
  const fields = cleanClass(body, coach, { creating: true });
  // Count before writing anything, so a huge range never leaves a half-made class.
  const planned = fields.kind === 'single' ? 1 : expandDates(fields.weekdays, fields.date_from, fields.date_to).length;
  if (!planned) throw fail('No session falls in that range on those weekdays.', 400, 'no_sessions');
  const { data: cls, error } = await supabase.from('coach_classes').insert({ ...fields, coach_id: coach.id }).select('*').single();
  if (error) throw error;
  const rows = sessionsFor(cls);
  const { error: sErr } = await supabase.from('coach_sessions').insert(rows);
  if (sErr) {
    await supabase.from('coach_classes').delete().eq('id', cls.id);
    throw sErr;
  }
  return { ...cls, sessions_count: rows.length };
}

// Edit a class; with apply_to = 'upcoming' the time / length / court also move on every
// session that has not happened yet (never on past or cancelled ones).
async function updateClass(coach, cls, body, today) {
  const fields = cleanClass(body, coach);
  const { data, error } = await supabase.from('coach_classes').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', cls.id).eq('coach_id', coach.id).select('*').single();
  if (error) throw error;
  let moved = 0;
  if (body?.apply_to === 'upcoming') {
    const patch = {};
    for (const k of ['start_time', 'duration_min', 'court_name']) if (k in fields) patch[k] = fields[k];
    if (Object.keys(patch).length) {
      const { data: rows, error: uErr } = await supabase.from('coach_sessions').update(patch).eq('class_id', cls.id).eq('status', 'scheduled').gte('session_date', today).select('id');
      if (uErr) throw uErr;
      moved = (rows || []).length;
    }
  }
  return { ...data, sessions_moved: moved };
}

// ---- Sessions ------------------------------------------------------------------------------
function cleanSession(b) {
  const out = {};
  const has = (k) => k in (b || {});
  if (has('session_date')) out.session_date = day(b.session_date, 'session_date');
  if (has('start_time')) out.start_time = time(b.start_time);
  if (has('duration_min')) out.duration_min = int(b.duration_min, 15, 480, 'duration_min');
  if (has('court_name')) out.court_name = text(b.court_name, 160);
  if (has('note')) out.note = text(b.note, 1000);
  if (has('status')) {
    if (!['scheduled', 'done', 'cancelled'].includes(b.status)) throw fail('Unknown status.', 400, 'bad_status');
    out.status = b.status;
  }
  return out;
}

async function listSessions(coachId, { from, to, classId } = {}) {
  let q = supabase.from('coach_sessions').select('*, coach_classes(title, kind, capacity, fee, status)').eq('coach_id', coachId).order('session_date').order('start_time');
  if (from) q = q.gte('session_date', from);
  if (to) q = q.lte('session_date', to);
  if (classId) q = q.eq('class_id', classId);
  const { data, error } = await q.limit(1000);
  if (error) throw error;
  return (data || []).map(({ coach_classes: c, ...s }) => ({ ...s, class_title: c?.title, class_kind: c?.kind, capacity: c?.capacity, fee: c?.fee, class_status: c?.status }));
}

// The end of a session as a timestamp (local wall clock, the way the club events count).
function endMs(s) {
  return Date.parse(`${s.session_date}T${String(s.start_time).slice(0, 8)}`) + Number(s.duration_min || 0) * 60000;
}

module.exports = { MIGRATION, ready, KINDS, DEDUCT, weekdayOf, addDays, expandDates, cleanPackage, listPackages, cleanClass, createClass, updateClass, sessionsFor, cleanSession, listSessions, endMs };
