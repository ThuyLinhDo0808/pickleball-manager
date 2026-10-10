// Paying for a bigger plan / the Social Manager add-on: the Host transfers the money
// (VietQR) to the app operator's account with an order code in the note; the operator
// confirms it arrived (admin page), which switches the plan on for the months paid.
const crypto = require('crypto');
const { supabase } = require('../supabase');
const { vietqrUrl } = require('./payment');
const { todayYmd } = require('./memberships');
const promo = require('./promo');

// Monthly price (VND). PLAN_PRICE_<NAME> overrides one, e.g. PLAN_PRICE_BASIC=99000.
const DEFAULT_PRICES = { ...require('./planFeatures').PRICES, social_manager: 89000 };
const MONTH_CHOICES = [1, 3, 6, 12];

function prices() {
  const out = {};
  for (const [k, v] of Object.entries(DEFAULT_PRICES)) {
    const env = Number(process.env[`PLAN_PRICE_${k.toUpperCase()}`]);
    out[k] = Number.isFinite(env) && env >= 0 ? Math.round(env) : v;
  }
  return out;
}

// Where Hosts send the money (the operator's account). PLAN_BANK_* override it.
function operatorBank() {
  return {
    bank_code: process.env.PLAN_BANK_CODE || 'VCB',
    bank_name: process.env.PLAN_BANK_NAME || 'Vietcombank',
    bank_account: process.env.PLAN_BANK_ACCOUNT || '0611001993516',
    bank_holder: process.env.PLAN_BANK_HOLDER || 'DO THUY LINH',
  };
}

// Who may confirm payments: the app owner(s).
const isAdmin = (email) => require('./owner').isOwner(email);

// Order code for the transfer note (no 0/O/1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRef = () => `PBM${[...crypto.randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;

// An order as the Host sees it: amount, bank details and the VietQR image.
function present(order) {
  if (!order) return null;
  const bank = operatorBank();
  return {
    id: order.id,
    kind: order.kind,
    tier: order.tier,
    months: order.months,
    amount: Number(order.amount),
    discount_amount: Number(order.discount_amount || 0),
    promo_code: order.promo_code || null,
    upgrade_from: order.upgrade_from || null,
    upgrade_days: order.upgrade_days || null,
    ref: order.ref,
    status: order.status,
    created_at: order.created_at,
    bank: { code: bank.bank_code, name: bank.bank_name, account: bank.bank_account, holder: bank.bank_holder },
    qr_url: vietqrUrl(bank, order.amount, order.ref),
  };
}

// The Host's waiting orders, newest first: { tier, social_manager }.
async function pendingOrders(hostId) {
  const { data, error } = await supabase.from('plan_payments').select('*').eq('host_id', hostId).eq('status', 'pending').order('created_at', { ascending: false });
  if (error) return { tier: null, social_manager: null };
  return {
    tier: present(data.find((o) => o.kind === 'tier')),
    social_manager: present(data.find((o) => o.kind === 'social_manager')),
  };
}

const PF = require('./planFeatures');
const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
// Amounts the Host pays are whole thousands (easy to type in a transfer), rounded up.
const toThousands = (v) => Math.ceil(Math.max(0, v) / 1000) * 1000;

// A plan the Host is paying for right now (not a trial, not run out).
function activePaid(sub, today = todayYmd()) {
  if (!sub || !PF.PAID_TIERS.includes(sub.tier) || !sub.tier_paid_until || sub.tier_paid_until < today) return false;
  const onTrial = !!sub.trial_ends_on && sub.tier_paid_until === sub.trial_ends_on;
  return !onTrial;
}

// Moving up while a paid plan runs: pay only the difference between the two monthly
// prices for the days left (today included); the end date stays the same.
// Returns null when this is not an upgrade of a running paid plan.
function upgradeQuote(sub, tier, today = todayYmd()) {
  if (!activePaid(sub, today) || PF.rank(tier) <= PF.rank(sub.tier)) return null;
  const p = prices();
  const days = daysBetween(today, sub.tier_paid_until) + 1;
  const perDay = (p[tier] - p[sub.tier]) / 30;
  return { from: sub.tier, to: tier, days, until: sub.tier_paid_until, price_from: p[sub.tier], price_to: p[tier], amount: toThousands(perDay * days) };
}

