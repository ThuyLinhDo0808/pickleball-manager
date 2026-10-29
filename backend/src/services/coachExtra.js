// Coach Manager (đợt C7 – C8): progress notes, reviews, open hours with 1-1 booking, the
// public coach search, reports, assistants and the coach's stats.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { fail } = require('./coachAccess');
const { todayYmd } = require('./memberships');

const MIGRATION = '20270104090000_coach_more.sql';
async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

const text = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw fail(`Too long (max ${max} characters).`, 400, 'too_long');
  return s;
};
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):([0-5]\d)(:\d\d)?$/;
const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const weekdayOf = (ymd) => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// "Lê Thị Tay" → "Tay" (the given name, as the public sees reviewers).
const shortName = (full) => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
};

// ---- Notes ---------------------------------------------------------------------------
async function notesFor(coachId, studentId, { sharedOnly = false } = {}) {
  let q = supabase.from('coach_notes').select('*, coach_sessions(session_date, start_time, coach_classes(title))').eq('coach_id', coachId).eq('student_id', studentId).order('created_at', { ascending: false }).limit(100);
  if (sharedOnly) q = q.eq('shared', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(({ coach_sessions: s, ...n }) => ({ ...n, session: s ? { session_date: s.session_date, start_time: s.start_time, class_title: s.coach_classes?.title } : null }));
}
function cleanNote(b) {
  const body = text(b?.body, 2000);
  if (!body) throw fail('Write the note.', 400, 'bad_body');
  const video = text(b?.video_url, 500);
  if (video && !/^https:\/\/\S+$/i.test(video)) throw fail('The video link must be an https link.', 400, 'bad_video_url');
  return { body, video_url: video, shared: b?.shared !== false };
}

// ---- Reviews -------------------------------------------------------------------------
// Someone may review a coach once they were present at least once.
async function canReview(studentId) {
  const { count } = await supabase.from('coach_attendance').select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('status', 'present');
  return (count || 0) > 0;
}
async function upsertReview(coach, student, userId, b) {
  if (!(await canReview(student.id))) throw fail('You can review a coach after your first session with them.', 403, 'review_not_allowed');
  const stars = Number(b?.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw fail('Give 1 to 5 stars.', 400, 'bad_stars');
  const row = { coach_id: coach.id, student_id: student.id, user_id: userId, stars, body: text(b?.body, 1000), updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('coach_reviews').upsert(row, { onConflict: 'coach_id,student_id' }).select('*').single();
  if (error) throw error;
  return data;
}
async function ratingOf(coachIds) {
  const out = new Map();
  if (!coachIds.length) return out;
  const { data } = await supabase.from('coach_reviews').select('coach_id, stars').in('coach_id', coachIds).eq('hidden', false).limit(100000);
  for (const r of data || []) {
    const x = out.get(r.coach_id) || { n: 0, sum: 0 };
    x.n += 1;
    x.sum += r.stars;
    out.set(r.coach_id, x);
  }
  for (const [k, x] of out) out.set(k, { rating: Math.round((x.sum / x.n) * 10) / 10, reviews: x.n });
  return out;
}
async function publicReviews(coachId, limit = 20) {
  const { data } = await supabase.from('coach_reviews').select('id, stars, body, created_at, coach_students(full_name)').eq('coach_id', coachId).eq('hidden', false).order('created_at', { ascending: false }).limit(limit);
  return (data || []).map(({ coach_students: s, ...r }) => ({ ...r, name: shortName(s?.full_name) }));
}

// ---- Open hours and 1-1 booking ------------------------------------------------------
function cleanSlot(b, { creating = false } = {}) {
  const out = {};
  const has = (k) => k in (b || {});
  if (creating || has('weekday')) {
    const w = Number(b.weekday);
    if (!Number.isInteger(w) || w < 0 || w > 6) throw fail('Pick a weekday.', 400, 'bad_weekday');
    out.weekday = w;
  }
  for (const k of ['start_time', 'end_time']) {
    if (creating || has(k)) {
      if (!HM.test(String(b[k] || ''))) throw fail('Times look like 07:00.', 400, `bad_${k}`);
      out[k] = String(b[k]).slice(0, 5);
    }
  }
  if (out.start_time && out.end_time && toMin(out.end_time) <= toMin(out.start_time)) throw fail('The end must be after the start.', 400, 'bad_end_time');
  if (creating || has('lesson_min')) {
    const n = Number(b.lesson_min ?? 60);
    if (!Number.isInteger(n) || n < 30 || n > 240) throw fail('A lesson is 30 to 240 minutes.', 400, 'bad_lesson_min');
    out.lesson_min = n;
  }
  if (creating || has('price')) {
    const n = Number(b.price ?? 0);
    if (!Number.isInteger(n) || n < 0) throw fail('The price must be 0 or more.', 400, 'bad_price');
    out.price = n;
  }
  if (has('court_name')) out.court_name = text(b.court_name, 160);
  if (has('active')) out.active = !!b.active;
  return out;
}

// Free start times in the coming `days` days: every lesson-long step of every active slot,
// minus past times (and the next `leadHours`), sessions already on the coach's calendar and
// bookings already asked for. Pure, so it is tested on its own.
function freeTimes({ slots, busy, today, nowMin = 0, days = 21, leadHours = 2 }) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(today, i);
    const wd = weekdayOf(date);
    const taken = (busy[date] || []).map(([a, b]) => [toMin(a), toMin(a) + b]);
    for (const s of slots) {
      if (!s.active || s.weekday !== wd) continue;
      const end = toMin(s.end_time);
      for (let m = toMin(s.start_time); m + s.lesson_min <= end; m += s.lesson_min) {
        if (i * 1440 + m < leadHours * 60 + nowMin) continue;
        if (taken.some(([a, b]) => m < b && a < m + s.lesson_min)) continue;
        out.push({ date, start_time: fromMin(m), duration_min: s.lesson_min, slot_id: s.id, price: s.price, court_name: s.court_name || null });
      }
    }
  }
  return out.sort((a, b) => (a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date)));
}

