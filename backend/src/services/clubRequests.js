// Asking for a new club. Anyone signed in fills in the club's profile (name, size,
// where and when it plays, contact, pictures) and picks a plan; the app owner checks it
// and, on approval, the club is created under the requester's account. Nobody opens a
// club straight away, so a fake club can't be used to collect players' money.
const { supabase } = require('../supabase');
const PF = require('./planFeatures');
const billing = require('./billing');

const SPORTS = ['pickleball', 'badminton'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_AVATAR = 200000;
const MAX_COVER = 600000;

const MIGRATION = '20261104090000_club_requests_discovery.sql';
async function ready() {
  const s = await require('./schemaCheck').schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

const fail = (message, status = 400, code) => Object.assign(new Error(message), { status, code });
const text = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

// The smallest plan whose member limit fits the club as described.
function suggestTier(memberCount) {
  const n = Number(memberCount) || 0;
  return PF.PAID_TIERS.find((t) => PF.LIMITS[t].fixed == null || n <= PF.LIMITS[t].fixed) || 'pro';
}

function cleanImage(v, max, what) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !IMAGE.test(v) || v.length > max) throw fail(`${what} must be a small JPEG/PNG/WebP image.`, 400, 'bad_image');
  return v;
}

// The club's profile, shared by requests and by the owner editing a club later.
function cleanProfile(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => !partial || k in body;
  if (has('country')) out.country = text(body.country, 60) || 'Việt Nam';
  if (has('province')) out.province = text(body.province, 80);
  if (has('district')) out.district = text(body.district, 80);
  if (has('address')) out.address = text(body.address, 200);
  if (has('schedule')) out.schedule = text(body.schedule, 300);
  if (has('description')) out.description = text(body.description, 1000);
  if (has('contact_email')) {
    const e = text(body.contact_email, 200);
    if (e && !EMAIL.test(e)) throw fail('Enter a valid email.', 400, 'bad_email');
    out.contact_email = e ? e.toLowerCase() : null;
  }
  if (has('member_count')) {
    const n = body.member_count === '' || body.member_count == null ? null : Number(body.member_count);
    if (n != null && !(Number.isInteger(n) && n >= 1 && n <= 100000)) throw fail('Member count must be a whole number from 1.', 400, 'bad_member_count');
    out.member_count = n;
  }
  return out;
}

function cleanRequest(body) {
  const name = text(body.name, 80);
  if (!name || name.length < 2) throw fail('Enter the club name.', 400, 'name_required');
  const sport = SPORTS.includes(body.sport) ? body.sport : 'pickleball';
  const p = cleanProfile(body);
  if (!p.address || p.address.length < 2) throw fail('Enter where the club plays.', 400, 'address_required');
  if (!p.contact_email) throw fail("Enter the club owner's email.", 400, 'email_required');
  if (!p.member_count) throw fail('Enter how many members the club has.', 400, 'member_count_required');
  if (!p.province) throw fail('Choose the province / city.', 400, 'province_required');
  const tier = PF.PAID_TIERS.includes(body.plan_tier) ? body.plan_tier : suggestTier(p.member_count);
  const months = billing.MONTH_CHOICES.includes(Number(body.plan_months)) ? Number(body.plan_months) : 1;
  return {
    name,
    sport,
    // a club, or a Social Manager community ("cộng đồng xé vé")
    kind: body.kind === 'community' ? 'community' : 'club',
    ...p,
    avatar: cleanImage(body.avatar, MAX_AVATAR, 'The avatar'),
    cover: cleanImage(body.cover, MAX_COVER, 'The cover picture'),
    plan_tier: tier,
    plan_months: months,
  };
}

// A request as its author sees it (pictures left out of lists: they are big).
const LIST_FIELDS = 'id, name, kind, sport, member_count, address, schedule, description, contact_email, country, province, district, plan_tier, plan_months, status, owner_note, club_id, created_at, decided_at, payment_id';

// Each request carries its plan order: { payment: order as the Host sees it, or null }.
async function withPayments(rows) {
  const ids = rows.map((r) => r.payment_id).filter(Boolean);
  const { data } = ids.length ? await supabase.from('plan_payments').select('*').in('id', ids) : { data: [] };
  return rows.map((r) => ({ ...r, payment: billing.present((data || []).find((o) => o.id === r.payment_id)) }));
}

