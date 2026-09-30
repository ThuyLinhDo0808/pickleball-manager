const express = require('express');
const { supabase } = require('../supabase');
const { dbError } = require('../utils/respond');
const { getUsage } = require('../middleware/checkCapacity');

const { notifyFeedback } = require('../services/feedback');
const { postWebhook, promotedText } = require('../services/notify');

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
  const delivery = await notifyFeedback({ message, contact, page, userEmail: req.hostEmail });
  res.status(201).json({ id: data.id, ...delivery }); // saved either way; delivery is best-effort
});

// Notification webhook: where "moved up from the waitlist" events are POSTed (JSON).
// https only, and never to localhost / private networks (the server makes this call).
function cleanWebhookUrl(v) {
  const raw = String(v || '').trim();
  if (!raw) return { url: null };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { error: 'Not a valid URL.' };
  }
  const host = u.hostname.toLowerCase();
  const privateHost =
    host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host === '[::1]' ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (u.protocol !== 'https:' || privateHost) return { error: 'Use a public https:// URL.' };
  return { url: u.toString() };
}

router.get('/notifications', async (req, res) => {
  const { data, error } = await supabase.from('users').select('notify_webhook_url').eq('id', req.hostId).single();
  if (error) return dbError(res, error);
  res.json({ notify_webhook_url: data.notify_webhook_url, telegram_bot: process.env.TELEGRAM_BOT_USERNAME || null });
});

router.patch('/notifications', async (req, res) => {
  const { url, error: bad } = cleanWebhookUrl(req.body.notify_webhook_url);
  if (bad) return res.status(400).json({ error: bad });
  const { data, error } = await supabase.from('users').update({ notify_webhook_url: url }).eq('id', req.hostId).select('notify_webhook_url').single();
  if (error) return dbError(res, error);
  res.json(data);
});

// Send a sample "promoted" message so the Host can check their Zalo/Make/Zapier flow.
router.post('/notifications/test', async (req, res) => {
  const { data } = await supabase.from('users').select('notify_webhook_url').eq('id', req.hostId).single();
  if (!data?.notify_webhook_url) return res.status(400).json({ error: 'Save a webhook URL first.' });
  const event = { title: 'Kèo thử', event_date: new Date().toISOString().slice(0, 10), start_time: '20:00:00', location: 'Sân mẫu' };
  const text = promotedText(event, 'Người chơi mẫu');
  const result = await postWebhook(data.notify_webhook_url, {
    type: 'waitlist_promoted',
    test: true,
    event,
    player: { full_name: 'Người chơi mẫu', phone: '0900000000' },
    text,
    content: text,
    created_at: new Date().toISOString(),
  }).catch(() => 'failed');
  res.json({ webhook: result });
});

// Where guests pay for events (club sessions use the club's own account when it has one).
router.get('/payment-settings', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('bank_code, bank_account, bank_holder, payment_qr_image')
    .eq('id', req.hostId)
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

router.patch('/payment-settings', async (req, res) => {
  const fields = {};
  for (const k of ['bank_code', 'bank_account', 'bank_holder']) {
    if (k in req.body) fields[k] = String(req.body[k] ?? '').trim() || null;
  }
  if (fields.bank_code) fields.bank_code = fields.bank_code.toUpperCase();
  if (fields.bank_account && !/^[0-9A-Za-z]{4,30}$/.test(fields.bank_account)) {
    return res.status(400).json({ error: 'bank_account should be 4-30 letters/digits, no spaces.' });
  }
  if ('payment_qr_image' in req.body) {
    const img = req.body.payment_qr_image;
    if (img && !(typeof img === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(img) && img.length <= 400000)) {
      return res.status(400).json({ error: 'The QR image must be a small JPEG/PNG/WebP.' });
    }
    fields.payment_qr_image = img || null;
  }
  const { data, error } = await supabase
    .from('users')
    .update(fields)
    .eq('id', req.hostId)
    .select('bank_code, bank_account, bank_holder, payment_qr_image')
    .single();
  if (error) return dbError(res, error);
  res.json(data);
});

module.exports = router;
