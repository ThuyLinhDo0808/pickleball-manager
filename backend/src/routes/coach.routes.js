// Coach Manager (đợt C1): the coach's own profile and its public page.
//   /api/coach/...         signed in; the product must be on for this account
//   /api/public/coach/...  no login: the public page of a coach
const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');
const C = require('../services/coachAccess');
const S = require('../services/coachSchedule');
const ST = require('../services/coachStudents');
const AT = require('../services/coachAttendance');
const M = require('../services/coachMoney');
const X = require('../services/coachExtra');
const { requireCaptcha } = require('../services/captcha');
const { todayYmd } = require('../services/memberships');
const S_fail = (m, code) => C.fail(m, 400, code);

const router = express.Router();
const publicRoutes = express.Router();

const send = (res, err) => res.status(err.status || 500).json({ error: err.message, code: err.code, ...(err.migration ? { migration: err.migration } : {}) });

// Is the product on for me, and do I have a profile? Read by the web shell on every sign-in
// (the home hub tile, the context switcher, the menu), so it must be cheap and never fail.
router.get('/status', async (req, res) => {
  try {
    const enabled = await C.enabledFor(req);
    if (!enabled) return res.json({ enabled: false, has_profile: false });
    const ready = await C.ready();
    const me = ready ? await C.profileOf(req.userId) : null;
    res.json({
      enabled: true,
      ready,
      email_verified: !!req.emailVerified,
      has_profile: !!me,
      slug: me?.slug || null,
      display_name: me?.display_name || null,
      status: me?.status || null,
    });
  } catch (err) {
    res.json({ enabled: false, has_profile: false, error: err.message });
  }
});

// Open my coach profile. Needs a confirmed email (the product is given by email in beta,
// and students will reach the coach through it).
router.post('/me', async (req, res) => {
  try {
    if (!(await C.enabledFor(req))) throw C.fail('Coach Manager is not available for this account.', 403, 'coach_off');
    if (!(await C.ready())) throw Object.assign(C.fail('Coach Manager needs a database update.', 503, 'migration_missing'), { migration: C.MIGRATION });
    if (!req.emailVerified) throw C.fail('Confirm your email first.', 403, 'email_unverified');
    if (await C.profileOf(req.userId)) throw C.fail('You already have a coach profile.', 409, 'already_coach');
    const fields = C.cleanFields(req.body, { creating: true });
    const slug = fields.slug || (await C.freeSlug(fields.display_name));
    if (fields.slug) {
      const { data: taken } = await supabase.from('coach_profiles').select('id').eq('slug', fields.slug).maybeSingle();
      if (taken) throw C.fail('This address is taken.', 409, 'slug_taken');
    }
    const { data, error } = await supabase
      .from('coach_profiles')
      .insert({ ...fields, slug, user_id: req.userId })
      .select(C.SELECT)
      .single();
    if (error) return dbError(res, error);
    res.status(201).json(data);
  } catch (err) {
    send(res, err);
  }
});

router.use(C.requireCoach);

router.get('/me', (req, res) => res.json(req.coach));

router.patch('/me', async (req, res) => {
  try {
    const fields = C.cleanFields(req.body);
    if (fields.slug && fields.slug !== req.coach.slug) {
      const { data: taken } = await supabase.from('coach_profiles').select('id').eq('slug', fields.slug).maybeSingle();
      if (taken) throw C.fail('This address is taken.', 409, 'slug_taken');
    }
    const { data, error } = await supabase
      .from('coach_profiles')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', req.coach.id)
      .select(C.SELECT)
      .single();
    if (error) return dbError(res, error);
    res.json(data);
  } catch (err) {
    send(res, err);
  }
});

// The numbers on the coach's overview. Students and money arrive in later batches.
router.get('/overview', async (req, res) => {
  try {
    if (!(await S.ready())) return res.json({ profile: req.coach, classes: 0, students: 0, sessions_week: 0, pending: 0, next: [] });
    const today = todayYmd();
    const stReady = await ST.ready();
    const [{ count: classes }, week, next, { count: students }, { count: pending }] = await Promise.all([
      supabase.from('coach_classes').select('id', { count: 'exact', head: true }).eq('coach_id', req.coach.id).eq('status', 'open'),
      S.listSessions(req.coach.id, { from: today, to: S.addDays(today, 6) }),
      S.listSessions(req.coach.id, { from: today, to: S.addDays(today, 30) }),
      stReady ? supabase.from('coach_students').select('id', { count: 'exact', head: true }).eq('coach_id', req.coach.id).eq('status', 'active') : { count: 0 },
      stReady ? supabase.from('coach_enrollments').select('id', { count: 'exact', head: true }).eq('coach_id', req.coach.id).eq('status', 'requested') : { count: 0 },
    ]);
    const atReady = await AT.ready();
    const [{ count: unpaid }, { data: pastOpen }] = await Promise.all([
      atReady ? supabase.from('coach_session_fees').select('id', { count: 'exact', head: true }).eq('coach_id', req.coach.id).eq('status', 'unpaid') : { count: 0 },
      supabase.from('coach_sessions').select('id, session_date, start_time, duration_min').eq('coach_id', req.coach.id).eq('status', 'scheduled').lte('session_date', today).order('session_date', { ascending: false }).limit(200),
    ]);
    res.json({
      profile: req.coach,
      classes: classes || 0,
      students: students || 0,
      sessions_week: week.filter((x) => x.status === 'scheduled').length,
      pending: pending || 0,
      unpaid_fees: unpaid || 0,
      ...(await (async () => {
        if (!(await M.ready())) return { pending_proofs: 0, month: null };
        const [{ count }, book] = await Promise.all([
          supabase.from('coach_package_purchases').select('id', { count: 'exact', head: true }).eq('coach_id', req.coach.id).eq('status', 'pending').not('proof_submitted_at', 'is', null),
          M.ledger(req.coach, { from: `${today.slice(0, 7)}-01`, to: today }),
        ]);
        const { count: bookings } = (await X.ready()) ? await supabase.from('coach_bookings').select('id', { count: 'exact', head: true }).eq('coach_id', req.coach.id).eq('status', 'requested') : { count: 0 };
        return { pending_proofs: count || 0, pending_bookings: bookings || 0, month: { income: book.income, expense: book.expense, net: book.net } };
      })()),
      to_mark: (pastOpen || []).filter((x) => S.endMs(x) < Date.now()).length,
      next: next.filter((x) => x.status === 'scheduled' && S.endMs(x) > Date.now()).slice(0, 5),
    });
  } catch (err) {
    send(res, err);
  }
});

// Everything below needs the C2 migration.
router.use(async (req, res, next) => {
  if (await S.ready()) return next();
  return res.status(503).json({ error: 'Coach Manager needs a database update.', code: 'migration_missing', migration: S.MIGRATION });
});

// ---- Packages ---------------------------------------------------------------------------
router.get('/packages', async (req, res) => {
  try {
    res.json(await S.listPackages(req.coach.id));
  } catch (err) {
    send(res, err);
  }
});
router.post('/packages', async (req, res) => {
  try {
    const fields = S.cleanPackage(req.body, { creating: true });
    const { data, error } = await supabase.from('coach_packages').insert({ ...fields, coach_id: req.coach.id }).select('*').single();
    if (error) return dbError(res, error);
    res.status(201).json(data);
  } catch (err) {
    send(res, err);
  }
});
router.patch('/packages/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Package');
    const fields = S.cleanPackage(req.body);
    const { data, error } = await supabase.from('coach_packages').update(fields).eq('id', req.params.id).eq('coach_id', req.coach.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return notFound(res, 'Package');
    res.json(data);
  } catch (err) {
    send(res, err);
  }
});
// A package somebody already bought is never deleted (C5 points purchases at it): it is
// switched off instead. Until purchases exist, delete means delete.
router.delete('/packages/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Package');
    const { error } = await supabase.from('coach_packages').delete().eq('id', req.params.id).eq('coach_id', req.coach.id);
    if (error) {
      if (error.code === '23503') {
        await supabase.from('coach_packages').update({ active: false }).eq('id', req.params.id).eq('coach_id', req.coach.id);
        return res.json({ deleted: false, deactivated: true });
      }
      return dbError(res, error);
    }
    res.json({ deleted: true });
  } catch (err) {
    send(res, err);
  }
});

