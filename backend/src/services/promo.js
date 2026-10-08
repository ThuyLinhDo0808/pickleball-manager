// Promo codes the owner hands out (Owner Console → Khuyến mãi).
//   percent — X% off one plan order; the use is reserved with the order and freed if
//             the order is cancelled (or replaced by a new one).
//   trial   — a plan switched on at once for N days, then back to Free.
// One use per Host per code; optional expiry date, max uses and "first order only".
const { supabase } = require('../supabase');
const { todayYmd } = require('./memberships');

const fail = (status, message, code, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const normalize = (code) => String(code || '').trim().toUpperCase();

async function uses(codeId) {
  const { count } = await supabase.from('promo_redemptions').select('id', { count: 'exact', head: true }).eq('code_id', codeId);
  return count || 0;
}

// Can this Host use this code now? Returns the code row, else throws with a code.
async function check(hostId, raw, { kind = null } = {}) {
  const code = normalize(raw);
  if (!code) throw fail(400, 'Enter a code.', 'promo_not_found');
  const { data: promo } = await supabase.from('promo_codes').select('*').eq('code', code).maybeSingle();
  if (!promo || !promo.active) throw fail(404, 'This code does not exist.', 'promo_not_found');
  if (promo.expires_on && promo.expires_on < todayYmd()) throw fail(409, 'This code has expired.', 'promo_expired');
  const { data: mine } = await supabase.from('promo_redemptions').select('id').eq('code_id', promo.id).eq('host_id', hostId).maybeSingle();
  if (mine) throw fail(409, 'You have already used this code.', 'promo_already_used');
  if (promo.max_uses && (await uses(promo.id)) >= promo.max_uses) throw fail(409, 'This code has been used up.', 'promo_used_up');
  if (kind === 'order' && promo.kind !== 'percent') throw fail(409, 'This is a trial code — use "Activate" instead.', 'promo_wrong_kind', { promo_kind: promo.kind });
  if (kind === 'trial' && promo.kind !== 'trial') throw fail(409, 'This code is a discount for a plan order.', 'promo_wrong_kind', { promo_kind: promo.kind });
  if (promo.first_order_only) {
    const { count } = await supabase.from('plan_payments').select('id', { count: 'exact', head: true }).eq('host_id', hostId).eq('status', 'paid');
    if (count) throw fail(409, 'This code is only for a first order.', 'promo_first_order');
  }
  return promo;
}

// Discount on an order of `amount` for `orderKind` (tier | social_manager).
function discountFor(promo, orderKind, amount) {
  if (promo.applies_to !== 'any' && promo.applies_to !== orderKind) throw fail(409, 'This code is not for this kind of order.', 'promo_wrong_order');
  return Math.min(amount, Math.round((amount * promo.percent) / 100));
}

// Public view of a code for the Host (no internal note).
const describe = (p) => ({ code: p.code, kind: p.kind, percent: p.percent, applies_to: p.applies_to, trial_tier: p.trial_tier, trial_days: p.trial_days, expires_on: p.expires_on, first_order_only: p.first_order_only });

async function reserve(promo, hostId, paymentId, discount) {
  const { error } = await supabase.from('promo_redemptions').insert({ code_id: promo.id, host_id: hostId, payment_id: paymentId, discount_amount: discount });
  if (error) throw error.code === '23505' ? fail(409, 'You have already used this code.', 'promo_already_used') : error;
}

// Orders cancelled before payment give their code back.
async function release(paymentIds) {
  if (!paymentIds.length) return;
  await supabase.from('promo_redemptions').delete().in('payment_id', paymentIds);
}

module.exports = { normalize, check, discountFor, describe, reserve, release, uses };
