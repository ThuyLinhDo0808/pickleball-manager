// Coach Manager (đợt C3): students and enrolments.
//
// Who may join a class: anyone with an account (from the public page or /p), anyone
// without one through the quick form (name + phone; their account is linked later by that
// phone), and anyone the coach adds by hand. A sign-up waits for the coach ("requested")
// unless the class is full — then it is on the waiting list (or refused when the class
// has no waiting list). The coach confirms, moves to the waiting list, or removes.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { fail } = require('./coachAccess');
const { normalizePhone } = require('./memberships');

const MIGRATION = '20270101090000_coach_students.sql';
async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

const LIVE = ['requested', 'confirmed', 'waitlist'];
const PAY = ['package', 'per_session', 'free'];
const phoneKey = (phone) => {
  const d = normalizePhone(phone);
  return d.length >= 9 ? d.slice(-9) : null;
};
const text = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw fail(`Too long (max ${max} characters).`, 400, 'too_long');
  return s;
};

// What the public / the student may see of a student row: never the coach's note.
const studentView = ({ note, phone_key, ...s }) => s;

// ---- Students --------------------------------------------------------------------------
// The student row for an account (made on first contact). A quick sign-up with the same
// phone is taken over, so the history stays in one place.
async function studentForUser(coach, userId, { full_name, phone } = {}) {
  const { data: mine } = await supabase.from('coach_students').select('*').eq('coach_id', coach.id).eq('user_id', userId).maybeSingle();
  if (mine) return mine;
  const [{ data: prof }, { data: acc }] = await Promise.all([
    supabase.from('player_profiles').select('full_name, phone').eq('user_id', userId).maybeSingle(),
    supabase.from('users').select('username, email').eq('id', userId).maybeSingle(),
  ]);
  const name = text(full_name, 120) || prof?.full_name || acc?.username || String(acc?.email || '').split('@')[0] || 'Học viên';
  const ph = text(phone, 20) || prof?.phone || null;
  const key = phoneKey(ph);
  if (key) {
    const { data: quick } = await supabase.from('coach_students').select('*').eq('coach_id', coach.id).eq('phone_key', key).is('user_id', null).limit(1).maybeSingle();
    if (quick) {
      const { data } = await supabase.from('coach_students').update({ user_id: userId, full_name: quick.full_name || name }).eq('id', quick.id).select('*').single();
      return data;
    }
  }
  const { data, error } = await supabase.from('coach_students').insert({ coach_id: coach.id, user_id: userId, full_name: name, phone: ph, phone_key: key }).select('*').single();
  if (error) throw error;
  return data;
}

// The student row for a quick sign-up (name + phone). An account with that phone is
// linked at once, so the student sees the class under /p right away.
async function studentForQuick(coach, { full_name, phone }) {
  const name = text(full_name, 120);
  const ph = text(phone, 20);
  const key = phoneKey(ph);
  if (!name) throw fail('Name is required.', 400, 'bad_name');
  if (!key) throw fail('A phone number with at least 9 digits is required.', 400, 'bad_phone');
  const { data: same } = await supabase.from('coach_students').select('*').eq('coach_id', coach.id).eq('phone_key', key).order('first_seen').limit(1).maybeSingle();
  if (same) return same;
  // An account already using this phone? Then it is theirs.
  const { data: profs } = await supabase.from('player_profiles').select('user_id, phone').not('phone', 'is', null).ilike('phone', `%${key.slice(-7)}%`).limit(20);
  const owner = (profs || []).find((p) => phoneKey(p.phone) === key);
  const { data, error } = await supabase.from('coach_students').insert({ coach_id: coach.id, user_id: owner?.user_id || null, full_name: name, phone: ph, phone_key: key }).select('*').single();
  if (error) {
    if (error.code === '23505' && owner) {
      const { data: mine } = await supabase.from('coach_students').select('*').eq('coach_id', coach.id).eq('user_id', owner.user_id).maybeSingle();
      if (mine) return mine;
    }
    throw error;
  }
  return data;
}

// A student the coach types in (no account yet, or one matched by phone).
async function studentByCoach(coach, body) {
  const name = text(body?.full_name, 120);
  if (!name) throw fail('Name is required.', 400, 'bad_name');
  const ph = text(body?.phone, 20);
  const key = phoneKey(ph);
  if (key) {
    const { data: same } = await supabase.from('coach_students').select('*').eq('coach_id', coach.id).eq('phone_key', key).limit(1).maybeSingle();
    if (same) throw fail('A student with this phone already exists.', 409, 'student_exists');
  }
  const { data: profs } = key ? await supabase.from('player_profiles').select('user_id, phone').not('phone', 'is', null).ilike('phone', `%${key.slice(-7)}%`).limit(20) : { data: [] };
  const owner = (profs || []).find((p) => phoneKey(p.phone) === key);
  const row = { coach_id: coach.id, user_id: owner?.user_id || null, full_name: name, phone: ph, phone_key: key, level_text: text(body?.level_text, 80), note: text(body?.note, 2000) };
  const { data, error } = await supabase.from('coach_students').insert(row).select('*').single();
  if (error) {
    if (error.code === '23505') throw fail('This person is already your student.', 409, 'student_exists');
    throw error;
  }
  return data;
}

