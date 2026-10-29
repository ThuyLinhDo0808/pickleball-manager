// Coach Manager (đợt C4): attendance, package purchases and per-session fees.
//
// The rule (coach_profiles.deduct_mode, overridden per class by coach_classes.deduct_mode):
//   present_or_noshow  a session is charged when the student was there, or stayed away
//                      without telling the coach before the cancel deadline (default)
//   present_only       charged only when the student was there
//   always             every scheduled session is charged (an excused absence too)
// "Charged" means: pay_mode package → one session taken from the student's live
// purchase (none → flagged "no package"); per_session → an unpaid fee of the class fee;
// free → nothing. Changing an attendance that was charged gives the session / fee back.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { fail } = require('./coachAccess');
const { todayYmd } = require('./memberships');

const MIGRATION = '20270102090000_coach_attendance.sql';
async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

const STATUSES = ['present', 'absent', 'excused'];
const deductMode = (coach, cls) => cls?.deduct_mode || coach?.deduct_mode || 'present_or_noshow';
function charges(mode, status, late) {
  if (status === 'present') return true;
  if (status === 'absent') return mode !== 'present_only';
  // excused: on time → only "always"; late → like a no-show
  return mode === 'always' || (late && mode === 'present_or_noshow');
}

const startMs = (s) => Date.parse(`${s.session_date}T${String(s.start_time).slice(0, 8)}`);
// The student may still say "I can't come" before this moment (coach's cancel_hours).
const excuseDeadlineMs = (s, coach) => startMs(s) - Number(coach?.cancel_hours || 0) * 3600000;

// ---- Purchases -------------------------------------------------------------------------
function addMonths(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}
const text = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw fail(`Too long (max ${max} characters).`, 400, 'too_long');
  return s;
};
const int = (v, lo, hi, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw fail(`${name} must be between ${lo} and ${hi}.`, 400, `bad_${name}`);
  return n;
};
const YMD = /^\d{4}-\d{2}-\d{2}$/;

