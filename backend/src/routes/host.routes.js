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

// Email the developer about new feedback. Needs RESEND_API_KEY + FEEDBACK_TO_EMAIL
// (and optionally FEEDBACK_FROM_EMAIL, a sender on a domain verified in Resend).
async function emailFeedback({ message, contact, page, userEmail }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (!key || !to) return 'not_configured';
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.FEEDBACK_FROM_EMAIL || 'Pickleball Manager <onboarding@resend.dev>',
      to: [to],
      reply_to: contact && /@/.test(contact) ? contact : undefined,
      subject: `Góp ý mới — Pickleball Manager`,
      html: `<p style="white-space:pre-wrap">${esc(message)}</p><hr><p>Từ: ${esc(userEmail)}<br>Liên hệ: ${esc(contact || '—')}<br>Trang: ${esc(page || '—')}</p>`,
    }),
  });
  return r.ok ? 'sent' : `failed_${r.status}`;
}

router.post('/feedback', async (req, res) => {
  const message = String(req.body.message || '').trim();
  const contact = String(req.body.contact || '').trim() || null;
  const page = String(req.body.page || '').slice(0, 200) || null;
  if (!message) return res.status(400).json({ error: 'message is required.' });
  if (message.length > 4000) return res.status(400).json({ error: 'message is too long (max 4000 characters).' });
  const { data, error } = await supabase
    .from('feedback')
    .insert({ host_id: req.hostId, message: page ? `${message}\n\n[page: ${page}]` : message, contact })
    .select()
    .single();
  if (error) return dbError(res, error);
  let email;
  try {
    email = await emailFeedback({ message, contact, page, userEmail: req.hostEmail });
  } catch (err) {
    console.error('feedback email failed', err);
    email = 'failed';
  }
  res.status(201).json({ id: data.id, email }); // saved either way; email is best-effort
});

module.exports = router;