// ---- Classes ----------------------------------------------------------------------------
async function ownClass(req, res) {
  if (!isUuid(req.params.id)) return null;
  const { data, error } = await supabase.from('coach_classes').select('*').eq('id', req.params.id).eq('coach_id', req.coach.id).maybeSingle();
  if (error) throw error;
  return data || null;
}
router.get('/classes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('coach_classes').select('*').eq('coach_id', req.coach.id).neq('status', req.query.archived === '1' ? '-' : 'archived').order('created_at', { ascending: false });
    if (error) return dbError(res, error);
    const today = todayYmd();
    const ids = (data || []).map((c) => c.id);
    const counts = new Map();
    if (ids.length) {
      const { data: ss } = await supabase.from('coach_sessions').select('class_id, session_date, status').in('class_id', ids).limit(5000);
      for (const x of ss || []) {
        const c = counts.get(x.class_id) || { total: 0, upcoming: 0, next: null };
        c.total += 1;
        if (x.status === 'scheduled' && x.session_date >= today) {
          c.upcoming += 1;
          if (!c.next || x.session_date < c.next) c.next = x.session_date;
        }
        counts.set(x.class_id, c);
      }
    }
    const people = new Map();
    if (ids.length && (await ST.ready())) {
      const { data: en } = await supabase.from('coach_enrollments').select('class_id, status').in('class_id', ids).in('status', ST.LIVE).limit(10000);
      for (const e of en || []) {
        const c = people.get(e.class_id) || { requested: 0, confirmed: 0, waitlist: 0 };
        c[e.status] += 1;
        people.set(e.class_id, c);
      }
    }
    res.json((data || []).map((c) => ({ ...c, ...(counts.get(c.id) || { total: 0, upcoming: 0, next: null }), ...(people.get(c.id) || { requested: 0, confirmed: 0, waitlist: 0 }) })));
  } catch (err) {
    send(res, err);
  }
});
router.post('/classes', async (req, res) => {
  try {
    res.status(201).json(await S.createClass(req.coach, req.body));
  } catch (err) {
    send(res, err);
  }
});
router.get('/classes/:id', async (req, res) => {
  try {
    const cls = await ownClass(req, res);
    if (!cls) return notFound(res, 'Class');
    const sessions = await S.listSessions(req.coach.id, { classId: cls.id });
    const roster = (await ST.ready()) ? await ST.classRoster(req.coach.id, cls.id) : [];
    if (roster.length && (await AT.ready())) {
      const bal = await AT.balances(roster.map((r) => r.student_id));
      for (const r of roster) r.balance = bal[r.student_id] || null;
    }
    res.json({ ...cls, sessions, roster });
  } catch (err) {
    send(res, err);
  }
});
router.patch('/classes/:id', async (req, res) => {
  try {
    const cls = await ownClass(req, res);
    if (!cls) return notFound(res, 'Class');
    res.json(await S.updateClass(req.coach, cls, req.body, todayYmd()));
  } catch (err) {
    send(res, err);
  }
});
// Delete a class with everything in it (its sessions go with it). Once students are
// enrolled (C3) the class is archived instead.
router.delete('/classes/:id', async (req, res) => {
  try {
    const cls = await ownClass(req, res);
    if (!cls) return notFound(res, 'Class');
    const { error } = await supabase.from('coach_classes').delete().eq('id', cls.id).eq('coach_id', req.coach.id);
    if (error) {
      if (error.code === '23503') {
        await supabase.from('coach_classes').update({ status: 'archived' }).eq('id', cls.id);
        return res.json({ deleted: false, archived: true });
      }
      return dbError(res, error);
    }
    res.json({ deleted: true });
  } catch (err) {
    send(res, err);
  }
});
// One more session for a class (a make-up lesson, an extra day).
router.post('/classes/:id/sessions', async (req, res) => {
  try {
    const cls = await ownClass(req, res);
    if (!cls) return notFound(res, 'Class');
    const f = S.cleanSession(req.body);
    if (!f.session_date) throw S_fail('session_date is required.', 'bad_session_date');
    const row = { class_id: cls.id, coach_id: req.coach.id, session_date: f.session_date, start_time: f.start_time || cls.start_time, duration_min: f.duration_min || cls.duration_min, court_name: 'court_name' in f ? f.court_name : cls.court_name, note: f.note || null };
    const { data, error } = await supabase.from('coach_sessions').insert(row).select('*').single();
    if (error) return dbError(res, error);
    res.status(201).json(data);
  } catch (err) {
    send(res, err);
  }
});

// ---- Students (C3) ----------------------------------------------------------------------
router.use(['/students', '/enrollments', '/classes/:id/enroll'], async (req, res, next) => {
  if (await ST.ready()) return next();
  return res.status(503).json({ error: 'Coach Manager needs a database update.', code: 'migration_missing', migration: ST.MIGRATION });
});
router.get('/students', async (req, res) => {
  try {
    const { data, error } = await supabase.from('coach_students').select('*').eq('coach_id', req.coach.id).order('full_name');
    if (error) return dbError(res, error);
    const ids = (data || []).map((s) => s.id);
    const live = new Map();
    if (ids.length) {
      const { data: en } = await supabase.from('coach_enrollments').select('student_id, status, class_id').in('student_id', ids).in('status', ST.LIVE).limit(10000);
      for (const e of en || []) {
        const c = live.get(e.student_id) || { classes: 0, requested: 0 };
        c.classes += 1;
        if (e.status === 'requested') c.requested += 1;
        live.set(e.student_id, c);
      }
    }
    await require('../services/playerAvatars').attach(data || []);
    const bal = (await AT.ready()) ? await AT.balances(ids) : {};
    res.json((data || []).map((s) => ({ ...s, ...(live.get(s.id) || { classes: 0, requested: 0 }), balance: bal[s.id] || null, ...(s.avatar_v ? { avatar_uid: s.user_id } : {}) })));
  } catch (err) {
    send(res, err);
  }
});
router.post('/students', async (req, res) => {
  try {
    res.status(201).json(await ST.studentByCoach(req.coach, req.body));
  } catch (err) {
    send(res, err);
  }
});
async function ownStudent(req) {
  if (!isUuid(req.params.id)) return null;
  const { data, error } = await supabase.from('coach_students').select('*').eq('id', req.params.id).eq('coach_id', req.coach.id).maybeSingle();
  if (error) throw error;
  return data || null;
}
router.get('/students/:id', async (req, res) => {
  try {
    const st = await ownStudent(req);
    if (!st) return notFound(res, 'Student');
    const out = { ...st, enrollments: await ST.studentEnrollments(req.coach.id, st.id), purchases: [], history: [], tally: null, balance: null };
    if (await AT.ready()) {
      const [{ data: purchases }, history, bal] = await Promise.all([
        supabase.from('coach_package_purchases').select('*').eq('student_id', st.id).order('created_at', { ascending: false }),
        AT.history(st.id, 40),
        AT.balances([st.id]),
      ]);
      Object.assign(out, { purchases: (purchases || []).map(({ payment_proof, ...p }) => ({ ...p, has_proof: !!payment_proof, suggest_refund: M.suggestRefund(p) })), history, tally: AT.tally(history), balance: bal[st.id] });
    }
    res.json(out);
  } catch (err) {
    send(res, err);
  }
});
router.patch('/students/:id', async (req, res) => {
  try {
    const st = await ownStudent(req);
    if (!st) return notFound(res, 'Student');
    const { data, error } = await supabase.from('coach_students').update(ST.cleanStudent(req.body)).eq('id', st.id).select('*').single();
    if (error) return dbError(res, error);
    res.json(data);
  } catch (err) {
    send(res, err);
  }
});
// Put a student on a class by hand (confirmed at once; the coach decided).
router.post('/classes/:id/enroll', async (req, res) => {
  try {
    const cls = await ownClass(req, res);
    if (!cls) return notFound(res, 'Class');
    let student = null;
    if (isUuid(req.body?.student_id)) {
      const { data } = await supabase.from('coach_students').select('*').eq('id', req.body.student_id).eq('coach_id', req.coach.id).maybeSingle();
      student = data;
    } else student = await ST.studentByCoach(req.coach, req.body);
    if (!student) return notFound(res, 'Student');
    const enr = await ST.enroll(req.coach, cls, student, { pay_mode: req.body?.pay_mode || 'package', source: 'coach', confirm: true });
    res.status(201).json({ ...enr, student });
  } catch (err) {
    send(res, err);
  }
});
// Sign-ups waiting for the coach (across classes), newest first.
router.get('/enrollments', async (req, res) => {
  try {
    const status = ['requested', 'confirmed', 'waitlist', 'cancelled', 'removed'].includes(req.query.status) ? req.query.status : 'requested';
    const { data, error } = await supabase.from('coach_enrollments').select('*, coach_students(*), coach_classes(id, title, kind, capacity)').eq('coach_id', req.coach.id).eq('status', status).order('created_at', { ascending: false }).limit(500);
    if (error) return dbError(res, error);
    res.json((data || []).map(({ coach_students: st, coach_classes: c, ...e }) => ({ ...e, student: st, class: c })));
  } catch (err) {
    send(res, err);
  }
});
router.patch('/enrollments/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Enrollment');
    const { data: enr } = await supabase.from('coach_enrollments').select('*').eq('id', req.params.id).eq('coach_id', req.coach.id).maybeSingle();
    if (!enr) return notFound(res, 'Enrollment');
    const out = await ST.decide(req.coach, enr, req.body?.status);
    if (out.status === 'confirmed' && enr.status !== 'confirmed') {
      const { data: c } = await supabase.from('coach_classes').select('title').eq('id', enr.class_id).maybeSingle();
      M.mailStudent(enr.student_id, `Đã được nhận vào lớp "${c?.title || ''}"`, `Huấn luyện viên ${req.coach.display_name} đã nhận bạn vào lớp "${c?.title || ''}". Xem lịch và báo nghỉ trong mục Lớp học của tôi.`);
    }
    // A removed confirmed student frees a seat for the waiting list.
    if (enr.status === 'confirmed' && out.status !== 'confirmed') {
      const { data: cls } = await supabase.from('coach_classes').select('*').eq('id', enr.class_id).maybeSingle();
      if (cls) await ST.promoteWaitlist(cls);
    }
    res.json(out);
  } catch (err) {
    send(res, err);
  }
});

