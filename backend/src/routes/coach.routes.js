// Coach Manager (đợt C1): the coach's own profile and its public page.
//   /api/coach/...         signed in; the product must be on for this account
//   /api/public/coach/...  no login: the public page of a coach
const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');
const C = require('../services/coachAccess');
const S = require('../services/coachSchedule');
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
    const [{ count: classes }, week, next] = await Promise.all([
      supabase.from('coach_classes').select('id', { count: 'exact', head: true }).eq('coach_id', req.coach.id).eq('status', 'open'),
      S.listSessions(req.coach.id, { from: today, to: S.addDays(today, 6) }),
      S.listSessions(req.coach.id, { from: today, to: S.addDays(today, 30) }),
    ]);
    res.json({
      profile: req.coach,
      classes: classes || 0,
      students: 0,
      sessions_week: week.filter((x) => x.status === 'scheduled').length,
      pending: 0,
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
    res.json((data || []).map((c) => ({ ...c, ...(counts.get(c.id) || { total: 0, upcoming: 0, next: null }) })));
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
    res.json({ ...cls, sessions });
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

module.exports = { router, publicRoutes };