// Minutes since midnight now, Vietnam time (the coach's wall clock).
function vnNowMin() {
  const d = new Date(Date.now() + 7 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
async function openTimes(coach, days = 21) {
  const today = todayYmd();
  const [{ data: slots }, { data: sessions }, { data: bookings }] = await Promise.all([
    supabase.from('coach_slots').select('*').eq('coach_id', coach.id).eq('active', true),
    supabase.from('coach_sessions').select('session_date, start_time, duration_min').eq('coach_id', coach.id).eq('status', 'scheduled').gte('session_date', today).lte('session_date', addDays(today, days)),
    supabase.from('coach_bookings').select('session_date, start_time, duration_min').eq('coach_id', coach.id).in('status', ['requested', 'accepted']).gte('session_date', today),
  ]);
  const busy = {};
  for (const x of [...(sessions || []), ...(bookings || [])]) (busy[x.session_date] ||= []).push([String(x.start_time).slice(0, 5), x.duration_min]);
  return freeTimes({ slots: slots || [], busy, today, nowMin: vnNowMin(), days });
}

async function requestBooking(coach, student, b) {
  if (coach.status !== 'active') throw fail('This coach is not taking students now.', 409, 'coach_paused');
  if (student.status === 'blocked') throw fail('This student is blocked.', 403, 'student_blocked');
  if (!YMD.test(String(b?.date || '')) || !HM.test(String(b?.start_time || ''))) throw fail('Pick a day and a time.', 400, 'bad_time');
  const start = String(b.start_time).slice(0, 5);
  const hit = (await openTimes(coach)).find((x) => x.date === b.date && x.start_time === start);
  if (!hit) throw fail('That time is no longer free.', 409, 'time_taken');
  const pay = ['package', 'per_session', 'free'].includes(b.pay_mode) ? b.pay_mode : hit.price > 0 ? 'per_session' : 'package';
  const row = { coach_id: coach.id, student_id: student.id, slot_id: hit.slot_id, session_date: hit.date, start_time: hit.start_time, duration_min: hit.duration_min, pay_mode: pay, note: text(b.note, 500) };
  const { data, error } = await supabase.from('coach_bookings').insert(row).select('*').single();
  if (error) {
    if (error.code === '23505') throw fail('That time is no longer free.', 409, 'time_taken');
    throw error;
  }
  return data;
}

// The coach accepts: a single-session "Kèm 1-1" class is made for it and the student is on it.
async function acceptBooking(coach, bk) {
  if (bk.status !== 'requested') throw fail('This request was already answered.', 409, 'decided');
  const S = require('./coachSchedule');
  const ST = require('./coachStudents');
  const { data: st } = await supabase.from('coach_students').select('*').eq('id', bk.student_id).maybeSingle();
  const { data: slot } = bk.slot_id ? await supabase.from('coach_slots').select('*').eq('id', bk.slot_id).maybeSingle() : { data: null };
  const cls = await S.createClass(coach, {
    kind: 'single',
    title: `Kèm 1-1 · ${st?.full_name || 'Học viên'}`.slice(0, 120),
    date: bk.session_date,
    start_time: String(bk.start_time).slice(0, 5),
    duration_min: bk.duration_min,
    capacity: 1,
    fee: slot?.price || 0,
    ...(slot?.court_name ? { court_name: slot.court_name } : {}),
    waitlist: false,
    note: bk.note || null,
  });
  await ST.enroll(coach, cls, st, { pay_mode: bk.pay_mode, source: 'account', confirm: true });
  // A private lesson: closed to sign-ups, so it stays off the public page.
  await supabase.from('coach_classes').update({ status: 'closed' }).eq('id', cls.id);
  const { data: sess } = await supabase.from('coach_sessions').select('id').eq('class_id', cls.id).limit(1).maybeSingle();
  const { data, error } = await supabase.from('coach_bookings').update({ status: 'accepted', decided_at: new Date().toISOString(), class_id: cls.id, session_id: sess?.id || null }).eq('id', bk.id).select('*').single();
  if (error) throw error;
  return data;
}
async function declineBooking(coach, bk, note) {
  if (bk.status !== 'requested') throw fail('This request was already answered.', 409, 'decided');
  const { data, error } = await supabase.from('coach_bookings').update({ status: 'declined', decided_at: new Date().toISOString(), decline_note: text(note, 300) }).eq('id', bk.id).select('*').single();
  if (error) throw error;
  return data;
}
// The student takes it back: a request is simply cancelled; an accepted lesson cancels its
// session too (before it starts).
async function cancelBooking(bk) {
  if (!['requested', 'accepted'].includes(bk.status)) throw fail('This booking is not active.', 409, 'not_live');
  if (Date.parse(`${bk.session_date}T${String(bk.start_time).slice(0, 5)}:00+07:00`) < Date.now()) throw fail('This lesson has already started.', 409, 'session_started');
  if (bk.session_id) await supabase.from('coach_sessions').update({ status: 'cancelled' }).eq('id', bk.session_id);
  if (bk.class_id) await supabase.from('coach_enrollments').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('class_id', bk.class_id).in('status', ['requested', 'confirmed', 'waitlist']);
  const { data, error } = await supabase.from('coach_bookings').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('id', bk.id).select('*').single();
  if (error) throw error;
  return data;
}

// ---- Public search -------------------------------------------------------------------
async function search({ sport, q, area } = {}) {
  let query = supabase.from('coach_profiles').select('id, user_id, slug, display_name, sport, area, court_name, level_text, price_note, bio').eq('status', 'active').eq('public', true).order('created_at', { ascending: false }).limit(200);
  if (['pickleball', 'badminton'].includes(sport)) query = query.eq('sport', sport);
  const { data, error } = await query;
  if (error) throw error;
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const needle = norm(q).trim();
  const where = norm(area).trim();
  let rows = (data || []).filter((c) => (!needle || [c.display_name, c.area, c.court_name, c.level_text].some((x) => norm(x).includes(needle))) && (!where || norm(c.area).includes(where) || norm(c.court_name).includes(where)));
  const ids = rows.map((c) => c.id);
  const [ratings, { data: classes }, { data: slots }] = await Promise.all([
    ratingOf(ids),
    ids.length ? supabase.from('coach_classes').select('coach_id').in('coach_id', ids).eq('status', 'open') : { data: [] },
    ids.length ? supabase.from('coach_slots').select('coach_id').in('coach_id', ids).eq('active', true) : { data: [] },
  ]);
  const open = new Map();
  for (const c of classes || []) open.set(c.coach_id, (open.get(c.coach_id) || 0) + 1);
  const withSlots = new Set((slots || []).map((s) => s.coach_id));
  await require('./playerAvatars').attach(rows);
  rows = rows.map(({ user_id, bio, ...c }) => ({ ...c, avatar_uid: c.avatar_v ? user_id : undefined, bio: bio ? String(bio).slice(0, 160) : null, open_classes: open.get(c.id) || 0, one_on_one: withSlots.has(c.id), ...(ratings.get(c.id) || { rating: null, reviews: 0 }) }));
  rows.sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.reviews - a.reviews || b.open_classes - a.open_classes);
  return rows;
}

// ---- Assistants (C8) -----------------------------------------------------------------
// The coaches this account assists (matched on the confirmed email, linked on first use).
async function assistingFor(userId, email) {
  if (!(await ready())) return [];
  const mail = String(email || '').toLowerCase();
  if (!mail) return [];
  const { data } = await supabase.from('coach_assistants').select('id, coach_id, user_id, coach_profiles(id, user_id, slug, display_name, sport, status, cancel_hours, deduct_mode)').ilike('email', mail).eq('status', 'active');
  const out = [];
  for (const a of data || []) {
    if (!a.coach_profiles || a.coach_profiles.status === 'blocked') continue;
    if (!a.user_id) await supabase.from('coach_assistants').update({ user_id: userId }).eq('id', a.id);
    out.push(a.coach_profiles);
  }
  return out;
}

// ---- Stats (C8) ----------------------------------------------------------------------
// Last `months` months: sessions taught, attendance rate, active students, money in / out.
async function stats(coach, months = 6) {
  const today = todayYmd();
  const first = (() => {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - (months - 1));
    return d.toISOString().slice(0, 10);
  })();
  const [{ data: sessions }, { data: att }, { data: ledger }, { data: classes }] = await Promise.all([
    supabase.from('coach_sessions').select('id, class_id, session_date, status').eq('coach_id', coach.id).gte('session_date', first).lte('session_date', today).limit(5000),
    supabase.from('coach_attendance').select('session_id, student_id, status, checked_at').eq('coach_id', coach.id).gte('checked_at', `${first}T00:00:00Z`).limit(20000),
    supabase.from('coach_ledger').select('type, amount, occurred_on, excluded, is_voided').eq('coach_id', coach.id).gte('occurred_on', first).limit(20000).then((r) => r, () => ({ data: [] })),
    supabase.from('coach_classes').select('id, title').eq('coach_id', coach.id),
  ]);
  const byMonth = new Map();
  const m = (ymd) => String(ymd).slice(0, 7);
  for (let i = 0; i < months; i += 1) {
    const d = new Date(`${first}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i);
    byMonth.set(d.toISOString().slice(0, 7), { month: d.toISOString().slice(0, 7), sessions: 0, present: 0, absent: 0, excused: 0, students: new Set(), income: 0, expense: 0 });
  }
  const sessMonth = new Map();
  const perClass = new Map();
  for (const s of sessions || []) {
    sessMonth.set(s.id, m(s.session_date));
    if (s.status === 'cancelled') continue;
    const row = byMonth.get(m(s.session_date));
    if (row) row.sessions += 1;
    perClass.set(s.class_id, (perClass.get(s.class_id) || 0) + 1);
  }
  for (const a of att || []) {
    const row = byMonth.get(sessMonth.get(a.session_id) || m(a.checked_at));
    if (!row) continue;
    row[a.status] += 1;
    if (a.status === 'present') row.students.add(a.student_id);
  }
  for (const e of ledger || []) {
    if (e.is_voided || e.excluded) continue;
    const row = byMonth.get(m(e.occurred_on));
    if (row) row[e.type] += e.amount;
  }
  const title = new Map((classes || []).map((c) => [c.id, c.title]));
  const monthsOut = [...byMonth.values()].map((r) => {
    const marked = r.present + r.absent + r.excused;
    return { month: r.month, sessions: r.sessions, present: r.present, absent: r.absent, excused: r.excused, attendance_rate: marked ? Math.round((r.present / marked) * 100) : null, students: r.students.size, income: r.income, expense: r.expense, net: r.income - r.expense };
  });
  const top = [...perClass.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ class_id: id, title: title.get(id) || '—', sessions: n }));
  return { months: monthsOut, top_classes: top };
}

module.exports = { MIGRATION, ready, shortName, notesFor, cleanNote, canReview, upsertReview, ratingOf, publicReviews, cleanSlot, freeTimes, openTimes, requestBooking, acceptBooking, declineBooking, cancelBooking, search, assistingFor, stats, weekdayOf, addDays };