// ---- Purchases and fees (C4) ---------------------------------------------------------
router.use(['/students/:id/purchases', '/purchases', '/fees', '/sessions/:id/people', '/sessions/:id/attendance', '/sessions/:id/scan', '/sessions/:id/finish'], async (req, res, next) => {
  if (await AT.ready()) return next();
  return res.status(503).json({ error: 'Coach Manager needs a database update.', code: 'migration_missing', migration: AT.MIGRATION });
});
router.post('/students/:id/purchases', async (req, res) => {
  try {
    const st = await ownStudent(req);
    if (!st) return notFound(res, 'Student');
    let p = await AT.addPurchase(req.coach, st, req.body);
    // Paid at once → the income goes into the coach's book (C5).
    if (p.paid_at && (await M.ready())) p = await M.confirm(req.coach, { ...p, paid_at: null });
    res.status(201).json(p);
  } catch (err) {
    send(res, err);
  }
});
async function ownPurchase(req) {
  if (!isUuid(req.params.id)) return null;
  const { data } = await supabase.from('coach_package_purchases').select('*').eq('id', req.params.id).eq('coach_id', req.coach.id).maybeSingle();
  return data || null;
}
router.patch('/purchases/:id', async (req, res) => {
  try {
    const p = await ownPurchase(req);
    if (!p) return notFound(res, 'Purchase');
    const { paid, ...rest } = req.body || {};
    let out = p;
    if (Object.keys(rest).length) {
      const { data, error } = await supabase.from('coach_package_purchases').update(AT.cleanPurchase(rest)).eq('id', p.id).select('*').single();
      if (error) return dbError(res, error);
      out = data;
    }
    if (paid !== undefined) {
      if (await M.ready()) out = paid ? await M.confirm(req.coach, out) : await M.unpay(req.coach, out);
      else {
        const { data } = await supabase.from('coach_package_purchases').update(AT.cleanPurchase({ paid })).eq('id', p.id).select('*').single();
        out = data;
      }
    }
    res.json(out);
  } catch (err) {
    send(res, err);
  }
});
router.delete('/purchases/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Purchase');
    const { data: p } = await supabase.from('coach_package_purchases').select('id, sessions_used').eq('id', req.params.id).eq('coach_id', req.coach.id).maybeSingle();
    if (!p) return notFound(res, 'Purchase');
    if (p.sessions_used > 0) return res.status(409).json({ error: 'Sessions were already taken from this package; cancel it instead.', code: 'purchase_used' });
    if (await M.ready()) {
      const { data: full } = await supabase.from('coach_package_purchases').select('ledger_id').eq('id', p.id).maybeSingle();
      await M.voidEntry(req.coach.id, full?.ledger_id);
    }
    const { error } = await supabase.from('coach_package_purchases').delete().eq('id', p.id);
    if (error) return dbError(res, error);
    res.json({ deleted: true });
  } catch (err) {
    send(res, err);
  }
});
router.get('/fees', async (req, res) => {
  try {
    const status = ['unpaid', 'paid', 'free'].includes(req.query.status) ? req.query.status : 'unpaid';
    const { data, error } = await supabase.from('coach_session_fees').select('*, coach_students(id, full_name, phone, user_id), coach_sessions(id, session_date, start_time, class_id, coach_classes(title))').eq('coach_id', req.coach.id).eq('status', status).order('created_at', { ascending: false }).limit(500);
    if (error) return dbError(res, error);
    res.json((data || []).map(({ coach_students: st, coach_sessions: ss, ...f }) => ({ ...f, student: st, session: ss && { id: ss.id, session_date: ss.session_date, start_time: ss.start_time, class_id: ss.class_id, class_title: ss.coach_classes?.title } })));
  } catch (err) {
    send(res, err);
  }
});
router.patch('/fees/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Fee');
    const status = req.body?.status;
    if (!['unpaid', 'paid', 'free'].includes(status)) return send(res, S_fail('Unknown status.', 'bad_status'));
    if (await M.ready()) {
      const { data: fee } = await supabase.from('coach_session_fees').select('*').eq('id', req.params.id).eq('coach_id', req.coach.id).maybeSingle();
      if (!fee) return notFound(res, 'Fee');
      return res.json(await M.setFee(req.coach, fee, status));
    }
    const { data, error } = await supabase.from('coach_session_fees').update({ status, paid_at: status === 'paid' ? new Date().toISOString() : null }).eq('id', req.params.id).eq('coach_id', req.coach.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return notFound(res, 'Fee');
    res.json(data);
  } catch (err) {
    send(res, err);
  }
});

