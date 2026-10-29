// Coach Manager (đợt C1): the coach's own profile and its public page.
//   /api/coach/...         signed in; the product must be on for this account
//   /api/public/coach/...  no login: the public page of a coach
const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');
const C = require('../services/coachAccess');
const S = require('../services/coachSchedule');
const ST = require('../services/coachStudents');
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
    res.json({
      profile: req.coach,
      classes: classes || 0,
      students: students || 0,
      sessions_week: week.filter((x) => x.status === 'scheduled').length,
      pending: pending || 0,
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
    res.json((data || []).map((s) => ({ ...s, ...(live.get(s.id) || { classes: 0, requested: 0 }), ...(s.avatar_v ? { avatar_uid: s.user_id } : {}) })));
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
    res.json({ ...st, enrollments: await ST.studentEnrollments(req.coach.id, st.id) });
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
    res.status(enr.already ? 200 : 201).json({ token: enr.token, status: enr.status, already: !!enr.already, linked_account: !!student.user_id });
  } catch (err) {
    send(res, err);
  }
});
// The quick sign-up's status page (by its secret link): class, coach, status, cancel.
async function byToken(token) {
  if (!isUuid(token) || !(await ST.ready())) return null;
  const { data } = await supabase.from('coach_enrollments').select('*, coach_students(*), coach_classes(*), coach_profiles(slug, display_name, sport, status, cancel_hours)').eq('token', token).maybeSingle();
  if (!data) return null;
  const { coach_students: st, coach_classes: cls, coach_profiles: coach, ...e } = data;
  return { e, st, cls, coach };
}
async function enrollmentView(x) {
  const next = x.cls ? (await S.listSessions(x.cls.coach_id, { classId: x.cls.id, from: todayYmd(), to: S.addDays(todayYmd(), 60) })).filter((s) => s.status === 'scheduled').slice(0, 6) : [];
  return {
    id: x.e.id,
    status: x.e.status,
    pay_mode: x.e.pay_mode,
    created_at: x.e.created_at,
    student: { full_name: x.st.full_name, linked_account: !!x.st.user_id },
    class: x.cls && { id: x.cls.id, title: x.cls.title, kind: x.cls.kind, start_time: x.cls.start_time, duration_min: x.cls.duration_min, weekdays: x.cls.weekdays, date_from: x.cls.date_from, date_to: x.cls.date_to, court_name: x.cls.court_name, map_url: x.cls.map_url, capacity: x.cls.capacity, fee: x.cls.fee, status: x.cls.status },
    coach: x.coach && { slug: x.coach.slug, display_name: x.coach.display_name, sport: x.coach.sport, cancel_hours: x.coach.cancel_hours },
    next_sessions: next.map((s) => ({ id: s.id, session_date: s.session_date, start_time: s.start_time, duration_min: s.duration_min, court_name: s.court_name })),
  };
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
    res.status(enr.already ? 200 : 201).json(await enrollmentView({ e: enr, st: student, cls: klass, coach }));
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

module.exports = { router, publicRoutes, studentRoutes };
