// Đăng ký nhanh bằng link mời (kèo xé vé), without an account:
//
//   1. The Host turns on the invite for a kèo. Its link changes every 30 seconds (an HMAC of
//      the kèo and the current 30-second window), so a link that leaks stops working at once;
//      the one just before still opens (up to ~60 s in all) so a scan at the turn works.
//   2. Opening a live link gives a 30-minute form pass (signed with the same secret).
//   3. With the pass the player sends their contact (name, phone, self-reported level) and N
//      slots (name, gender, level each). No info check: every slot is held on the main list
//      for 30 minutes, the total (fee × N) is transferred once, with one payment note.
//   4. The player uploads the screenshot on the booking page (a secret link only they get);
//      the Host confirms the money once and the whole group is on the list (or rejects it).
//
// Turning the invite off (or making a new one) changes the secret: every link and open pass
// stops working. Bookings already made keep their own access link.
const crypto = require('crypto');
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { HOLDS_PLACE } = require('./fees');
const { newPaymentRef, vietqrUrl } = require('./payment');
const { normalizePhone } = require('./memberships');

const MIGRATION = '20261129090000_quick_guest_booking.sql';
const WINDOW_MS = 30 * 1000; // the link changes this often
const PASS_MS = 30 * 60 * 1000; // time to fill in the form once the link is opened
const HOLD_MS = 30 * 60 * 1000; // time to transfer once the slots are taken
const MAX_SLOTS = 10;
const MAX_PROOF = 400000;

const fail = (message, status, code, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const sign = (secret, msg) => crypto.createHmac('sha256', secret).update(msg).digest('base64url');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}
async function assertReady() {
  if (!(await ready())) throw fail(`Run migration ${MIGRATION} first.`, 409, 'migration_required');
}

async function secretOf(eventId) {
  const { data, error } = await supabase.from('event_quick_invites').select('secret').eq('event_id', eventId).maybeSingle();
  if (error) throw error;
  return data?.secret || null;
}

const windowAt = (now) => Math.floor(now / WINDOW_MS);
const codeFor = (secret, eventId, w) => sign(secret, `link:${eventId}:${w}`).slice(0, 12);

// Host: the link to show right now (and when it changes). null = invite off.
async function currentInvite(event, now = Date.now()) {
  await assertReady();
  const secret = await secretOf(event.id);
  if (!secret) return { enabled: false };
  const w = windowAt(now);
  const code = codeFor(secret, event.id, w);
  return { enabled: true, code, path: `/g/${event.id}/${code}`, expires_at: new Date((w + 1) * WINDOW_MS).toISOString(), window_seconds: WINDOW_MS / 1000 };
}

// Host: turn on (a new secret each time — old links and passes die) or off.
async function setInvite(event, on) {
  await assertReady();
  if (!on) {
    const { error } = await supabase.from('event_quick_invites').delete().eq('event_id', event.id);
    if (error) throw error;
    return { enabled: false };
  }
  const secret = crypto.randomBytes(32).toString('hex');
  const { error } = await supabase.from('event_quick_invites').upsert({ event_id: event.id, secret, created_at: new Date().toISOString() }, { onConflict: 'event_id' });
  if (error) throw error;
  return currentInvite(event);
}

// The kèo is taking sign-ups at all (the invite works even when the public link is off).
function assertTaking(event) {
  if (!['draft', 'open'].includes(event.status)) throw fail('Registration is not open for this event.', 403, 'not_open');
  if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) throw fail('The registration deadline has passed.', 403, 'deadline');
  if (event.kind === 'meeting') throw fail('Meetings use the vote link.', 400, 'meeting');
}

async function eventById(eventId) {
  const { data, error } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
  if (error) throw error;
  if (!data) throw fail('Event not found.', 404, 'not_found');
  return data;
}

async function freePlaces(event) {
  const { count, error } = await supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', event.id).in('status', HOLDS_PLACE);
  if (error) throw error;
  return Math.max((event.slots || 0) - (count || 0), 0);
}

async function clubBits(event) {
  if (!event.club_id) return { club_name: null, sport: 'pickleball' };
  const { data } = await supabase.from('clubs').select('name').eq('id', event.club_id).maybeSingle();
  return { club_name: data?.name || null, sport: await require('./sport').clubSport(event.club_id).catch(() => 'pickleball') };
}

const summary = async (event) => ({
  ...(await clubBits(event)),
  id: event.id,
  title: event.title,
  event_date: event.event_date,
  start_time: event.start_time,
  end_time: event.end_time,
  location: event.location,
  map_url: event.map_url,
  fee: Number(event.fee_amount || 0),
  level_min: event.level_min,
  level_max: event.level_max,
  level_min_f: event.level_min_f ?? null,
  level_max_f: event.level_max_f ?? null,
  free_places: await freePlaces(event),
  max_slots: MAX_SLOTS,
});