// ---- Money (C5) --------------------------------------------------------------------------
router.use(['/bank', '/money', '/ledger', '/purchases/:id/proof', '/purchases/:id/reject', '/purchases/:id/refund'], async (req, res, next) => {
  if (await M.ready()) return next();
  return res.status(503).json({ error: 'Coach Manager needs a database update.', code: 'migration_missing', migration: M.MIGRATION });
});
router.get('/bank', async (req, res) => {
  try {
    res.json(await M.bankOf(req.coach));
  } catch (err) {
    send(res, err);
  }
});
router.patch('/bank', async (req, res) => {
  try {
    res.json(await M.setBank(req.coach, req.body));
  } catch (err) {
    send(res, err);
  }
});
// Orders waiting for the coach (students' purchases not confirmed yet), newest first.
router.get('/money', async (req, res) => {
  try {
    const { data, error } = await supabase.from('coach_package_purchases').select('*, coach_students(id, full_name, phone, user_id)').eq('coach_id', req.coach.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(300);
    if (error) return dbError(res, error);
    const { data: fees } = await supabase.from('coach_session_fees').select('*, coach_students(id, full_name, phone), coach_sessions(id, session_date, start_time, coach_classes(title))').eq('coach_id', req.coach.id).eq('status', 'unpaid').order('created_at', { ascending: false }).limit(500);
    res.json({
      pending: (data || []).map(({ coach_students: st, payment_proof, ...p }) => ({ ...p, has_proof: !!payment_proof, student: st })),
      fees: (fees || []).map(({ coach_students: st, coach_sessions: ss, ...f }) => ({ ...f, student: st, session: ss && { id: ss.id, session_date: ss.session_date, start_time: ss.start_time, class_title: ss.coach_classes?.title } })),
    });
  } catch (err) {
    send(res, err);
  }
});
router.get('/purchases/:id/proof', async (req, res) => {
  try {
    const p = await ownPurchase(req);
    if (!p) return notFound(res, 'Purchase');
    if (!p.payment_proof) return res.status(404).json({ error: p.proof_purged_at ? 'The screenshot was deleted after the retention period.' : 'No screenshot.', code: p.proof_purged_at ? 'proof_purged' : 'not_found' });
    res.json({ image: p.payment_proof, submitted_at: p.proof_submitted_at, ref: p.payment_ref });
  } catch (err) {
    send(res, err);
  }
});
router.post('/purchases/:id/reject', async (req, res) => {
  try {
    const p = await ownPurchase(req);
    if (!p) return notFound(res, 'Purchase');
    res.json(await M.reject(req.coach, p, req.body?.note));
  } catch (err) {
    send(res, err);
  }
});
router.post('/purchases/:id/refund', async (req, res) => {
  try {
    const p = await ownPurchase(req);
    if (!p) return notFound(res, 'Purchase');
    res.json(await M.refund(req.coach, p, req.body || {}));
  } catch (err) {
    send(res, err);
  }
});
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
router.get('/ledger', async (req, res) => {
  try {
    const from = YMD_RE.test(req.query.from || '') ? req.query.from : null;
    const to = YMD_RE.test(req.query.to || '') ? req.query.to : null;
    res.json(await M.ledger(req.coach, { from, to }));
  } catch (err) {
    send(res, err);
  }
});
router.post('/ledger', async (req, res) => {
  try {
    const row = { ...M.cleanEntry(req.body), coach_id: req.coach.id };
    const { data, error } = await supabase.from('coach_ledger').insert(row).select('*').single();
    if (error) return dbError(res, error);
    res.status(201).json(data);
  } catch (err) {
    send(res, err);
  }
});
router.patch('/ledger/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Entry');
    const patch = {};
    if (typeof req.body?.excluded === 'boolean') patch.excluded = req.body.excluded;
    if ('note' in (req.body || {})) patch.note = req.body.note == null ? null : String(req.body.note).trim().slice(0, 300) || null;
    if (YMD_RE.test(req.body?.occurred_on || '')) patch.occurred_on = req.body.occurred_on;
    const { data, error } = await supabase.from('coach_ledger').update(patch).eq('id', req.params.id).eq('coach_id', req.coach.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return notFound(res, 'Entry');
    res.json(data);
  } catch (err) {
    send(res, err);
  }
});
// Void a typed-in entry. Entries the app wrote (package paid, fee paid, refund) follow their
// source: change the package / fee instead, or tick "không tính".
router.post('/ledger/:id/void', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Entry');
    const { data: e } = await supabase.from('coach_ledger').select('*').eq('id', req.params.id).eq('coach_id', req.coach.id).maybeSingle();
    if (!e) return notFound(res, 'Entry');
    if (e.auto) return res.status(409).json({ error: 'This entry follows its package / fee; change it there or tick "không tính".', code: 'auto_entry' });
    await M.voidEntry(req.coach.id, e.id);
    res.json({ voided: true });
  } catch (err) {
    send(res, err);
  }
});

// ---- C7: notes, open hours / 1-1 bookings, reviews; C8: assistants, stats -------------
router.use(['/notes', '/students/:id/notes', '/slots', '/bookings', '/reviews', '/assistants', '/stats'], async (req, res, next) => {
  if (await X.ready()) return next();
  return res.status(503).json({ error: 'Coach Manager needs a database update.', code: 'migration_missing', migration: X.MIGRATION });
});
router.get('/students/:id/notes', async (req, res) => {
  try {
    const st = await ownStudent(req);
    if (!st) return notFound(res, 'Student');
    res.json(await X.notesFor(req.coach.id, st.id));
  } catch (err) {
    send(res, err);
  }
});
router.post('/students/:id/notes', async (req, res) => {
  try {
    const st = await ownStudent(req);
    if (!st) return notFound(res, 'Student');
    const row = { ...X.cleanNote(req.body), coach_id: req.coach.id, student_id: st.id };
    if (isUuid(req.body?.session_id)) {
      const { data: s } = await supabase.from('coach_sessions').select('id').eq('id', req.body.session_id).eq('coach_id', req.coach.id).maybeSingle();
      if (s) row.session_id = s.id;
    }
    const { data, error } = await supabase.from('coach_notes').insert(row).select('*').single();
    if (error) return dbError(res, error);
    res.status(201).json(data);
  } catch (err) {
    send(res, err);
  }
});
router.patch('/notes/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Note');
    const patch = {};
    if (typeof req.body?.shared === 'boolean') patch.shared = req.body.shared;
    if ('body' in (req.body || {})) Object.assign(patch, { body: X.cleanNote({ body: req.body.body }).body });
    const { data, error } = await supabase.from('coach_notes').update(patch).eq('id', req.params.id).eq('coach_id', req.coach.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return notFound(res, 'Note');
    res.json(data);
  } catch (err) {
    send(res, err);
  }
});
router.delete('/notes/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Note');
    const { error } = await supabase.from('coach_notes').delete().eq('id', req.params.id).eq('coach_id', req.coach.id);
    if (error) return dbError(res, error);
    res.json({ deleted: true });
  } catch (err) {
    send(res, err);
  }
});
router.get('/slots', async (req, res) => {
  try {
    const { data, error } = await supabase.from('coach_slots').select('*').eq('coach_id', req.coach.id).order('weekday').order('start_time');
    if (error) return dbError(res, error);
    res.json({ slots: data || [], free: await X.openTimes(req.coach, 14) });
  } catch (err) {
    send(res, err);
  }
});
router.post('/slots', async (req, res) => {
  try {
    const { data, error } = await supabase.from('coach_slots').insert({ ...X.cleanSlot(req.body, { creating: true }), coach_id: req.coach.id }).select('*').single();
    if (error) return dbError(res, error);
    res.status(201).json(data);
  } catch (err) {
    send(res, err);
  }
});
router.patch('/slots/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Slot');
    const { data, error } = await supabase.from('coach_slots').update(X.cleanSlot(req.body)).eq('id', req.params.id).eq('coach_id', req.coach.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return notFound(res, 'Slot');
    res.json(data);
  } catch (err) {
    send(res, err);
  }
});
router.delete('/slots/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Slot');
    const { error } = await supabase.from('coach_slots').delete().eq('id', req.params.id).eq('coach_id', req.coach.id);
    if (error) return dbError(res, error);
    res.json({ deleted: true });
  } catch (err) {
    send(res, err);
  }
});
router.get('/bookings', async (req, res) => {
  try {
    const status = ['requested', 'accepted', 'declined', 'cancelled'].includes(req.query.status) ? req.query.status : null;
    let q = supabase.from('coach_bookings').select('*, coach_students(id, full_name, phone, user_id)').eq('coach_id', req.coach.id).order('session_date').order('start_time').limit(500);
    if (status) q = q.eq('status', status);
    else q = q.gte('session_date', todayYmd());
    const { data, error } = await q;
    if (error) return dbError(res, error);
    res.json((data || []).map(({ coach_students: st, ...b }) => ({ ...b, student: st })));
  } catch (err) {
    send(res, err);
  }
});
router.post('/bookings/:id/:action(accept|decline)', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Booking');
    const { data: bk } = await supabase.from('coach_bookings').select('*').eq('id', req.params.id).eq('coach_id', req.coach.id).maybeSingle();
    if (!bk) return notFound(res, 'Booking');
    const out = req.params.action === 'accept' ? await X.acceptBooking(req.coach, bk) : await X.declineBooking(req.coach, bk, req.body?.note);
    const when = `${String(bk.session_date).split('-').reverse().join('/')} ${String(bk.start_time).slice(0, 5)}`;
    M.mailStudent(bk.student_id, req.params.action === 'accept' ? `Đã nhận buổi kèm 1-1 lúc ${when}` : `Huấn luyện viên chưa nhận được buổi ${when}`, req.params.action === 'accept' ? `Huấn luyện viên ${req.coach.display_name} đã nhận buổi kèm 1-1 lúc ${when}. Xem trong mục Lớp học của tôi.` : `Huấn luyện viên ${req.coach.display_name} chưa nhận được buổi kèm 1-1 lúc ${when}${out.decline_note ? `: ${out.decline_note}` : ''}. Bạn có thể chọn giờ khác.`);
    res.json(out);
  } catch (err) {
    send(res, err);
  }
});
router.get('/reviews', async (req, res) => {
  try {
    const { data, error } = await supabase.from('coach_reviews').select('id, stars, body, hidden, created_at, coach_students(full_name)').eq('coach_id', req.coach.id).order('created_at', { ascending: false }).limit(200);
    if (error) return dbError(res, error);
    const rows = (data || []).map(({ coach_students: s, ...r }) => ({ ...r, name: s?.full_name || '' }));
    const shown = rows.filter((r) => !r.hidden);
    res.json({ rows, rating: shown.length ? Math.round((shown.reduce((a, r) => a + r.stars, 0) / shown.length) * 10) / 10 : null, count: shown.length });
  } catch (err) {
    send(res, err);
  }
});
router.get('/assistants', async (req, res) => {
  try {
    const { data, error } = await supabase.from('coach_assistants').select('id, email, user_id, status, created_at').eq('coach_id', req.coach.id).eq('status', 'active').order('created_at');
    if (error) return dbError(res, error);
    res.json(data || []);
  } catch (err) {
    send(res, err);
  }
});
router.post('/assistants', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return send(res, S_fail('Enter a valid email.', 'bad_email'));
    if (email === String(req.hostEmail || '').toLowerCase()) return send(res, S_fail('That is your own email.', 'self'));
    const { data: n } = await supabase.from('coach_assistants').select('id').eq('coach_id', req.coach.id).eq('status', 'active');
    if ((n || []).length >= 10) return send(res, S_fail('Up to 10 assistants.', 'too_many'));
    const { data: u } = await supabase.from('users').select('id').ilike('email', email).maybeSingle();
    const { data, error } = await supabase.from('coach_assistants').insert({ coach_id: req.coach.id, email, user_id: u?.id || null }).select('id, email, user_id, status, created_at').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Already an assistant.', code: 'exists' });
      return dbError(res, error);
    }
    res.status(201).json(data);
  } catch (err) {
    send(res, err);
  }
});
router.delete('/assistants/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Assistant');
    const { error } = await supabase.from('coach_assistants').update({ status: 'removed' }).eq('id', req.params.id).eq('coach_id', req.coach.id);
    if (error) return dbError(res, error);
    res.json({ removed: true });
  } catch (err) {
    send(res, err);
  }
});
router.get('/stats', async (req, res) => {
  try {
    res.json(await X.stats(req.coach, Math.min(12, Math.max(3, Number(req.query.months) || 6))));
  } catch (err) {
    send(res, err);
  }
});

