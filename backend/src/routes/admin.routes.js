// The app operator (emails in ADMIN_EMAILS): confirm plan payments that arrived by
// bank transfer, or cancel orders that were never paid.
const express = require('express');
const { supabase } = require('../supabase');
const { dbError, isUuid } = require('../utils/respond');
const billing = require('../services/billing');
const { notifyFeedback } = require('../services/feedback');

const router = express.Router();

// Anyone else gets a plain 404, as if the route did not exist.
router.use((req, res, next) => (billing.isAdmin(req.hostEmail) ? next() : res.status(404).json({ error: 'Not found.' })));

// ?status=pending (default) | paid | cancelled | all
router.get('/plan-payments', async (req, res) => {
  const status = ['pending', 'paid', 'cancelled', 'all'].includes(req.query.status) ? req.query.status : 'pending';
  let q = supabase.from('plan_payments').select('*').order('created_at', { ascending: false }).limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return dbError(res, error);
  const ids = [...new Set(data.map((o) => o.host_id))];
  const [{ data: users }, { data: subs }] = await Promise.all([
    ids.length ? supabase.from('users').select('id, email, full_name').in('id', ids) : { data: [] },
    ids.length ? supabase.from('host_subscriptions').select('host_id, tier, tier_paid_until, social_manager, social_manager_paid_until').in('host_id', ids) : { data: [] },
  ]);
  const byId = new Map((users || []).map((u) => [u.id, u]));
  const subOf = new Map((subs || []).map((s) => [s.host_id, s]));
  res.json({
    orders: data.map((o) => ({
      ...billing.present(o),
      confirmed_at: o.confirmed_at,
      confirmed_by: o.confirmed_by,
      host: byId.get(o.host_id) || { id: o.host_id },
      current: subOf.get(o.host_id) || null,
    })),
  });
});

// The money arrived: switch the plan on for the months paid.
router.post('/plan-payments/:id/confirm', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Order not found.' });
  try {
    const r = await billing.confirmOrder(req.params.id, req.hostEmail);
    const what = r.order.kind === 'tier' ? r.order.tier : 'Social Manager';
    await notifyFeedback({ message: `[Gói] Đã xác nhận thanh toán ${r.order.ref} (${what}, ${r.order.months} tháng)`, contact: req.hostEmail, page: '/admin/payments', userEmail: req.hostEmail }).catch(() => {});
    res.json(r);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    dbError(res, err);
  }
});

// Never paid: drop the order (and the Host's "waiting" badge).
router.post('/plan-payments/:id/cancel', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Order not found.' });
  const { data: order, error } = await supabase.from('plan_payments').update({ status: 'cancelled' }).eq('id', req.params.id).eq('status', 'pending').select().maybeSingle();
  if (error) return dbError(res, error);
  if (!order) return res.status(409).json({ error: 'Order is not pending.' });
  const clear = order.kind === 'tier' ? { upgrade_requested_at: null, upgrade_requested_tier: null } : { social_manager_requested_at: null };
  await supabase.from('host_subscriptions').update(clear).eq('host_id', order.host_id);
  res.json({ order });
});

module.exports = router;
