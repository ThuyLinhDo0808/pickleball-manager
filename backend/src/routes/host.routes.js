const express = require('express');
const { supabase } = require('../supabase');
const { dbError } = require('../utils/respond');
const { getUsage } = require('../middleware/checkCapacity');
const { forgetHost } = require('../middleware/auth');
const { getPlan, forgetPlan, plansReady, TIERS: PLAN_TIERS, CLUB_LIMIT, CAPACITY } = require('../services/plan');
const { LIMITS } = require('../services/planFeatures');

const { notifyFeedback } = require('../services/feedback');
const { postWebhook, promotedText, emailReady } = require('../services/notify');

const billing = require('../services/billing');
const { schemaStatus } = require('../services/schemaCheck');

const BILLING_MIGRATION = '20261025090000_plan_payments.sql';
const billingReady = async () => !(await schemaStatus()).missing_migrations.includes(BILLING_MIGRATION);

// The first club with more active members of a type than `limits` allow, or null.
async function clubsOverLimits(hostId, limits) {
  const { data: clubs } = await supabase.from('clubs').select('id, name').eq('host_id', hostId);
  for (const c of clubs || []) {
    for (const type of ['fixed', 'guest']) {
      if (limits[type] == null) continue;
      const { count } = await supabase.from('club_members').select('id', { count: 'exact', head: true }).eq('club_id', c.id).eq('is_active', true).eq('member_type', type);
      if ((count || 0) > limits[type]) return { name: c.name, type, used: count };
    }
  }
  return null;
}

const router = express.Router();
const ALLOW_SELF_SERVE = process.env.ALLOW_TIER_SELF_SERVE === 'true';
const TIERS = PLAN_TIERS;

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

// The Host's plan: tier, club limit and usage, Social Manager add-on.
router.get('/plan', async (req, res) => {
  try {
    res.json({ ...(await getPlan(req.hostId, { fresh: true })), is_owner: billing.isAdmin(req.hostEmail) });
  } catch (err) {
    dbError(res, err);
  }
});