// ---- Attendance (C4) -------------------------------------------------------------------
async function ownSession(req) {
  if (!isUuid(req.params.id)) return null;
  const { data, error } = await supabase.from('coach_sessions').select('*, coach_classes(*)').eq('id', req.params.id).eq('coach_id', req.coach.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { coach_classes: cls, ...s } = data;
  return { s, cls };
}
router.get('/sessions/:id/people', async (req, res) => {
  try {
    const x = await ownSession(req);
    if (!x) return notFound(res, 'Session');
    res.json({ deduct_mode: AT.deductMode(req.coach, x.cls), rows: await AT.people(req.coach, x.cls, x.s) });
  } catch (err) {
    send(res, err);
  }
});
// One mark: { student_id, status } (status null = clear).
router.post('/sessions/:id/attendance', async (req, res) => {
  try {
    const x = await ownSession(req);
    if (!x) return notFound(res, 'Session');
    if (!isUuid(req.body?.student_id)) return notFound(res, 'Student');
    const { data: st } = await supabase.from('coach_students').select('id').eq('id', req.body.student_id).eq('coach_id', req.coach.id).maybeSingle();
    if (!st) return notFound(res, 'Student');
    if (req.body.status === null) {
      await AT.unmark(x.s, st.id);
      return res.json({ cleared: true });
    }
    res.json(await AT.mark(req.coach, x.cls, x.s, st.id, req.body.status, { note: req.body.note }));
  } catch (err) {
    send(res, err);
  }
});
// Scan the player's own QR (the code from their activity page): present at once.
router.post('/sessions/:id/scan', async (req, res) => {
  try {
    const x = await ownSession(req);
    if (!x) return notFound(res, 'Session');
    const m = String(req.body?.code || '').trim().match(/^(?:PBP:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (!m) return res.status(400).json({ error: 'This is not a player QR code.', code: 'bad_code' });
    const { data: prof } = await supabase.from('player_profiles').select('user_id, full_name').eq('checkin_token', m[1].toLowerCase()).maybeSingle();
    if (!prof) return res.status(404).json({ error: 'Unknown or expired QR code.', code: 'unknown_code' });
    const { data: st } = await supabase.from('coach_students').select('*').eq('coach_id', req.coach.id).eq('user_id', prof.user_id).maybeSingle();
    if (!st) return res.status(404).json({ error: `${prof.full_name || 'This player'} is not your student.`, code: 'not_student' });
    const { data: enr } = await supabase.from('coach_enrollments').select('id, status').eq('class_id', x.cls.id).eq('student_id', st.id).in('status', ST.LIVE).maybeSingle();
    if (!enr || enr.status !== 'confirmed') return res.status(409).json({ error: `${st.full_name} is not confirmed in this class.`, code: 'not_confirmed', full_name: st.full_name });
    const { data: prior } = await supabase.from('coach_attendance').select('status').eq('session_id', x.s.id).eq('student_id', st.id).maybeSingle();
    if (prior?.status === 'present') return res.json({ already: true, full_name: st.full_name });
    const att = await AT.mark(req.coach, x.cls, x.s, st.id, 'present');
    const bal = (await AT.balances([st.id]))[st.id];
    res.json({ already: false, full_name: st.full_name, attendance: att, balance: bal });
  } catch (err) {
    send(res, err);
  }
});
router.post('/sessions/:id/finish', async (req, res) => {
  try {
    const x = await ownSession(req);
    if (!x) return notFound(res, 'Session');
    res.json(await AT.finish(req.coach, x.cls, x.s));
  } catch (err) {
    send(res, err);
  }
});

// ---- Sessions ---------------------------------------------------------------------------
router.get('/sessions', async (req, res) => {
  try {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : todayYmd();
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : S.addDays(from, 6);
    res.json(await S.listSessions(req.coach.id, { from, to }));
  } catch (err) {
    send(res, err);
  }
});
router.get('/sessions/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Session');
    const { data, error } = await supabase.from('coach_sessions').select('*, coach_classes(*)').eq('id', req.params.id).eq('coach_id', req.coach.id).maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return notFound(res, 'Session');
    const { coach_classes: cls, ...s } = data;
    res.json({ ...s, class: cls });
  } catch (err) {
    send(res, err);
  }
});
router.patch('/sessions/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Session');
    const fields = S.cleanSession(req.body);
    const { data, error } = await supabase.from('coach_sessions').update(fields).eq('id', req.params.id).eq('coach_id', req.coach.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return notFound(res, 'Session');
    res.json(data);
  } catch (err) {
    send(res, err);
  }
});
router.delete('/sessions/:id', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Session');
    const { error } = await supabase.from('coach_sessions').delete().eq('id', req.params.id).eq('coach_id', req.coach.id);
    if (error) return dbError(res, error);
    res.json({ deleted: true });
  } catch (err) {
    send(res, err);
  }
});