async function mine(userId) {
  const { data, error } = await supabase.from('club_requests').select(LIST_FIELDS).eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return withPayments(data || []);
}

// Every new club is paid for: the plan picked is ordered (bank transfer) with the
// request, unless the account already pays for a plan with room for another club.
// No free trial. A higher plan while one is paid = an upgrade order (difference only).
async function orderFor(userId, tier, months) {
  const plan = await require('./plan').getPlan(userId, { fresh: true });
  // A plan that is on (paid, or switched on by the app owner) — not a trial code.
  const room = plan.tier !== 'free' && !plan.trial && (plan.club_limit == null || plan.clubs_owned < plan.club_limit);
  if (room) return { tier: plan.tier, order: null };
  const limit = PF.LIMITS[tier].clubs;
  if (limit != null && plan.clubs_owned >= limit) {
    throw fail(`The ${tier} plan allows ${limit} club(s); this account already has ${plan.clubs_owned}.`, 400, 'tier_too_small');
  }
  return { tier, order: await billing.createOrder(userId, { kind: 'tier', tier, months }) };
}

async function create(userId, body) {
  const row = cleanRequest(body || {});
  const { data: waiting } = await supabase.from('club_requests').select('id').eq('user_id', userId).eq('status', 'pending').maybeSingle();
  if (waiting) throw fail('You already have a club request waiting for approval.', 409, 'request_pending');
  const { tier, order } = await orderFor(userId, row.plan_tier, row.plan_months);
  const { data, error } = await supabase.from('club_requests').insert({ ...row, plan_tier: tier, user_id: userId, payment_id: order?.id || null }).select(LIST_FIELDS).single();
  if (error) {
    if (order) await billing.cancelOrders(userId, 'tier').catch(() => {});
    if (error.code === '23505') throw fail('You already have a club request waiting for approval.', 409, 'request_pending');
    throw error;
  }
  return { ...data, payment: order, plan_covered: !order };
}

// A new transfer code for a waiting request (the old order was cancelled, e.g. by a
// newer plan order from the Account page).
async function renewPayment(userId, id) {
  const { data: r } = await supabase.from('club_requests').select('*').eq('id', id).eq('user_id', userId).eq('status', 'pending').maybeSingle();
  if (!r) throw fail('Request not found or already decided.', 404, 'not_found');
  if (r.payment_id) {
    const { data: o } = await supabase.from('plan_payments').select('status').eq('id', r.payment_id).maybeSingle();
    if (o?.status === 'paid') throw fail('This request is already paid.', 409, 'already_paid');
  }
  const { tier, order } = await orderFor(userId, r.plan_tier, r.plan_months || 1);
  const { data, error } = await supabase.from('club_requests').update({ plan_tier: tier, payment_id: order?.id || null }).eq('id', id).select(LIST_FIELDS).single();
  if (error) throw error;
  return { ...data, payment: order, plan_covered: !order };
}