// The coach records a package a student bought: from one of their packages or typed in.
async function addPurchase(coach, student, body) {
  let pkg = null;
  if (body?.package_id) {
    const { data } = await supabase.from('coach_packages').select('*').eq('id', body.package_id).eq('coach_id', coach.id).maybeSingle();
    if (!data) throw fail('Package not found.', 404, 'not_found');
    pkg = data;
  }
  const name = text(body?.name, 80) || pkg?.name;
  if (!name) throw fail('Name is required.', 400, 'bad_name');
  const sessions = int(body?.sessions_total ?? pkg?.sessions, 1, 200, 'sessions_total');
  const price = int(body?.price ?? pkg?.price ?? 0, 0, 1e9, 'price');
  const starts = YMD.test(String(body?.starts_on || '')) ? body.starts_on : todayYmd();
  const months = body?.valid_months != null ? int(body.valid_months, 0, 24, 'valid_months') : pkg?.valid_months ?? 0;
  const expires = YMD.test(String(body?.expires_on || '')) ? body.expires_on : months ? addMonths(starts, months) : null;
  const row = {
    coach_id: coach.id,
    student_id: student.id,
    package_id: pkg?.id || null,
    name,
    sessions_total: sessions,
    price,
    starts_on: starts,
    expires_on: expires,
    status: 'active',
    paid_at: body?.paid === false ? null : new Date().toISOString(),
    note: text(body?.note, 300),
  };
  const { data, error } = await supabase.from('coach_package_purchases').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

function cleanPurchase(b) {
  const out = {};
  const has = (k) => k in (b || {});
  if (has('paid')) out.paid_at = b.paid ? new Date().toISOString() : null;
  if (has('expires_on')) out.expires_on = b.expires_on && YMD.test(String(b.expires_on)) ? b.expires_on : null;
  if (has('sessions_total')) out.sessions_total = int(b.sessions_total, 1, 200, 'sessions_total');
  if (has('price')) out.price = int(b.price, 0, 1e9, 'price');
  if (has('note')) out.note = text(b.note, 300);
  if (has('status')) {
    if (!['active', 'cancelled', 'expired'].includes(b.status)) throw fail('Unknown status.', 400, 'bad_status');
    out.status = b.status;
  }
  return out;
}

// Live purchases of a student: active, not expired, with sessions left; oldest expiry first.
async function livePurchases(studentIds, today = todayYmd()) {
  if (!studentIds.length) return [];
  const { data, error } = await supabase.from('coach_package_purchases').select('*').in('student_id', studentIds).eq('status', 'active').order('expires_on', { ascending: true, nullsFirst: false }).order('created_at');
  if (error) throw error;
  return (data || []).filter((p) => (!p.expires_on || p.expires_on >= today) && p.sessions_used < p.sessions_total);
}

// { student_id → { remaining, expires_on, purchase_id, purchases } } for the lists.
async function balances(studentIds) {
  const out = {};
  for (const id of studentIds) out[id] = { remaining: 0, expires_on: null, purchase_id: null, has_package: false };
  for (const p of await livePurchases(studentIds)) {
    const b = out[p.student_id];
    b.remaining += p.sessions_total - p.sessions_used;
    b.has_package = true;
    if (!b.purchase_id) {
      b.purchase_id = p.id;
      b.expires_on = p.expires_on;
    }
  }
  return out;
}

async function bumpPurchase(id, delta) {
  const { data: p } = await supabase.from('coach_package_purchases').select('sessions_used, sessions_total').eq('id', id).maybeSingle();
  if (!p) return;
  const used = Math.max(0, p.sessions_used + delta);
  await supabase.from('coach_package_purchases').update({ sessions_used: used }).eq('id', id);
}

// ---- Attendance ------------------------------------------------------------------------
async function enrollmentOf(cls, studentId) {
  const { data } = await supabase.from('coach_enrollments').select('*').eq('class_id', cls.id).eq('student_id', studentId).in('status', ['confirmed', 'requested', 'waitlist']).maybeSingle();
  return data || null;
}

// Give back what an attendance row charged (its package session or its unpaid fee).
async function uncharge(att) {
  if (att.purchase_id) await bumpPurchase(att.purchase_id, -1);
  await supabase.from('coach_session_fees').delete().eq('session_id', att.session_id).eq('student_id', att.student_id).eq('status', 'unpaid');
}

// Take the session from the student's package / raise the fee. Returns the purchase id used.
async function charge(coach, cls, session, studentId, payMode) {
  if (payMode === 'free') return null;
  if (payMode === 'package') {
    const [p] = await livePurchases([studentId]);
    if (!p) {
      // No package: a fee if the class has one, else just flagged (the coach sees "chưa có gói").
      if (cls.fee > 0) await upsertFee(coach, session, studentId, cls.fee);
      return null;
    }
    await bumpPurchase(p.id, 1);
    return p.id;
  }
  if (cls.fee > 0) await upsertFee(coach, session, studentId, cls.fee);
  return null;
}

async function upsertFee(coach, session, studentId, amount) {
  const { data: have } = await supabase.from('coach_session_fees').select('id').eq('session_id', session.id).eq('student_id', studentId).maybeSingle();
  if (have) return;
  await supabase.from('coach_session_fees').insert({ session_id: session.id, coach_id: coach.id, student_id: studentId, amount });
}

// Set one student's attendance for a session (by the coach, or `by_student` for an
// excuse). Settles the package / fee according to the rule.
async function mark(coach, cls, session, studentId, status, { late = false, by_student = false, note = null } = {}) {
  if (!STATUSES.includes(status)) throw fail('Unknown attendance status.', 400, 'bad_status');
  if (session.status === 'cancelled') throw fail('This session was cancelled.', 409, 'session_cancelled');
  const enr = await enrollmentOf(cls, studentId);
  const payMode = enr?.pay_mode || 'package';
  const mode = deductMode(coach, cls);
  const { data: prior } = await supabase.from('coach_attendance').select('*').eq('session_id', session.id).eq('student_id', studentId).maybeSingle();
  const wasCharged = !!prior && charges(mode, prior.status, prior.late);
  const nowCharged = charges(mode, status, late);
  let purchaseId = prior?.purchase_id || null;
  if (wasCharged && !nowCharged) {
    await uncharge(prior);
    purchaseId = null;
  } else if (!wasCharged && nowCharged) {
    purchaseId = await charge(coach, cls, session, studentId, payMode);
  }
  const row = { session_id: session.id, coach_id: coach.id, student_id: studentId, status, late, by_student, purchase_id: purchaseId, checked_at: new Date().toISOString(), note: text(note, 300) };
  const { data, error } = await supabase.from('coach_attendance').upsert(row, { onConflict: 'session_id,student_id' }).select('*').single();
  if (error) throw error;
  return data;
}

// Remove a mark (back to "not yet"); gives back what it charged.
async function unmark(session, studentId) {
  const { data: prior } = await supabase.from('coach_attendance').select('*').eq('session_id', session.id).eq('student_id', studentId).maybeSingle();
  if (!prior) return;
  const { data: cls } = await supabase.from('coach_classes').select('deduct_mode, coach_id').eq('id', session.class_id).maybeSingle();
  const { data: coach } = await supabase.from('coach_profiles').select('deduct_mode').eq('id', session.coach_id).maybeSingle();
  if (charges(deductMode(coach, cls), prior.status, prior.late)) await uncharge(prior);
  await supabase.from('coach_attendance').delete().eq('id', prior.id);
}

// The student says they can't come. Before the deadline it is free; after it, it is
// recorded as late (charged like a no-show under the default rule).
async function excuse(coach, cls, session, studentId, undo = false) {
  if (session.status !== 'scheduled') throw fail('This session is not open.', 409, 'session_closed');
  if (startMs(session) < Date.now()) throw fail('This session has already started.', 409, 'session_started');
  const { data: prior } = await supabase.from('coach_attendance').select('*').eq('session_id', session.id).eq('student_id', studentId).maybeSingle();
  if (prior && !prior.by_student) throw fail('The coach already marked this session.', 409, 'marked');
  if (undo) {
    if (prior) await unmark(session, studentId);
    return null;
  }
  const late = Date.now() > excuseDeadlineMs(session, coach);
  return mark(coach, cls, session, studentId, 'excused', { late, by_student: true });
}

// Who is in a session: confirmed students of the class plus anyone already marked,
// each with attendance, fee and package balance.
async function people(coach, cls, session) {
  const [{ data: enr }, { data: att }, { data: fees }] = await Promise.all([
    supabase.from('coach_enrollments').select('*, coach_students(*)').eq('class_id', cls.id).eq('status', 'confirmed').order('created_at'),
    supabase.from('coach_attendance').select('*, coach_students(*)').eq('session_id', session.id),
    supabase.from('coach_session_fees').select('*').eq('session_id', session.id),
  ]);
  const byStudent = new Map();
  for (const e of enr || []) byStudent.set(e.student_id, { student: e.coach_students, pay_mode: e.pay_mode, enrollment_id: e.id });
  for (const a of att || []) if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, { student: a.coach_students, pay_mode: null, enrollment_id: null, left: true });
  const ids = [...byStudent.keys()];
  const bal = await balances(ids);
  const attBy = new Map((att || []).map((a) => [a.student_id, a]));
  const feeBy = new Map((fees || []).map((f) => [f.student_id, f]));
  const rows = ids.map((id) => {
    const x = byStudent.get(id);
    const a = attBy.get(id);
    const { coach_students: _drop, ...attendance } = a || {};
    return {
      student: x.student,
      pay_mode: x.pay_mode,
      left: !!x.left,
      attendance: a ? attendance : null,
      fee: feeBy.get(id) || null,
      balance: bal[id],
    };
  });
  rows.sort((p, q) => String(p.student?.full_name || '').localeCompare(String(q.student?.full_name || ''), 'vi'));
  return rows;
}