// ---- Public -----------------------------------------------------------------------------
// Is Coach Manager on for everyone? (The web shows the Coach tab in Tìm only then, or for
// beta testers.) 'enabled' is a reserved slug, so it never clashes with a coach page.
publicRoutes.get('/enabled', async (req, res) => {
  try {
    res.json({ enabled: !!(await require('../services/appSettings').get('coach_enabled')) });
  } catch {
    res.json({ enabled: false });
  }
});
// Find a coach (/discover → Coach): public, active profiles only.
publicRoutes.get('/', async (req, res) => {
  try {
    // Before the product is switched on for everyone, nobody finds coaches here (beta
    // testers search through /api/player/coach/search).
    if (!(await C.ready()) || !(await require('../services/appSettings').get('coach_enabled'))) return res.json([]);
    if (!(await X.ready())) {
      const { data } = await supabase.from('coach_profiles').select('id, slug, display_name, sport, area, court_name, level_text, price_note').eq('status', 'active').eq('public', true).limit(200);
      return res.json((data || []).map((c) => ({ ...c, rating: null, reviews: 0, open_classes: 0, one_on_one: false })));
    }
    res.json(await X.search({ sport: req.query.sport, q: String(req.query.q || '').slice(0, 80), area: String(req.query.area || '').slice(0, 80) }));
  } catch (err) {
    send(res, err);
  }
});
// Free 1-1 times of a coach (the next 3 weeks).
publicRoutes.get('/:slug/times', async (req, res) => {
  try {
    const c = await C.profileBySlug(req.params.slug);
    if (!c || c.status !== 'active' || !(await X.ready())) return res.json([]);
    res.json(await X.openTimes(c));
  } catch (err) {
    send(res, err);
  }
});
publicRoutes.get('/:slug', async (req, res) => {
  try {
    const c = await C.profileBySlug(req.params.slug);
    if (!c || c.status === 'blocked') return res.status(404).json({ error: 'Coach not found.', code: 'not_found' });
    const view = C.publicView(c);
    await require('../services/playerAvatars').attach([view]);
    if (view.avatar_v) view.avatar_uid = c.user_id;
    delete view.user_id;
    view.classes = [];
    view.packages = [];
    if (await S.ready()) {
      const today = todayYmd();
      const [{ data: classes }, sessions, packages] = await Promise.all([
        supabase.from('coach_classes').select('id, title, kind, court_name, map_url, start_time, duration_min, weekdays, date_from, date_to, capacity, fee, note, status').eq('coach_id', c.id).eq('status', 'open').order('created_at'),
        S.listSessions(c.id, { from: today, to: S.addDays(today, 60) }),
        S.listPackages(c.id),
      ]);
      const byClass = new Map();
      for (const x of sessions) if (x.status === 'scheduled') (byClass.get(x.class_id) || byClass.set(x.class_id, []).get(x.class_id)).push({ id: x.id, session_date: x.session_date, start_time: x.start_time, duration_min: x.duration_min, court_name: x.court_name });
      view.classes = (classes || []).map((k) => ({ ...k, next_sessions: (byClass.get(k.id) || []).slice(0, 4) }));
      view.packages = packages.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, sessions: p.sessions, price: p.price, valid_months: p.valid_months, note: p.note }));
    }
    view.rating = null;
    view.reviews = [];
    view.reviews_count = 0;
    view.one_on_one = false;
    if (await X.ready()) {
      const [r, list, { count: slots }] = await Promise.all([
        X.ratingOf([c.id]),
        X.publicReviews(c.id),
        supabase.from('coach_slots').select('id', { count: 'exact', head: true }).eq('coach_id', c.id).eq('active', true),
      ]);
      const x = r.get(c.id);
      view.rating = x?.rating ?? null;
      view.reviews_count = x?.reviews || 0;
      view.reviews = list;
      view.one_on_one = (slots || 0) > 0;
    }
    res.json(view);
  } catch (err) {
    send(res, err);
  }
});

// Quick sign-up without an account: name + phone + the class. The answer carries the
// sign-up's own link (/coach/r/<token>) to see its status later.
publicRoutes.post('/:slug/quick', requireCaptcha, async (req, res) => {
  try {
    const c = await C.profileBySlug(req.params.slug);
    if (!c || c.status !== 'active') return res.status(404).json({ error: 'Coach not found.', code: 'not_found' });
    if (!(await S.ready()) || !(await ST.ready())) return res.status(503).json({ error: 'Not available yet.', code: 'migration_missing' });
    if (!isUuid(req.body?.class_id)) return res.status(400).json({ error: 'class_id is required.', code: 'bad_class' });
    const { data: cls } = await supabase.from('coach_classes').select('*').eq('id', req.body.class_id).eq('coach_id', c.id).maybeSingle();
    if (!cls) return notFound(res, 'Class');
    const student = await ST.studentForQuick(c, { full_name: req.body.full_name, phone: req.body.phone });
    const enr = await ST.enroll(c, cls, student, { pay_mode: req.body.pay_mode || 'package', source: 'quick', note: req.body.note });
    if (!enr.already) M.mailCoach(c, `Đăng ký mới — ${cls.title}`, `${student.full_name} vừa đăng ký lớp "${cls.title}" (${enr.status === 'waitlist' ? 'danh sách chờ' : 'chờ bạn xác nhận'}).`, '/coach/students?tab=pending');
    res.status(enr.already ? 200 : 201).json({ token: enr.token, status: enr.status, already: !!enr.already, linked_account: !!student.user_id });
  } catch (err) {
    send(res, err);
  }
});
// The quick sign-up's status page (by its secret link): class, coach, status, cancel.
async function byToken(token) {
  if (!isUuid(token) || !(await ST.ready())) return null;
  const { data } = await supabase.from('coach_enrollments').select('*, coach_students(*), coach_classes(*), coach_profiles(id, user_id, slug, display_name, sport, status, cancel_hours, deduct_mode)').eq('token', token).maybeSingle();
  if (!data) return null;
  const { coach_students: st, coach_classes: cls, coach_profiles: coach, ...e } = data;
  return { e, st, cls, coach };
}
async function enrollmentView(x) {
  const next = x.cls ? (await S.listSessions(x.cls.coach_id, { classId: x.cls.id, from: todayYmd(), to: S.addDays(todayYmd(), 60) })).filter((s) => s.status === 'scheduled').slice(0, 6) : [];
  let balance = null;
  let mine = new Map();
  let tally = null;
  if (await AT.ready()) {
    const [bal, hist] = await Promise.all([AT.balances([x.st.id]), AT.history(x.st.id, 60)]);
    balance = bal[x.st.id];
    tally = AT.tally(hist.filter((h) => h.session?.class_id === x.cls?.id));
    for (const h of hist) if (h.session) mine.set(h.session.id, { status: h.status, late: h.late, by_student: h.by_student });
  }
  const deadlineOk = (s) => Date.now() < AT.excuseDeadlineMs(s, x.coach);
  return {
    balance,
    tally,
    id: x.e.id,
    status: x.e.status,
    pay_mode: x.e.pay_mode,
    created_at: x.e.created_at,
    student: { full_name: x.st.full_name, linked_account: !!x.st.user_id },
    class: x.cls && { id: x.cls.id, title: x.cls.title, kind: x.cls.kind, start_time: x.cls.start_time, duration_min: x.cls.duration_min, weekdays: x.cls.weekdays, date_from: x.cls.date_from, date_to: x.cls.date_to, court_name: x.cls.court_name, map_url: x.cls.map_url, capacity: x.cls.capacity, fee: x.cls.fee, status: x.cls.status },
    coach: x.coach && { slug: x.coach.slug, display_name: x.coach.display_name, sport: x.coach.sport, cancel_hours: x.coach.cancel_hours },
    next_sessions: next.map((s) => ({ id: s.id, session_date: s.session_date, start_time: s.start_time, duration_min: s.duration_min, court_name: s.court_name, mine: mine.get(s.id) || null, can_excuse: deadlineOk(s), started: AT.startMs(s) < Date.now() })),
  };
}
// A student's packages with one coach, for the student (pending ones carry the transfer).
async function studentPurchases(coach, studentId) {
  if (!(await M.ready())) return [];
  const { data } = await supabase.from('coach_package_purchases').select('*').eq('student_id', studentId).in('status', ['pending', 'active', 'refunded', 'expired']).order('created_at', { ascending: false }).limit(20);
  const out = [];
  for (const p of data || []) out.push({ ...M.purchaseView(p), payment: p.status === 'pending' ? await M.paymentFor(coach, p) : null });
  return out;
}
async function coachPackages(coachId) {
  const { data } = await supabase.from('coach_packages').select('id, name, sessions, price, valid_months, note, active').eq('coach_id', coachId).eq('active', true).order('sort').order('price');
  return data || [];
}