// Player opens the link: still live? -> a form pass for 30 minutes.
async function open(eventId, code, now = Date.now()) {
  await assertReady();
  const event = await eventById(eventId);
  const secret = await secretOf(event.id);
  const w = windowAt(now);
  if (!secret || ![w, w - 1].some((x) => same(String(code || ''), codeFor(secret, event.id, x)))) {
    throw fail('This invite link has expired. Ask the organiser for a new one.', 410, 'link_expired');
  }
  assertTaking(event);
  const exp = now + PASS_MS;
  return { pass: `${exp}.${sign(secret, `pass:${event.id}:${exp}`)}`, pass_expires_at: new Date(exp).toISOString(), event: await summary(event) };
}

async function checkPass(event, pass, now = Date.now()) {
  const secret = await secretOf(event.id);
  const [exp, mac] = String(pass || '').split('.');
  if (!secret || !mac || !(Number(exp) > now) || !same(mac, sign(secret, `pass:${event.id}:${exp}`))) {
    throw fail('The time to fill in the form is over, or the invite was turned off. Open a new invite link.', 410, 'pass_expired');
  }
}

const cleanLevel = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!(n >= 1 && n <= 8)) throw fail('Level must be from 1.00 to 8.00.', 400, 'bad_level');
  return Math.round(n * 100) / 100;
};
// Optional DUPR ID (only for players who want their matches sent to DUPR). Before migration
// 20261130090000_dupr_shared.sql it is ignored.
async function duprIdReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes('20261130090000_dupr_shared.sql');
}
const cleanDupr = (v) => {
  try {
    return require('./dupr').cleanId(v);
  } catch {
    throw fail('A DUPR ID is 4-10 letters or digits (DUPR app → share → Copy DUPR ID). Leave it empty if you do not want DUPR.', 400, 'bad_dupr_id');
  }
};
const cleanName = (v, code) => {
  const s = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!s) throw fail('Every player needs a name.', 400, code);
  return s;
};

// Contact + slots -> N held places, one payment. Returns the booking's secret access token.
async function book(eventId, body) {
  await assertReady();
  const event = await eventById(eventId);
  await checkPass(event, body?.pass);
  assertTaking(event);
  const contact = body?.contact || {};
  const name = cleanName(contact.full_name, 'name_required');
  const phone = String(contact.phone || '').trim();
  if (normalizePhone(phone).length < 9 || phone.length > 20) throw fail('A valid phone number is required.', 400, 'phone_required');
  const contactLevel = cleanLevel(contact.dupr_level);
  const withDupr = await duprIdReady();
  const contactDupr = withDupr ? cleanDupr(contact.dupr_id) : null;
  const raw = Array.isArray(body?.slots) ? body.slots : [];
  if (!raw.length) throw fail('Add at least one player.', 400, 'no_slots');
  if (raw.length > MAX_SLOTS) throw fail(`At most ${MAX_SLOTS} players at once.`, 400, 'too_many_slots');
  const slots = raw.map((s) => ({
    full_name: cleanName(s?.full_name, 'slot_name_required'),
    gender: ['male', 'female'].includes(s?.gender) ? s.gender : null,
    dupr_level: cleanLevel(s?.dupr_level),
    dupr_id: withDupr ? cleanDupr(s?.dupr_id) : null,
  }));
  await require('./moderation').assertCanJoin(event, { phone }); // blocked by this Host / club
  await require('./signup').expireHolds(event);
  const free = await freePlaces(event);
  if (slots.length > free) throw fail(`Only ${free} place(s) left.`, 409, 'not_enough_places', { free });

  const fee = Number(event.fee_amount || 0);
  const token = crypto.randomBytes(24).toString('base64url');
  const { data: booking, error } = await supabase
    .from('event_guest_bookings')
    .insert({ event_id: event.id, token_hash: hashToken(token), contact_name: name, contact_phone: phone, contact_level: contactLevel, ...(withDupr ? { contact_dupr_id: contactDupr } : {}), slots: slots.length, amount: fee * slots.length })
    .select()
    .single();
  if (error) throw error;
  const paid = fee > 0;
  const ref = paid ? newPaymentRef() : null;
  const hold = new Date(Date.now() + HOLD_MS).toISOString();
  const at = Date.now();
  const rows = slots.map((s, i) => ({
    event_id: event.id,
    joined_at: new Date(at + i).toISOString(), // keeps the slots in the order they were typed
    full_name: s.full_name,
    gender: s.gender,
    dupr_level: s.dupr_level,
    ...(withDupr ? { dupr_id: s.dupr_id } : {}),
    phone: i === 0 ? phone : null, // the contact's number, on the first slot
    kind: 'guest',
    guest_booking_id: booking.id,
    fee_amount: fee,
    ...(paid ? { status: 'pending', payment_status: 'awaiting_proof', payment_ref: ref, hold_expires_at: hold } : { status: 'registered' }),
  }));
  const { error: pErr } = await supabase.from('event_participants').insert(rows);
  if (pErr) {
    await supabase.from('event_guest_bookings').delete().eq('id', booking.id);
    throw pErr;
  }
  // Many bookings at the same moment can all see the last places free: re-count after the
  // insert, and if this group went past the limit, take it back.
  const { data: holders } = await supabase.from('event_participants').select('id, guest_booking_id, joined_at').eq('event_id', event.id).in('status', HOLDS_PLACE).order('joined_at', { ascending: true }).order('id', { ascending: true });
  const over = (holders || []).slice(event.slots || 0).some((h) => h.guest_booking_id === booking.id);
  if (over) {
    await supabase.from('event_participants').delete().eq('guest_booking_id', booking.id);
    await supabase.from('event_guest_bookings').delete().eq('id', booking.id);
    throw fail('Those places were just taken. Try fewer players.', 409, 'not_enough_places', { free: await freePlaces(event) });
  }
  return { token, booking: await view(event, booking) };
}

