// Coach Manager (đợt C1): the coach's own profile and its public page.
//   /api/coach/...         signed in; the product must be on for this account
//   /api/public/coach/...  no login: the public page of a coach
const express = require('express');
const { supabase } = require('../supabase');
const { dbError } = require('../utils/respond');
const C = require('../services/coachAccess');

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

// The numbers on the coach's overview. Classes, students and money arrive in later
// batches; until then the overview shows the profile's state and what to do next.
router.get('/overview', async (req, res) => {
  res.json({
    profile: req.coach,
    classes: 0,
    students: 0,
    sessions_week: 0,
    pending: 0,
  });
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
    res.json(view);
  } catch (err) {
    send(res, err);
  }
});

module.exports = { router, publicRoutes };