// The student says "I can't come" (or takes it back) for one upcoming session.
async function excuseFor(x, sessionId, undo) {
  if (!isUuid(sessionId)) throw C.fail('Session not found.', 404, 'not_found');
  if (x.e.status !== 'confirmed') throw C.fail('Only a confirmed sign-up can report an absence.', 409, 'not_confirmed');
  if (!(await AT.ready())) throw Object.assign(C.fail('Coach Manager needs a database update.', 503, 'migration_missing'), { migration: AT.MIGRATION });
  const { data: s } = await supabase.from('coach_sessions').select('*').eq('id', sessionId).eq('class_id', x.cls.id).maybeSingle();
  if (!s) throw C.fail('Session not found.', 404, 'not_found');
  return AT.excuse(x.coach, x.cls, s, x.st.id, !!undo);
}
publicRoutes.get('/r/:token', async (req, res) => {
  try {
    const x = await byToken(req.params.token);
    if (!x) return res.status(404).json({ error: 'Sign-up not found.', code: 'not_found' });
    res.json(await enrollmentView(x));
  } catch (err) {
    send(res, err);
  }
});
publicRoutes.post('/r/:token/sessions/:sid/excuse', async (req, res) => {
  try {
    const x = await byToken(req.params.token);
    if (!x) return res.status(404).json({ error: 'Sign-up not found.', code: 'not_found' });
    await excuseFor(x, req.params.sid, req.body?.undo);
    res.json(await enrollmentView(x));
  } catch (err) {
    send(res, err);
  }
});
// Packages on the quick sign-up's page: what the coach sells, what this student bought.
publicRoutes.get('/r/:token/packages', async (req, res) => {
  try {
    const x = await byToken(req.params.token);
    if (!x) return res.status(404).json({ error: 'Sign-up not found.', code: 'not_found' });
    res.json({ for_sale: await coachPackages(x.coach.id), mine: await studentPurchases(x.coach, x.st.id) });
  } catch (err) {
    send(res, err);
  }
});
publicRoutes.post('/r/:token/packages/:pid/buy', async (req, res) => {
  try {
    const x = await byToken(req.params.token);
    if (!x) return res.status(404).json({ error: 'Sign-up not found.', code: 'not_found' });
    if (!(await M.ready()) || !isUuid(req.params.pid)) return res.status(404).json({ error: 'Not available.', code: 'not_found' });
    await M.buy(x.coach, x.st, req.params.pid);
    res.status(201).json({ for_sale: await coachPackages(x.coach.id), mine: await studentPurchases(x.coach, x.st.id) });
  } catch (err) {
    send(res, err);
  }
});
publicRoutes.post('/r/:token/purchases/:id/proof', async (req, res) => {
  try {
    const x = await byToken(req.params.token);
    if (!x || !isUuid(req.params.id) || !(await M.ready())) return res.status(404).json({ error: 'Not found.', code: 'not_found' });
    const { data: p } = await supabase.from('coach_package_purchases').select('*').eq('id', req.params.id).eq('coach_id', x.coach.id).maybeSingle();
    if (!p) return notFound(res, 'Purchase');
    await M.submitProof(x.coach, x.st, p, req.body?.image);
    res.json({ for_sale: await coachPackages(x.coach.id), mine: await studentPurchases(x.coach, x.st.id) });
  } catch (err) {
    send(res, err);
  }
});
publicRoutes.post('/r/:token/cancel', async (req, res) => {
  try {
    const x = await byToken(req.params.token);
    if (!x) return res.status(404).json({ error: 'Sign-up not found.', code: 'not_found' });
    await ST.cancelByStudent(x.e, x.cls, x.coach);
    res.json(await enrollmentView({ ...x, e: { ...x.e, status: 'cancelled' } }));
  } catch (err) {
    send(res, err);
  }
});