// Close a session: everyone not marked is a no-show (charged by the rule), status done.
async function finish(coach, cls, session) {
  if (session.status === 'cancelled') throw fail('This session was cancelled.', 409, 'session_cancelled');
  const rows = await people(coach, cls, session);
  for (const r of rows) if (!r.attendance && !r.left) await mark(coach, cls, session, r.student.id, 'absent');
  const { data, error } = await supabase.from('coach_sessions').update({ status: 'done' }).eq('id', session.id).select('*').single();
  if (error) throw error;
  return data;
}

// A student's attendance history (newest first) with the session and class.
async function history(studentId, limit = 30) {
  const { data, error } = await supabase.from('coach_attendance').select('*, coach_sessions(id, session_date, start_time, duration_min, status, class_id, coach_classes(title))').eq('student_id', studentId).order('checked_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map(({ coach_sessions: s, ...a }) => ({ ...a, session: s && { id: s.id, session_date: s.session_date, start_time: s.start_time, duration_min: s.duration_min, status: s.status, class_id: s.class_id, class_title: s.coach_classes?.title } }));
}

// Counts for a student: present / absent / excused.
function tally(rows) {
  const n = { present: 0, absent: 0, excused: 0, late: 0 };
  for (const r of rows) {
    n[r.status] += 1;
    if (r.late) n.late += 1;
  }
  return n;
}

module.exports = { MIGRATION, ready, STATUSES, deductMode, charges, startMs, excuseDeadlineMs, addPurchase, cleanPurchase, livePurchases, balances, mark, unmark, excuse, people, finish, history, tally };