async function bookingByToken(token) {
  await assertReady();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) throw fail('Booking not found.', 404, 'not_found');
  const { data, error } = await supabase.from('event_guest_bookings').select('*').eq('token_hash', hashToken(token)).maybeSingle();
  if (error) throw error;
  if (!data) throw fail('Booking not found.', 404, 'not_found');
  return { booking: data, event: await eventById(data.event_id) };
}

async function rowsOf(booking) {
  const { data, error } = await supabase.from('event_participants').select('*').eq('guest_booking_id', booking.id).order('joined_at', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

// What the booking page shows (only this booking's own data).
async function view(event, booking) {
  await require('./signup').expireHolds(event).catch(() => null);
  const rows = await rowsOf(booking);
  const live = rows.filter((r) => r.status !== 'cancelled');
  const pending = live.filter((r) => r.status === 'pending');
  const state = !live.length ? 'cancelled' : pending.length ? (pending.some((r) => r.payment_status === 'rejected') ? 'rejected' : pending.some((r) => r.payment_status === 'proof_submitted') ? 'proof_submitted' : 'awaiting_proof') : 'confirmed';
  const amount = live.reduce((s, r) => s + Number(r.fee_amount ?? event.fee_amount ?? 0), 0);
  const out = {
    state,
    event: { ...(await clubBits(event)), id: event.id, title: event.title, event_date: event.event_date, start_time: event.start_time, end_time: event.end_time, location: event.location, map_url: event.map_url },
    contact: { full_name: booking.contact_name, phone: booking.contact_phone, dupr_level: booking.contact_level, dupr_id: booking.contact_dupr_id || null },
    slots: rows.map((r) => ({ full_name: r.full_name, gender: r.gender, dupr_level: r.dupr_level, dupr_id: r.dupr_id || null, status: r.status, ticket_code: ['registered', 'checked_in'].includes(r.status) ? r.ticket_code : null })),
    amount,
    hold_expires_at: pending[0]?.hold_expires_at || null,
    payment_note: pending.find((r) => r.payment_status === 'rejected')?.payment_note || null,
  };
  if (pending.length) {
    const { bank, qr_image } = await require('./signup').payeeFor(event);
    const ref = pending[0].payment_ref;
    out.payment = { ref, amount, bank, qr_url: bank ? vietqrUrl({ bank_code: bank.code, bank_account: bank.account, bank_holder: bank.holder }, amount, ref) : null, qr_image };
  }
  return out;
}

// Transfer screenshot for the whole group.
async function submitProof(token, image) {
  const { booking, event } = await bookingByToken(token);
  if (!(typeof image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(image) && image.length <= MAX_PROOF)) {
    throw fail('Upload a JPEG/PNG/WebP screenshot (it is resized automatically).', 400, 'bad_image');
  }
  await require('./signup').expireHolds(event);
  const pending = (await rowsOf(booking)).filter((r) => r.status === 'pending');
  if (!pending.length) throw fail('There is no payment waiting for this booking.', 409, 'not_pending');
  const { error } = await supabase
    .from('event_participants')
    .update({ payment_proof: image, payment_status: 'proof_submitted', payment_submitted_at: new Date().toISOString(), payment_note: null, hold_expires_at: null })
    .in('id', pending.map((r) => r.id));
  if (error) throw error;
  const amount = pending.reduce((s, r) => s + Number(r.fee_amount ?? event.fee_amount ?? 0), 0);
  require('./notify').notifyPaymentSubmitted(event, { ...pending[0], full_name: `${booking.contact_name} (${pending.length} slot)` }, amount);
  return view(event, booking);
}

// Host side: the other slots of the same booking still waiting for the money.
async function pendingSiblings(participant) {
  if (!participant.guest_booking_id) return [];
  const { data, error } = await supabase.from('event_participants').select('*').eq('guest_booking_id', participant.guest_booking_id).eq('status', 'pending').neq('id', participant.id);
  if (error) throw error;
  return data || [];
}

// Host's participant list: the booking each grouped slot belongs to.
async function bookingsFor(rows) {
  const ids = [...new Set(rows.map((r) => r.guest_booking_id).filter(Boolean))];
  if (!ids.length || !(await ready())) return new Map();
  const { data } = await supabase.from('event_guest_bookings').select('id, contact_name, contact_phone, contact_level, slots, amount, created_at').in('id', ids);
  return new Map((data || []).map((b) => [b.id, b]));
}

module.exports = { MIGRATION, WINDOW_MS, MAX_SLOTS, ready, currentInvite, setInvite, open, book, bookingByToken, view, submitProof, pendingSiblings, bookingsFor, codeFor, windowAt };