// ---- The student's side (signed in) ----------------------------------------------------
const studentRoutes = express.Router();
studentRoutes.use(async (req, res, next) => {
  if (await ST.ready()) return next();
  return res.status(503).json({ error: 'Coach Manager needs a database update.', code: 'migration_missing', migration: ST.MIGRATION });
});
// My classes: every live (and recently ended) enrolment with its coach and next sessions.
studentRoutes.get('/', async (req, res) => {
  try {
    const { data: students } = await supabase.from('coach_students').select('id, coach_id').eq('user_id', req.userId);
    const ids = (students || []).map((s) => s.id);
    if (!ids.length) return res.json([]);
    const { data, error } = await supabase.from('coach_enrollments').select('*, coach_students(*), coach_classes(*), coach_profiles(slug, display_name, sport, status, cancel_hours)').in('student_id', ids).order('created_at', { ascending: false }).limit(100);
    if (error) return dbError(res, error);
    const out = [];
    for (const row of data || []) {
      const { coach_students: st, coach_classes: cls, coach_profiles: coach, ...e } = row;
      if (['cancelled', 'removed'].includes(e.status) && e.created_at < new Date(Date.now() - 30 * 86400000).toISOString()) continue;
      out.push(await enrollmentView({ e, st, cls, coach }));
    }
    res.json(out);
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.post('/classes/:id/enroll', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Class');
    const { data: cls } = await supabase.from('coach_classes').select('*, coach_profiles(*)').eq('id', req.params.id).maybeSingle();
    if (!cls || cls.coach_profiles?.status !== 'active') return notFound(res, 'Class');
    const { coach_profiles: coach, ...klass } = cls;
    const student = await ST.studentForUser(coach, req.userId, {});
    const enr = await ST.enroll(coach, klass, student, { pay_mode: req.body?.pay_mode || 'package', source: 'account', note: req.body?.note });
    if (!enr.already) M.mailCoach(coach, `Đăng ký mới — ${klass.title}`, `${student.full_name} vừa đăng ký lớp "${klass.title}" (${enr.status === 'waitlist' ? 'danh sách chờ' : 'chờ bạn xác nhận'}).`, '/coach/students?tab=pending');
    res.status(enr.already ? 200 : 201).json(await enrollmentView({ e: enr, st: student, cls: klass, coach }));
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.post('/enrollments/:id/sessions/:sid/excuse', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Enrollment');
    const { data } = await supabase.from('coach_enrollments').select('*, coach_students(*), coach_classes(*), coach_profiles(id, slug, display_name, sport, status, cancel_hours, deduct_mode)').eq('id', req.params.id).maybeSingle();
    if (!data || data.coach_students?.user_id !== req.userId) return notFound(res, 'Enrollment');
    const { coach_students: st, coach_classes: cls, coach_profiles: coach, ...e } = data;
    await excuseFor({ e, st, cls, coach }, req.params.sid, req.body?.undo);
    res.json(await enrollmentView({ e, st, cls, coach }));
  } catch (err) {
    send(res, err);
  }
});
// My packages with every coach I learn with (pending ones carry the transfer).
studentRoutes.get('/purchases', async (req, res) => {
  try {
    const { data: students } = await supabase.from('coach_students').select('id, coach_id, coach_profiles(id, user_id, slug, display_name, status)').eq('user_id', req.userId);
    const out = [];
    for (const st of students || []) {
      const coach = st.coach_profiles;
      if (!coach) continue;
      out.push({ coach: { slug: coach.slug, display_name: coach.display_name }, for_sale: await coachPackages(coach.id), mine: await studentPurchases(coach, st.id) });
    }
    res.json(out);
  } catch (err) {
    send(res, err);
  }
});
// Buy a package of a coach (from their public page or my classes).
studentRoutes.post('/coaches/:slug/packages/:pid/buy', async (req, res) => {
  try {
    if (!(await M.ready()) || !isUuid(req.params.pid)) return res.status(503).json({ error: 'Not available yet.', code: 'migration_missing' });
    const coach = await C.profileBySlug(req.params.slug);
    if (!coach || coach.status === 'blocked') return notFound(res, 'Coach');
    const student = await ST.studentForUser(coach, req.userId, {});
    const p = await M.buy(coach, student, req.params.pid);
    res.status(p.already ? 200 : 201).json({ ...M.purchaseView(p), payment: p.status === 'pending' ? await M.paymentFor(coach, p) : null });
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.post('/purchases/:id/proof', async (req, res) => {
  try {
    if (!isUuid(req.params.id) || !(await M.ready())) return notFound(res, 'Purchase');
    const { data: p } = await supabase.from('coach_package_purchases').select('*, coach_students(*), coach_profiles(id, user_id, slug, display_name, status)').eq('id', req.params.id).maybeSingle();
    if (!p || p.coach_students?.user_id !== req.userId) return notFound(res, 'Purchase');
    const { coach_students: st, coach_profiles: coach, ...row } = p;
    const out = await M.submitProof(coach, st, row, req.body?.image);
    res.json({ ...M.purchaseView(out), payment: await M.paymentFor(coach, out) });
  } catch (err) {
    send(res, err);
  }
});
// C7 for the student: notes the coach shared, my review, book a 1-1 time, my bookings,
// report a profile.
async function meWith(req, slug) {
  const coach = await C.profileBySlug(slug);
  if (!coach || coach.status === 'blocked') return null;
  const { data: st } = await supabase.from('coach_students').select('*').eq('coach_id', coach.id).eq('user_id', req.userId).maybeSingle();
  return { coach, st };
}
studentRoutes.get('/search', async (req, res) => {
  try {
    if (!(await C.enabledFor(req)) || !(await X.ready())) return res.json([]);
    res.json(await X.search({ sport: req.query.sport, q: String(req.query.q || '').slice(0, 80), area: String(req.query.area || '').slice(0, 80) }));
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.get('/bookings', async (req, res) => {
  try {
    if (!(await X.ready())) return res.json([]);
    const { data: sts } = await supabase.from('coach_students').select('id').eq('user_id', req.userId);
    const ids = (sts || []).map((x) => x.id);
    if (!ids.length) return res.json([]);
    const { data } = await supabase.from('coach_bookings').select('id, session_date, start_time, duration_min, status, pay_mode, decline_note, note, coach_profiles(slug, display_name)').in('student_id', ids).gte('session_date', todayYmd()).order('session_date').order('start_time').limit(50);
    res.json((data || []).map(({ coach_profiles: c, ...b }) => ({ ...b, coach: c })));
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.get('/notes', async (req, res) => {
  try {
    if (!(await X.ready())) return res.json([]);
    const { data: sts } = await supabase.from('coach_students').select('id, coach_id, coach_profiles(slug, display_name)').eq('user_id', req.userId);
    const out = [];
    for (const st of sts || []) {
      const notes = await X.notesFor(st.coach_id, st.id, { sharedOnly: true });
      for (const n of notes) out.push({ id: n.id, body: n.body, video_url: n.video_url, created_at: n.created_at, session: n.session, coach: st.coach_profiles });
    }
    out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json(out.slice(0, 50));
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.get('/coaches/:slug/me', async (req, res) => {
  try {
    const x = await meWith(req, req.params.slug);
    if (!x) return notFound(res, 'Coach');
    if (!x.st || !(await X.ready())) return res.json({ student: !!x.st, can_review: false, review: null, bookings: [] });
    const [can, { data: review }, { data: bookings }] = await Promise.all([
      X.canReview(x.st.id),
      supabase.from('coach_reviews').select('id, stars, body, hidden, updated_at').eq('coach_id', x.coach.id).eq('student_id', x.st.id).maybeSingle(),
      supabase.from('coach_bookings').select('id, session_date, start_time, duration_min, status, pay_mode, decline_note').eq('coach_id', x.coach.id).eq('student_id', x.st.id).gte('session_date', todayYmd()).order('session_date').limit(20),
    ]);
    res.json({ student: true, can_review: can, review: review || null, bookings: bookings || [] });
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.post('/coaches/:slug/review', async (req, res) => {
  try {
    if (!(await X.ready())) return res.status(503).json({ error: 'Not available yet.', code: 'migration_missing' });
    const x = await meWith(req, req.params.slug);
    if (!x) return notFound(res, 'Coach');
    if (!x.st) return res.status(403).json({ error: 'You can review a coach after your first session with them.', code: 'review_not_allowed' });
    res.json(await X.upsertReview(x.coach, x.st, req.userId, req.body));
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.post('/coaches/:slug/book', async (req, res) => {
  try {
    if (!(await X.ready())) return res.status(503).json({ error: 'Not available yet.', code: 'migration_missing' });
    const coach = await C.profileBySlug(req.params.slug);
    if (!coach || coach.status === 'blocked') return notFound(res, 'Coach');
    const st = await ST.studentForUser(coach, req.userId, {});
    const bk = await X.requestBooking(coach, st, req.body || {});
    const when = `${String(bk.session_date).split('-').reverse().join('/')} ${String(bk.start_time).slice(0, 5)}`;
    M.mailCoach(coach, `Yêu cầu kèm 1-1 — ${st.full_name}`, `${st.full_name} muốn đặt buổi kèm 1-1 lúc ${when}. Mở Coach → Lịch rảnh để nhận hoặc từ chối.`, '/coach/hours');
    res.status(201).json(bk);
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.post('/bookings/:id/cancel', async (req, res) => {
  try {
    if (!isUuid(req.params.id) || !(await X.ready())) return notFound(res, 'Booking');
    const { data: bk } = await supabase.from('coach_bookings').select('*, coach_students(user_id)').eq('id', req.params.id).maybeSingle();
    if (!bk || bk.coach_students?.user_id !== req.userId) return notFound(res, 'Booking');
    const { coach_students: _s, ...row } = bk;
    res.json(await X.cancelBooking(row));
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.post('/coaches/:slug/report', async (req, res) => {
  try {
    if (!(await X.ready())) return res.status(503).json({ error: 'Not available yet.', code: 'migration_missing' });
    const coach = await C.profileBySlug(req.params.slug);
    if (!coach) return notFound(res, 'Coach');
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3 || reason.length > 1000) return res.status(400).json({ error: 'Say what is wrong (3 to 1000 characters).', code: 'bad_reason' });
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await supabase.from('coach_reports').select('id', { count: 'exact', head: true }).eq('user_id', req.userId).gte('created_at', since);
    if ((count || 0) >= 5) return res.status(429).json({ error: 'Too many reports today.', code: 'too_many' });
    const { error } = await supabase.from('coach_reports').insert({ coach_id: coach.id, user_id: req.userId, reason });
    if (error) return dbError(res, error);
    res.status(201).json({ reported: true });
  } catch (err) {
    send(res, err);
  }
});
studentRoutes.post('/enrollments/:id/cancel', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return notFound(res, 'Enrollment');
    const { data } = await supabase.from('coach_enrollments').select('*, coach_students(*), coach_classes(*), coach_profiles(slug, display_name, sport, status, cancel_hours)').eq('id', req.params.id).maybeSingle();
    if (!data || data.coach_students?.user_id !== req.userId) return notFound(res, 'Enrollment');
    const { coach_students: st, coach_classes: cls, coach_profiles: coach, ...e } = data;
    const out = await ST.cancelByStudent(e, cls, coach);
    res.json(await enrollmentView({ e: out, st, cls, coach }));
  } catch (err) {
    send(res, err);
  }
});

// ---- Assistants (C8): take attendance for a coach, no money, no phones -----------------
const assistRoutes = express.Router();
assistRoutes.get('/', async (req, res) => {
  try {
    res.json((await X.assistingFor(req.userId, req.hostEmail)).map((c) => ({ id: c.id, slug: c.slug, display_name: c.display_name, sport: c.sport })));
  } catch (err) {
    send(res, err);
  }
});
assistRoutes.use('/:coachId', async (req, res, next) => {
  try {
    if (!isUuid(req.params.coachId)) return notFound(res, 'Coach');
    const coach = (await X.assistingFor(req.userId, req.hostEmail)).find((c) => c.id === req.params.coachId);
    if (!coach) return res.status(403).json({ error: 'You are not an assistant of this coach.', code: 'not_assistant' });
    req.coach = coach;
    next();
  } catch (err) {
    send(res, err);
  }
});
assistRoutes.get('/:coachId/sessions', async (req, res) => {
  try {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : S.addDays(todayYmd(), -7);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : S.addDays(todayYmd(), 14);
    res.json((await S.listSessions(req.coach.id, { from, to })).map(({ fee, ...s }) => s));
  } catch (err) {
    send(res, err);
  }
});
async function assistSession(req) {
  if (!isUuid(req.params.sid)) return null;
  const { data } = await supabase.from('coach_sessions').select('*, coach_classes(*)').eq('id', req.params.sid).eq('coach_id', req.coach.id).maybeSingle();
  if (!data) return null;
  const { coach_classes: cls, ...s } = data;
  return { s, cls };
}
const noPrivate = (st) => st && { id: st.id, full_name: st.full_name, user_id: st.user_id, level_text: st.level_text, avatar_uid: st.avatar_uid, avatar_v: st.avatar_v };
assistRoutes.get('/:coachId/sessions/:sid', async (req, res) => {
  try {
    const x = await assistSession(req);
    if (!x) return notFound(res, 'Session');
    const rows = await AT.people(req.coach, x.cls, x.s);
    res.json({ session: { ...x.s, class: { id: x.cls.id, title: x.cls.title, court_name: x.cls.court_name } }, coach: { display_name: req.coach.display_name }, rows: rows.map((r) => ({ student: noPrivate(r.student), pay_mode: r.pay_mode, left: r.left, attendance: r.attendance, balance: r.balance ? { remaining: r.balance.remaining, has_package: r.balance.has_package } : null })) });
  } catch (err) {
    send(res, err);
  }
});
assistRoutes.post('/:coachId/sessions/:sid/attendance', async (req, res) => {
  try {
    const x = await assistSession(req);
    if (!x) return notFound(res, 'Session');
    if (!isUuid(req.body?.student_id)) return notFound(res, 'Student');
    const { data: st } = await supabase.from('coach_students').select('id').eq('id', req.body.student_id).eq('coach_id', req.coach.id).maybeSingle();
    if (!st) return notFound(res, 'Student');
    if (req.body.status === null) {
      await AT.unmark(x.s, st.id);
      return res.json({ cleared: true });
    }
    const a = await AT.mark(req.coach, x.cls, x.s, st.id, req.body.status);
    await supabase.from('coach_attendance').update({ by_assistant: req.userId }).eq('id', a.id);
    res.json(a);
  } catch (err) {
    send(res, err);
  }
});

module.exports = { router, publicRoutes, studentRoutes, assistRoutes };