// Ask for the Social Manager add-on or a bigger plan. With self-serve on (trials) it is
// applied straight away; otherwise the request is stored and sent to the team (same
// channel as feedback) so they can arrange payment and switch it on.
router.post('/plan/request', async (req, res) => {
  const kind = req.body.kind;
  if (!['social_manager', 'tier'].includes(kind)) return res.status(400).json({ error: 'kind must be social_manager or tier.' });
  const tier = req.body.tier;
  if (kind === 'tier' && !PLAN_TIERS.includes(tier)) return res.status(400).json({ error: `tier must be one of ${PLAN_TIERS.join(', ')}` });
  try {
    if (!(await plansReady())) return res.status(409).json({ error: 'Run migration 20261018090000_social_manager_plans.sql first.' });
    const now = new Date().toISOString();
    // Going down a plan needs no payment: it applies at once, if what the Host runs
    // still fits the smaller plan.
    if (kind === 'tier') {
      const current = await getPlan(req.hostId);
      // Same plan again = paying to extend it (not with self-serve, where it is free).
      if (tier === current.tier && (ALLOW_SELF_SERVE || tier === 'free')) return res.status(400).json({ error: 'This is already your plan.', code: 'same_tier' });
      if (PLAN_TIERS.indexOf(tier) < PLAN_TIERS.indexOf(current.tier)) {
        const limit = CLUB_LIMIT[tier];
        if (limit != null && current.clubs_owned > limit) {
          return res.status(409).json({ error: `The ${tier} plan allows ${limit} club(s); you own ${current.clubs_owned}. Delete clubs first.`, code: 'too_many_clubs', limit, owned: current.clubs_owned });
        }
        // Every club must fit the smaller plan's member limits too.
        const tooBig = await clubsOverLimits(req.hostId, LIMITS[tier]);
        if (tooBig) {
          return res.status(409).json({ error: `The ${tier} plan allows ${LIMITS[tier][tooBig.type]} ${tooBig.type === 'guest' ? 'guest' : 'official'} members per club; "${tooBig.name}" has ${tooBig.used}.`, code: 'too_many_members', club: tooBig.name, member_type: tooBig.type, limit: LIMITS[tier][tooBig.type], used: tooBig.used });
        }
        const usage = await getUsage(req.hostId).catch(() => null);
        if (usage && usage.used > CAPACITY[tier]) {
          return res.status(409).json({ error: `The ${tier} plan allows ${CAPACITY[tier]} people; you manage ${usage.used}.`, code: 'over_capacity', limit: CAPACITY[tier], used: usage.used });
        }
        const { error } = await supabase.from('host_subscriptions').update({ tier, upgrade_requested_at: null, upgrade_requested_tier: null }).eq('host_id', req.hostId);
        if (error) throw error;
        forgetPlan(req.hostId);
        await notifyFeedback({ message: `[Gói] Hạ gói ${current.tier} → ${tier}`, contact: req.hostEmail, page: '/plan', userEmail: req.hostEmail }).catch(() => {});
        return res.json({ applied: true, downgraded: true, plan: await getPlan(req.hostId, { fresh: true }) });
      }
    }
    // Paid upgrades: an order with a transfer code; the plan switches on once the
    // operator confirms the money arrived.
    let payment = null;
    if (!ALLOW_SELF_SERVE) {
      if (!(await billingReady())) return res.status(409).json({ error: `Run migration ${BILLING_MIGRATION} first.` });
      payment = await billing.createOrder(req.hostId, { kind, tier, months: req.body.months });
    }
    const patch = ALLOW_SELF_SERVE
      ? kind === 'social_manager'
        ? { social_manager: true }
        : { tier }
      : kind === 'social_manager'
        ? { social_manager_requested_at: now }
        : { upgrade_requested_at: now, upgrade_requested_tier: tier };
    const { error } = await supabase.from('host_subscriptions').update(patch).eq('host_id', req.hostId);
    if (error) throw error;
    if (!ALLOW_SELF_SERVE) {
      const what = kind === 'social_manager' ? 'Đăng ký Social Manager (Xé Vé)' : `Nâng cấp gói lên ${tier}`;
      const money = `${payment.months} tháng · ${payment.amount.toLocaleString('vi-VN')}đ · nội dung CK ${payment.ref}`;
      await notifyFeedback({ message: `[Yêu cầu gói] ${what} — ${money}. Khi nhận được tiền, vào trang Quản trị → Thanh toán gói để xác nhận.`, contact: req.hostEmail, page: '/admin/payments', userEmail: req.hostEmail }).catch(() => {});
    }
    res.json({ applied: ALLOW_SELF_SERVE, payment, plan: await getPlan(req.hostId, { fresh: true }) });
  } catch (err) {
    dbError(res, err);
  }
});