function cleanStudent(b) {
  const out = {};
  const has = (k) => k in (b || {});
  if (has('full_name')) {
    const n = text(b.full_name, 120);
    if (!n) throw fail('Name is required.', 400, 'bad_name');
    out.full_name = n;
  }
  if (has('phone')) {
    out.phone = text(b.phone, 20);
    out.phone_key = phoneKey(out.phone);
  }
  if (has('level_text')) out.level_text = text(b.level_text, 80);
  if (has('note')) out.note = text(b.note, 2000);
  if (has('status')) {
    if (!['active', 'left', 'blocked'].includes(b.status)) throw fail('Unknown status.', 400, 'bad_status');
    out.status = b.status;
  }
  return out;
}

// ---- Enrolments ------------------------------------------------------------------------
async function liveCounts(classId) {
  const { data } = await supabase.from('coach_enrollments').select('status').eq('class_id', classId).in('status', LIVE);
  const n = { requested: 0, confirmed: 0, waitlist: 0 };
  for (const r of data || []) n[r.status] += 1;
  return n;
}

// Sign a student up for a class. Returns the enrolment (new, or the live one already there).
async function enroll(coach, cls, student, { pay_mode = 'package', source = 'account', note = null, confirm = false } = {}) {
  if (cls.status !== 'open') throw fail('This class is not taking sign-ups.', 409, 'class_closed');
  if (student.status === 'blocked') throw fail('This student is blocked.', 403, 'student_blocked');
  if (!PAY.includes(pay_mode)) throw fail('Unknown pay_mode.', 400, 'bad_pay_mode');
  if (pay_mode === 'per_session' && !(cls.fee > 0)) pay_mode = 'package';
  const { data: live } = await supabase.from('coach_enrollments').select('*').eq('class_id', cls.id).eq('student_id', student.id).in('status', LIVE).maybeSingle();
  if (live) return { ...live, already: true };
  const n = await liveCounts(cls.id);
  let status = confirm ? 'confirmed' : 'requested';
  if (n.confirmed >= cls.capacity) {
    if (!cls.waitlist) throw fail('This class is full.', 409, 'class_full');
    status = 'waitlist';
  }
  const { data, error } = await supabase
    .from('coach_enrollments')
    .insert({ class_id: cls.id, coach_id: coach.id, student_id: student.id, status, pay_mode, source, note: text(note, 500), decided_at: status === 'confirmed' ? new Date().toISOString() : null })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      const { data: again } = await supabase.from('coach_enrollments').select('*').eq('class_id', cls.id).eq('student_id', student.id).in('status', LIVE).maybeSingle();
      if (again) return { ...again, already: true };
    }
    throw error;
  }
  return data;
}

// The coach decides: confirmed / waitlist / removed. Confirming over capacity is allowed
// (the coach knows the court); the count is shown so they see it.
async function decide(coach, enr, status) {
  if (!['confirmed', 'waitlist', 'removed', 'requested'].includes(status)) throw fail('Unknown status.', 400, 'bad_status');
  const patch = { status, decided_at: new Date().toISOString() };
  const { data, error } = await supabase.from('coach_enrollments').update(patch).eq('id', enr.id).eq('coach_id', coach.id).select('*').single();
  if (error) throw error;
  return data;
}

// The student backs out. Before the class's first upcoming session minus cancel_hours
// it is free; later it still goes through, but is marked late (C4 / C5 may charge it).
async function cancelByStudent(enr, cls, coach) {
  if (!LIVE.includes(enr.status)) throw fail('This sign-up is not active.', 409, 'not_live');
  const { data, error } = await supabase.from('coach_enrollments').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', enr.id).select('*').single();
  if (error) throw error;
  // Someone from the waiting list takes the free seat, in order of arrival.
  if (enr.status === 'confirmed') await promoteWaitlist(cls);
  return data;
}

async function promoteWaitlist(cls) {
  const n = await liveCounts(cls.id);
  if (n.confirmed >= cls.capacity) return null;
  const { data: next } = await supabase.from('coach_enrollments').select('*').eq('class_id', cls.id).eq('status', 'waitlist').order('created_at').limit(1).maybeSingle();
  if (!next) return null;
  const { data } = await supabase.from('coach_enrollments').update({ status: 'confirmed', decided_at: new Date().toISOString() }).eq('id', next.id).select('*').single();
  return data;
}

// Enrolments of a class with their students (coach's view).
async function classRoster(coachId, classId) {
  const { data, error } = await supabase.from('coach_enrollments').select('*, coach_students(*)').eq('coach_id', coachId).eq('class_id', classId).order('created_at');
  if (error) throw error;
  return (data || []).map(({ coach_students: s, ...e }) => ({ ...e, student: s }));
}

// A student's enrolments (coach's view of one student).
async function studentEnrollments(coachId, studentId) {
  const { data, error } = await supabase.from('coach_enrollments').select('*, coach_classes(id, title, kind, start_time, duration_min, weekdays, date_from, date_to, status)').eq('coach_id', coachId).eq('student_id', studentId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(({ coach_classes: c, ...e }) => ({ ...e, class: c }));
}

module.exports = { MIGRATION, ready, LIVE, PAY, phoneKey, studentView, studentForUser, studentForQuick, studentByCoach, cleanStudent, liveCounts, enroll, decide, cancelByStudent, promoteWaitlist, classRoster, studentEnrollments };
