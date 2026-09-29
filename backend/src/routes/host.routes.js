const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { dbError } = require('../utils/respond');

const router = express.Router();
router.use(requireAuth);

// Current host profile + plan + live capacity usage — the app calls this
// once after login to drive the "X / Y used" banner in both workspaces.
router.get('/me', async (req, res) => {
  const [{ data: user, error: userErr }, { data: usage, error: usageErr }] = await Promise.all([
    supabaseAdmin.from('users').select('*').eq('id', req.user.id).maybeSingle(),
    supabaseAdmin.from('v_host_capacity_usage').select('*').eq('host_id', req.user.id).maybeSingle(),
  ]);
  if (userErr) return dbError(res, userErr);
  if (usageErr) return dbError(res, usageErr);

  res.json({
    user,
    subscription: usage || { tier: 'free', max_capacity: 30, current_usage: 0 },
  });
});

// Simple tier change endpoint. In production this would only be called
// from a verified payment webhook (Stripe/RevenueCat/etc.), never directly
// from the client — wire that up before launch.
router.post('/subscription', async (req, res) => {
  if (process.env.ALLOW_TIER_SELF_SERVE === 'false') {
    return res.status(403).json({ error: 'SELF_SERVE_DISABLED', message: 'Plan changes are handled through billing, not from the app.' });
  }
  const { tier } = req.body;
  if (!['free', 'basic', 'standard', 'pro'].includes(tier)) {
    return res.status(400).json({ error: 'tier must be one of free, basic, standard, pro.' });
  }

  const { data, error } = await supabaseAdmin
    .from('host_subscriptions')
    .upsert({ host_id: req.user.id, tier }, { onConflict: 'host_id' })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json({ subscription: data });
});

module.exports = router;
