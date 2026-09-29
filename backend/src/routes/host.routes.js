const express = require('express');
const { supabase } = require('../supabase');
const { dbError } = require('../utils/respond');
const { getUsage } = require('../middleware/checkCapacity');

const router = express.Router();
const ALLOW_SELF_SERVE = process.env.ALLOW_TIER_SELF_SERVE === 'true';
const TIERS = ['free', 'basic', 'standard', 'pro'];

router.get('/me', async (req, res) => {
  const { data: user, error: uErr } = await supabase.from('users').select('*').eq('id', req.hostId).single();
  if (uErr) return dbError(res, uErr);
  const usage = await getUsage(req.hostId).catch(() => null);
  res.json({ ...user, usage });
});

router.get('/subscription', async (req, res) => {
  const { data, error } = await supabase.from('host_subscriptions').select('*').eq('host_id', req.hostId).single();
  if (error) return dbError(res, error);
  const usage = await getUsage(req.hostId).catch(() => null);
  res.json({ ...data, usage });
});

router.patch('/subscription', async (req, res) => {
  if (!ALLOW_SELF_SERVE) {
    return res.status(403).json({ error: 'Plan changes are handled outside self-serve. Contact support.' });
  }
  const { tier } = req.body;
  if (!TIERS.includes(tier)) return res.status(400).json({ error: `tier must be one of ${TIERS.join(', ')}` });
  const { data, error } = await supabase
    .from('host_subscriptions')
    .update({ tier })
    .eq('host_id', req.hostId)
    .select()
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/feedback', async (req, res) => {
  const { message, contact } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required.' });
  const { data, error } = await supabase
    .from('feedback')
    .insert({ host_id: req.hostId, message, contact: contact || null })
    .select()
    .single();
  if (error) return dbError(res, error);
  // Optional: wire up an email provider (e.g. Resend) here to notify the developer.
  res.status(201).json(data);
});

module.exports = router;