// A new order replaces the Host's earlier waiting order of the same kind. A promo code
// (percent) lowers the amount; its use is reserved with the order.
// Plan orders: a higher plan while a paid one runs is an upgrade (the difference for the
// days left); a lower one waits until the current plan ends.
async function createOrder(hostId, { kind, tier, months, promoCode }) {
  const m = MONTH_CHOICES.includes(Number(months)) ? Number(months) : 1;
  const price = prices()[kind === 'social_manager' ? 'social_manager' : tier];
  if (price == null) throw Object.assign(new Error('No price for this plan.'), { status: 400 });
  if (kind === 'tier') {
    const { data: sub } = await supabase.from('host_subscriptions').select('*').eq('host_id', hostId).maybeSingle();
    const quote = upgradeQuote(sub, tier);
    if (quote) {
      await cancelOrders(hostId, kind);
      const row = { host_id: hostId, kind, tier, months: 0, amount: quote.amount, ref: newRef(), upgrade_from: quote.from, upgrade_days: quote.days };
      const { data, error } = await supabase.from('plan_payments').insert(row).select().single();
      if (error) throw error;
      return present(data);
    }
    if (activePaid(sub) && PF.rank(tier) < PF.rank(sub.tier)) {
      throw Object.assign(new Error(`You pay for ${sub.tier} until ${sub.tier_paid_until}. Choose a smaller plan when it ends.`), { status: 409, code: 'downgrade_locked', until: sub.tier_paid_until });
    }
  }
  await cancelOrders(hostId, kind);
  const gross = price * m;
  let promoRow = null;
  let discount = 0;
  if (promoCode) {
    promoRow = await promo.check(hostId, promoCode, { kind: 'order' });
    discount = promo.discountFor(promoRow, kind, gross);
  }
  const row = { host_id: hostId, kind, tier: kind === 'tier' ? tier : null, months: m, amount: gross - discount, ref: newRef() };
  if (promoRow) Object.assign(row, { promo_code_id: promoRow.id, discount_amount: discount });
  const { data, error } = await supabase.from('plan_payments').insert(row).select().single();
  if (error) throw error;
  if (promoRow) {
    try {
      await promo.reserve(promoRow, hostId, data.id, discount);
    } catch (err) {
      await supabase.from('plan_payments').update({ status: 'cancelled' }).eq('id', data.id);
      throw err;
    }
  }
  return present({ ...data, promo_code: promoRow?.code || null });
}

async function cancelOrders(hostId, kind) {
  const { data, error } = await supabase.from('plan_payments').update({ status: 'cancelled' }).eq('host_id', hostId).eq('kind', kind).eq('status', 'pending').select('id, promo_code_id');
  if (error) throw error;
  await promo.release((data || []).filter((o) => o.promo_code_id).map((o) => o.id)).catch(() => {});
}

// YYYY-MM-DD + n months (end-of-month safe: Jan 31 + 1 month = Feb 28/29).
function addMonths(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Operator: the money arrived -> switch the plan on. Paying again for the plan the Host
// already has extends it from its current end date.
async function confirmOrder(orderId, adminEmail) {
  const { data: order } = await supabase.from('plan_payments').select('*').eq('id', orderId).maybeSingle();
  if (!order) throw Object.assign(new Error('Order not found.'), { status: 404 });
  if (order.status !== 'pending') throw Object.assign(new Error(`Order is already ${order.status}.`), { status: 409 });
  const { data: sub, error: sErr } = await supabase.from('host_subscriptions').select('*').eq('host_id', order.host_id).single();
  if (sErr) throw sErr;
  const today = todayYmd();
  let patch;
  if (order.kind === 'tier' && order.upgrade_from) {
    // Upgrade: the higher plan for the rest of the period already paid.
    patch = { tier: order.tier, upgrade_requested_at: null, upgrade_requested_tier: null };
  } else if (order.kind === 'tier') {
    const from = sub.tier === order.tier && sub.tier_paid_until && sub.tier_paid_until >= today ? sub.tier_paid_until : today;
    patch = { tier: order.tier, tier_paid_until: addMonths(from, order.months), upgrade_requested_at: null, upgrade_requested_tier: null };
  } else {
    const from = sub.social_manager && sub.social_manager_paid_until && sub.social_manager_paid_until >= today ? sub.social_manager_paid_until : today;
    patch = { social_manager: true, social_manager_paid_until: addMonths(from, order.months), social_manager_requested_at: null };
  }
  const { error } = await supabase.from('host_subscriptions').update(patch).eq('host_id', order.host_id);
  if (error) throw error;
  const { data: done, error: oErr } = await supabase
    .from('plan_payments')
    .update({ status: 'paid', confirmed_at: new Date().toISOString(), confirmed_by: adminEmail || null })
    .eq('id', order.id)
    .select()
    .single();
  if (oErr) throw oErr;
  require('./plan').forgetPlan(order.host_id);
  return { order: done, subscription: patch };
}

// A paid period ran out: back to Free / Social Manager off (data stays; only adding
// clubs, people or Xé Vé games is locked until the Host pays again).
async function expireIfDue(sub) {
  if (!sub) return sub;
  const today = todayYmd();
  const patch = {};
  if (sub.tier !== 'free' && sub.tier_paid_until && sub.tier_paid_until < today) patch.tier = 'free';
  if (sub.social_manager && sub.social_manager_paid_until && sub.social_manager_paid_until < today) patch.social_manager = false;
  if (!Object.keys(patch).length) return sub;
  const { error } = await supabase.from('host_subscriptions').update(patch).eq('host_id', sub.host_id);
  if (error) return sub;
  return { ...sub, ...patch, expired_tier: patch.tier ? sub.tier : null, expired_social_manager: 'social_manager' in patch };
}

module.exports = { activePaid, upgradeQuote, daysBetween, DEFAULT_PRICES, MONTH_CHOICES, prices, operatorBank, isAdmin, present, pendingOrders, createOrder, cancelOrders, confirmOrder, expireIfDue, addMonths, addDays };