async function cancel(userId, id) {
  const { data: r } = await supabase.from('club_requests').select('payment_id').eq('id', id).eq('user_id', userId).eq('status', 'pending').maybeSingle();
  if (r?.payment_id) await cancelOrder(r.payment_id);
  const { data, error } = await supabase
    .from('club_requests')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select(LIST_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw fail('Request not found or already decided.', 404, 'not_found');
  return data;
}

// A waiting order goes with its request (cancelled / rejected); a paid one stays paid.
async function cancelOrder(orderId) {
  const { data } = await supabase.from('plan_payments').update({ status: 'cancelled' }).eq('id', orderId).eq('status', 'pending').select('id, promo_code_id');
  if (data?.some((o) => o.promo_code_id)) await require('./promo').release(data.map((o) => o.id)).catch(() => {});
}

// ---- the owner's side ----------------------------------------------------------------

// What the requester's account allows today: shown next to each request.
async function accountCheck(userId) {
  const plan = await require('./plan').getPlan(userId, { fresh: true });
  return {
    tier: plan.tier,
    trial: plan.trial,
    active_paid: plan.active_paid,
    clubs_owned: plan.clubs_owned,
    club_limit: plan.club_limit,
    pending_payment: plan.pending_payments?.tier || null,
  };
}

async function list({ status = 'pending', page = 1, size = 20 } = {}) {
  let q = supabase.from('club_requests').select(`${LIST_FIELDS}, user_id, decided_by, users(email, username)`, { count: 'exact' });
  if (status !== 'all') q = q.eq('status', status);
  const from = (Math.max(1, page) - 1) * size;
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + size - 1);
  if (error) throw error;
  const items = await Promise.all(
    (await withPayments(data || [])).map(async (r) => ({
      ...r,
      email: r.users?.email || null,
      username: r.users?.username || null,
      users: undefined,
      account: r.status === 'pending' ? await accountCheck(r.user_id).catch(() => null) : null,
    }))
  );
  const { count: pending } = await supabase.from('club_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  return { items, total: count || 0, pending: pending || 0, page, size };
}

async function detail(id) {
  const { data, error } = await supabase.from('club_requests').select('*, users(email, username)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw fail('Request not found.', 404, 'not_found');
  const [withPay] = await withPayments([data]);
  return { ...withPay, email: data.users?.email || null, username: data.users?.username || null, users: undefined, account: await accountCheck(data.user_id).catch(() => null) };
}

async function decide(id, decision, { actor, note, confirmPayment = false }) {
  const { data: r, error } = await supabase.from('club_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!r) throw fail('Request not found.', 404, 'not_found');
  if (r.status !== 'pending') throw fail(`This request is already ${r.status}.`, 409, 'already_decided');
  const owner_note = text(note, 500);
  const now = new Date().toISOString();
  const { data: order } = r.payment_id ? await supabase.from('plan_payments').select('*').eq('id', r.payment_id).maybeSingle() : { data: null };
  if (decision === 'reject') {
    if (order?.status === 'pending') await cancelOrder(order.id);
    const { data, error: e } = await supabase.from('club_requests').update({ status: 'rejected', owner_note, decided_at: now, decided_by: actor }).eq('id', id).eq('status', 'pending').select(LIST_FIELDS).single();
    if (e) throw e;
    // Money already received for a rejected club is paid back by hand.
    return { request: data, refund_needed: order?.status === 'paid' };
  }
  // Approve: only once the plan is paid (the owner may confirm the transfer here too).
  if (order?.status === 'pending') {
    if (!confirmPayment) throw fail('The plan for this club is not paid yet.', 409, 'payment_pending');
    await billing.confirmOrder(order.id, actor);
  }
  const account = await accountCheck(r.user_id);
  if (account.tier === 'free' || account.trial) {
    throw fail('This account has no paid plan for the club: the transfer code must be paid first.', 409, 'payment_missing');
  }
  if (account.tier !== 'free' && account.club_limit != null && account.clubs_owned >= account.club_limit) {
    throw fail(`The ${account.tier} plan of this account allows ${account.club_limit} club(s) and it has ${account.clubs_owned}.`, 409, 'club_limit');
  }
  const { data: club, error: cErr } = await supabase
    .from('clubs')
    .insert({
      host_id: r.user_id,
      name: r.name,
      kind: r.kind || 'club',
      description: r.description,
      sport: r.sport,
      country: r.country,
      province: r.province,
      district: r.district,
      address: r.address,
      schedule: r.schedule,
      member_count_hint: r.member_count,
      contact_email: r.contact_email,
      avatar_version: r.avatar ? 1 : null,
      cover_version: r.cover ? 1 : null,
    })
    .select()
    .single();
  if (cErr) throw cErr;
  if (r.avatar || r.cover) {
    const { error: iErr } = await supabase.from('club_images').insert({ club_id: club.id, avatar: r.avatar, cover: r.cover });
    if (iErr) console.error('club images copy failed', iErr);
  }
  const { data, error: uErr } = await supabase
    .from('club_requests')
    .update({ status: 'approved', owner_note, decided_at: now, decided_by: actor, club_id: club.id })
    .eq('id', id)
    .select(LIST_FIELDS)
    .single();
  if (uErr) throw uErr;
  require('./plan').forgetPlan(r.user_id);
  return { request: data, club };
}

module.exports = { MIGRATION, ready, renewPayment, suggestTier, cleanProfile, cleanImage, cleanRequest, mine, create, cancel, list, detail, decide, MAX_AVATAR, MAX_COVER };