// Stop the Social Manager add-on, or take back a request that is still waiting.
// kind: social_manager | social_manager_request | upgrade_request
router.post('/plan/cancel', async (req, res) => {
  const kind = req.body.kind;
  if (!['social_manager', 'social_manager_request', 'upgrade_request'].includes(kind)) {
    return res.status(400).json({ error: 'kind must be social_manager, social_manager_request or upgrade_request.' });
  }
  try {
    if (!(await plansReady())) return res.status(409).json({ error: 'Run migration 20261018090000_social_manager_plans.sql first.' });
    if (kind === 'social_manager') {
      // Players already signed up (and maybe paid) for coming Xé Vé games: finish or
      // cancel those first.
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('host_id', req.hostId)
        .is('club_id', null)
        .gte('event_date', today)
        .not('status', 'in', '(cancelled,completed)');
      if (count) return res.status(409).json({ error: `You have ${count} upcoming Xé Vé game(s). Finish or cancel them first.`, code: 'upcoming_games', count });
    }
    const patch = {
      social_manager: { social_manager: false, social_manager_requested_at: null },
      social_manager_request: { social_manager_requested_at: null },
      upgrade_request: { upgrade_requested_at: null, upgrade_requested_tier: null },
    }[kind];
    const { error } = await supabase.from('host_subscriptions').update(patch).eq('host_id', req.hostId);
    if (error) throw error;
    // Taking back a request also drops its unpaid transfer order.
    if (kind !== 'social_manager' && (await billingReady())) await billing.cancelOrders(req.hostId, kind === 'upgrade_request' ? 'tier' : 'social_manager');
    const what = { social_manager: 'Huỷ Social Manager', social_manager_request: 'Huỷ yêu cầu Social Manager', upgrade_request: 'Huỷ yêu cầu nâng cấp' }[kind];
    await notifyFeedback({ message: `[Gói] ${what}`, contact: req.hostEmail, page: '/plan', userEmail: req.hostEmail }).catch(() => {});
    res.json({ plan: await getPlan(req.hostId, { fresh: true }) });
  } catch (err) {
    dbError(res, err);
  }
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

const EMAIL_MIGRATION = '20261024090000_player_email_notices.sql';

router.get('/notifications', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*').eq('id', req.hostId).single();
  if (error) return dbError(res, error);
  res.json({
    notify_webhook_url: data.notify_webhook_url,
    telegram_bot: process.env.TELEGRAM_BOT_USERNAME || null,
    // Emails to players: the Host's switch (off by default) and whether the server can send.
    notify_players_email: !!data.notify_players_email,
    email_ready: emailReady(),
    email_migrated: 'notify_players_email' in data,
  });
});

// Body: { notify_webhook_url } and/or { notify_players_email: boolean }.
router.patch('/notifications', async (req, res) => {
  const patch = {};
  if ('notify_webhook_url' in req.body) {
    const { url, error: bad } = cleanWebhookUrl(req.body.notify_webhook_url);
    if (bad) return res.status(400).json({ error: bad });
    patch.notify_webhook_url = url;
  }
  if ('notify_players_email' in req.body) patch.notify_players_email = req.body.notify_players_email === true;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change.' });
  const { data, error } = await supabase.from('users').update(patch).eq('id', req.hostId).select('*').single();
  if (error) {
    if ('notify_players_email' in patch) return res.status(409).json({ error: `Run migration ${EMAIL_MIGRATION} first.` });
    return dbError(res, error);
  }
  res.json({ notify_webhook_url: data.notify_webhook_url, notify_players_email: !!data.notify_players_email });
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

// ---- Delete my account -----------------------------------------------------------
// What goes with the account: the clubs it owns (members, sessions, tournaments, fund),
// its Xé Vé events, and its player profile. Records in other people's clubs stay with the
// club (name, attendance) but are no longer linked to this account.
async function accountFootprint(userId) {
  const count = (table, col, val) =>
    supabase.from(table).select('id', { count: 'exact', head: true }).eq(col, val).then((r) => r.count || 0);
  const { data: clubs, error } = await supabase.from('clubs').select('id, name').eq('host_id', userId).order('name');
  if (error) throw error;
  const [xeve, linked] = await Promise.all([
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('host_id', userId).is('club_id', null).then((r) => r.count || 0),
    count('club_members', 'user_id', userId),
  ]);
  return { clubs: clubs || [], xeve_events: xeve, linked_memberships: linked };
}

router.get('/account/delete-preview', async (req, res) => {
  try {
    res.json({ email: req.hostEmail, ...(await accountFootprint(req.userId)) });
  } catch (err) {
    dbError(res, err);
  }
});

router.delete('/account', async (req, res) => {
  const userId = req.userId;
  const typed = String(req.query.confirm || '').trim().toLowerCase();
  if (!typed || typed !== String(req.hostEmail || '').trim().toLowerCase()) {
    return res.status(400).json({ error: 'Type your account email to confirm.', code: 'confirm_email' });
  }
  // Tournaments first (their line-ups point at members and would clash while cascading),
  // then events (club sessions and Xé Vé), then the clubs; the account deletion cascades
  // to everything else the account owns.
  for (const table of ['tournaments', 'events', 'clubs']) {
    const { error } = await supabase.from(table).delete().eq('host_id', userId);
    if (error) return dbError(res, error);
  }
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error('delete account failed', error);
    return res.status(500).json({ error: 'Could not delete the account. Please try again.' });
  }
  forgetHost(userId);
  res.status(204).end();
});

module.exports = router;
