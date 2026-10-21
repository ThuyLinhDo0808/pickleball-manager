// Đăng ký nhanh bằng link mời (kèo xé vé), without an account:
//
//   1. The Host turns on the invite for a kèo. Its link changes every 30 seconds (an HMAC of
//      the kèo and the current 30-second window), so a link that leaks stops working at once;
//      the one just before still opens (up to ~60 s in all) so a scan at the turn works.
//   2. Opening a live link gives a 30-minute form pass (signed with the same secret).
//   3. With the pass the player sends their contact (name, gender, phone — or "I'll contact
//      the Host" when the Host left a contact phone — self-reported level) and N slots.
//   4. Info check, as for a normal sign-up: the group waits as a request ('requested', no
//      place held yet); the Host checks who they are and approves the whole group at once
//      (or declines it). A kèo with "auto approve" skips this step.
//   5. Approved: every slot is held on the main list, the total (fee × N) is transferred once
//      with one payment note; the player uploads the screenshot on the booking page (a secret
//      link only they get), the Host confirms the money once and the group is on the list.
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

async function freePlaces(event, groupId = null) {
  const { count, error } = await supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', event.id).in('status', HOLDS_PLACE);
  if (error) throw error;
  const total = Math.max((event.slots || 0) - (count || 0), 0);
  // Kèo with time groups: the group's own places too.
  const g = groupId ? require('./eventGroups').groupOf(event, groupId) : null;
  if (!g) return total;
  const taken = (await require('./eventGroups').takenByGroup(event))[g.id] || 0;
  return Math.min(total, Math.max(g.slots - taken, 0));
}

async function clubBits(event) {
  if (!event.club_id) return { club_name: null, sport: 'pickleball' };
  const { data } = await supabase.from('clubs').select('name').eq('id', event.club_id).maybeSingle();
  return { club_name: data?.name || null, sport: await require('./sport').clubSport(event.club_id).catch(() => 'pickleball') };
}

// Migration 20261210090000: the Host's contact phone (Tài khoản), shown to players.
async function contactReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes('20261210090000_host_contact_phone.sql');
}
// Who to call about this kèo (joining without leaving a phone, passing a ticket on).
async function hostContact(event) {
  if (!event.host_id || !(await contactReady())) return null;
  const { data } = await supabase.from('users').select('full_name, username, contact_phone').eq('id', event.host_id).maybeSingle();
  if (!data?.contact_phone) return null;
  const { data: prof } = data.full_name ? { data: null } : await supabase.from('player_profiles').select('full_name').eq('user_id', event.host_id).maybeSingle();
  return { name: data.full_name || prof?.full_name || data.username || null, phone: data.contact_phone };
}

const summary = async (event) => ({
  ...(await clubBits(event)),
  host_contact: await hostContact(event),
  // The Host checks the players' info before they pay (unless the kèo is on auto approve).
  info_check: !event.auto_approve,
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
  groups: await require('./eventGroups').publicGroups(event).catch(() => null),
  max_slots: MAX_SLOTS,
});

// "Đăng ký nhanh" from the public event page (code 'p-<public token>'): anyone with the
// event's public link may book quickly while its public sign-up is on. Those passes are
// signed with a server key (no invite needed).
const PUBLIC_PREFIX = 'p-';
function publicSecret(eventId) {
  const key = process.env.QUICK_PASS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'quick-pass';
  return sign(key, `quick-public:${eventId}`);
}

// Player opens the link: still live? -> a form pass for 30 minutes.
async function open(eventId, code, now = Date.now()) {
  await assertReady();
  const event = await eventById(eventId);
  const raw = String(code || '');
  let secret;
  if (raw.startsWith(PUBLIC_PREFIX)) {
    if (!event.public_token || raw.slice(PUBLIC_PREFIX.length) !== String(event.public_token) || event.allow_public_registration === false) {
      throw fail('This sign-up link is not valid.', 404, 'not_found');
    }
    secret = publicSecret(event.id);
  } else {
    secret = await secretOf(event.id);
    const w = windowAt(now);
    if (!secret || ![w, w - 1].some((x) => same(raw, codeFor(secret, event.id, x)))) {
      throw fail('This invite link has expired. Ask the organiser for a new one.', 410, 'link_expired');
    }
  }
  assertTaking(event);
  const exp = now + PASS_MS;
  return { pass: `${exp}.${sign(secret, `pass:${event.id}:${exp}`)}`, pass_expires_at: new Date(exp).toISOString(), event: await summary(event) };
}

async function checkPass(event, pass, now = Date.now()) {
  const [exp, mac] = String(pass || '').split('.');
  const secrets = [await secretOf(event.id), event.allow_public_registration === false ? null : publicSecret(event.id)].filter(Boolean);
  if (!mac || !(Number(exp) > now) || !secrets.some((secret) => same(mac, sign(secret, `pass:${event.id}:${exp}`)))) {
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

// Migration 20261208090000: the contact's gender, no phone needed, the booking kept on a
// signed-in player's account.
async function extrasReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes('20261208090000_event_extras.sql');
}

// Contact + slots -> N held places, one payment. Returns the booking's secret access token.
// `userId`: the signed-in player booking (optional) — slot 1 (themselves) goes on their
// account, so their ticket / QR is on their player page whenever they come back.
async function book(eventId, body, userId = null) {
  await assertReady();
  const event = await eventById(eventId);
  await checkPass(event, body?.pass);
  assertTaking(event);
  const contact = body?.contact || {};
  const name = cleanName(contact.full_name, 'name_required');
  const extras = await extrasReady();
  const phone = String(contact.phone || '').trim();
  if (phone && (normalizePhone(phone).length < 9 || phone.length > 20)) throw fail('A valid phone number is required.', 400, 'phone_required');
  // The phone is optional: without it the player contacts the Host themselves (the Host's
  // contact phone — Tài khoản → Thông tin tài khoản — is shown on the form and booking page).
  if (!phone) {
    if (!extras) throw fail('A valid phone number is required.', 400, 'phone_required');
    if (contact.no_phone !== true) throw fail('Leave a phone number, or choose to contact the organiser yourself.', 400, 'phone_or_contact');
  }
  const contactGender = ['male', 'female'].includes(contact.gender) ? contact.gender : null;
  const meFirst = body?.me_first !== false;
  // Pickleball: no self-typed DUPR score (only the DUPR ID); badminton keeps its level (cấp).
  const typedLevel = (await clubBits(event)).sport === 'badminton';
  const contactLevel = typedLevel ? cleanLevel(contact.dupr_level) : null;
  const withDupr = await duprIdReady();
  const contactDupr = withDupr ? cleanDupr(contact.dupr_id) : null;
  const raw = Array.isArray(body?.slots) ? body.slots : [];
  if (!raw.length) throw fail('Add at least one player.', 400, 'no_slots');
  if (raw.length > MAX_SLOTS) throw fail(`At most ${MAX_SLOTS} players at once.`, 400, 'too_many_slots');
  const slots = raw.map((s, i) => ({
    full_name: cleanName(s?.full_name, 'slot_name_required'),
    gender: ['male', 'female'].includes(s?.gender) ? s.gender : i === 0 && meFirst ? contactGender : null,
    dupr_level: typedLevel ? cleanLevel(s?.dupr_level) : null,
    dupr_id: withDupr ? cleanDupr(s?.dupr_id) : null,
  }));
  await require('./moderation').assertCanJoin(event, { phone: phone || null, userId }); // blocked by this Host / club
  const mine = userId && meFirst && extras ? userId : null;
  if (mine) {
    const { data: already } = await supabase.from('event_participants').select('id').eq('event_id', event.id).eq('user_id', mine).neq('status', 'cancelled').limit(1);
    if (already?.length) throw fail('You are already on this kèo.', 409, 'already_registered');
  }
  await require('./signup').expireHolds(event);
  // Kèo with time groups: the whole booking plays in the one group picked.
  const tg = require('./eventGroups').pickGroup(event, body?.group_id);
  const free = await freePlaces(event, tg?.id);
  if (slots.length > free) throw fail(`Only ${free} place(s) left.`, 409, 'not_enough_places', { free });

  const fee = Number((tg ? tg.fee_amount : event.fee_amount) || 0);
  const check = !event.auto_approve;
  const token = crypto.randomBytes(24).toString('base64url');
  const { data: booking, error } = await supabase
    .from('event_guest_bookings')
    .insert({ event_id: event.id, token_hash: hashToken(token), contact_name: name, contact_phone: phone || null, contact_level: contactLevel, ...(withDupr ? { contact_dupr_id: contactDupr } : {}), ...(extras ? { contact_gender: contactGender, user_id: userId || null } : {}), slots: slots.length, amount: fee * slots.length })
    .select()
    .single();
  if (error) throw error;
  const paid = fee > 0;
  const ref = paid ? newPaymentRef() : null;
  const hold = new Date(Date.now() + require('./attendance').approvedHoldMs(event)).toISOString();
  const at = Date.now();
  const rows = slots.map((s, i) => ({
    event_id: event.id,
    joined_at: new Date(at + i).toISOString(), // keeps the slots in the order they were typed
    full_name: s.full_name,
    gender: s.gender,
    dupr_level: s.dupr_level,
    ...(withDupr ? { dupr_id: s.dupr_id } : {}),
    phone: i === 0 ? phone || null : null, // the contact's number, on the first slot
    ...(i === 0 && mine ? { user_id: mine } : {}),
    kind: 'guest',
    guest_booking_id: booking.id,
    fee_amount: fee,
    ...(tg ? { group_id: tg.id } : {}),
    ...(check ? { status: 'requested' } : paid ? { status: 'pending', payment_status: 'awaiting_proof', payment_ref: ref, hold_expires_at: hold } : { status: 'registered' }),
  }));
  const { error: pErr } = await supabase.from('event_participants').insert(rows);
  if (pErr) {
    await supabase.from('event_guest_bookings').delete().eq('id', booking.id);
    throw pErr;
  }
  if (check) {
    Promise.resolve(require('./notify').notifySignupRequest(event, { ...rows[0], full_name: `${name} (${rows.length} slot)` })).catch(() => {});
    return { token, booking: await view(event, booking) };
  }
  // Many bookings at the same moment can all see the last places free: re-count after the
  // insert, and if this group went past the limit, take it back.
  const { data: holders } = await supabase.from('event_participants').select('id, guest_booking_id, group_id, joined_at').eq('event_id', event.id).in('status', HOLDS_PLACE).order('joined_at', { ascending: true }).order('id', { ascending: true });
  const over = (holders || []).slice(event.slots || 0).some((h) => h.guest_booking_id === booking.id)
    || (tg && (holders || []).filter((h) => h.group_id === tg.id).slice(tg.slots).some((h) => h.guest_booking_id === booking.id));
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
function timesOf(event, row) {
  const g = require('./eventGroups').groupOf(event, row?.group_id);
  return g ? { start_time: g.start_time, end_time: g.end_time, courts: g.courts || null } : { start_time: event.start_time, end_time: event.end_time };
}

async function view(event, booking) {
  await require('./signup').expireHolds(event).catch(() => null);
  const rows = await rowsOf(booking);
  const live = rows.filter((r) => r.status !== 'cancelled');
  const pending = live.filter((r) => r.status === 'pending');
  // Waiting for the Host's info check; declined by the Host = cancelled by the Host.
  const declined = !live.length && rows.some((r) => r.status === 'cancelled' && r.cancelled_by === 'host' && !r.payment_ref);
  const state = live.some((r) => r.status === 'requested') ? 'requested' : !live.length ? (declined ? 'declined' : 'cancelled') : pending.length ? (pending.some((r) => r.payment_status === 'rejected') ? 'rejected' : pending.some((r) => r.payment_status === 'proof_submitted') ? 'proof_submitted' : 'awaiting_proof') : 'confirmed';
  const amount = live.reduce((s, r) => s + Number(r.fee_amount ?? event.fee_amount ?? 0), 0);
  // Play is over: no more tickets; the booker (slot 1) gets the session review instead.
  const ended = !!event.event_date && require('./attendance').eventEndMs(event) <= Date.now();
  let review = null;
  if (ended && state === 'confirmed') {
    const first = live.find((r) => require('./survey').PLAYED.includes(r.status));
    review = first ? await require('./survey').surveyFor(event, first).catch(() => null) : null;
  }
  const out = {
    state: ended && state === 'confirmed' ? 'ended' : state,
    ended,
    review,
    // Kèo with time groups: the hours (and courts) of the group booked.
    event: { ...(await clubBits(event)), id: event.id, title: event.title, event_date: event.event_date, ...timesOf(event, rows[0]), location: event.location, map_url: event.map_url },
    contact: { full_name: booking.contact_name, phone: booking.contact_phone, gender: booking.contact_gender || null, dupr_level: booking.contact_level, dupr_id: booking.contact_dupr_id || null },
    slots: rows.map((r) => ({ full_name: r.full_name, gender: r.gender, dupr_level: r.dupr_level, dupr_id: r.dupr_id || null, status: r.status, ticket_code: !ended && ['registered', 'checked_in'].includes(r.status) ? r.ticket_code : null })),
    amount,
    hold_expires_at: pending[0]?.hold_expires_at || null,
    host_contact: await hostContact(event),
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

// Host side: the other slots of the same booking at the same step (waiting for the money,
// or waiting for the info check).
async function pendingSiblings(participant) {
  if (!participant.guest_booking_id || !['pending', 'requested'].includes(participant.status)) return [];
  const { data, error } = await supabase.from('event_participants').select('*').eq('guest_booking_id', participant.guest_booking_id).eq('status', participant.status).neq('id', participant.id);
  if (error) throw error;
  return data || [];
}

// Host approves a quick booking's info check: the whole group gets places together (or none
// when there is not room for all), with one payment note for the one transfer.
async function approveGroup(event, prior) {
  const others = await pendingSiblings(prior);
  const group = [prior, ...others];
  await require('./signup').expireHolds(event);
  const free = await freePlaces(event, prior.group_id);
  if (group.length > free) throw fail(`This booking has ${group.length} players but only ${free} place(s) are left.`, 409, 'full');
  // Paid kèo: the group waits for its one transfer (until 12 hours before the start, like an approved sign-up);
  // a free kèo: straight on the list.
  const fee = Number(prior.fee_amount ?? event.fee_amount ?? 0);
  const patch = fee > 0
    ? { status: 'pending', payment_status: 'awaiting_proof', payment_ref: newPaymentRef(), hold_expires_at: new Date(Date.now() + require('./attendance').approvedHoldMs(event)).toISOString() }
    : { status: 'registered', hold_expires_at: null };
  const { data: rows, error } = await supabase.from('event_participants').update(patch).in('id', group.map((p) => p.id)).eq('status', 'requested').select();
  if (error) throw error;
  if (patch.status === 'registered') for (const r of rows || []) await require('./guests').ensureGuestMember(event, r).catch(() => null);
  const out = (rows || []).find((r) => r.id === prior.id) || rows?.[0] || prior;
  const notify = require('./notify');
  for (const r of rows || []) if (r.user_id) Promise.resolve(notify.notifyApproved(event, r)).catch(() => {});
  return group.length > 1 ? { ...out, group_count: group.length } : out;
}

// Host's participant list: the booking each grouped slot belongs to.
async function bookingsFor(rows) {
  const ids = [...new Set(rows.map((r) => r.guest_booking_id).filter(Boolean))];
  if (!ids.length || !(await ready())) return new Map();
  const { data } = await supabase.from('event_guest_bookings').select('id, contact_name, contact_phone, contact_level, slots, amount, created_at').in('id', ids);
  return new Map((data || []).map((b) => [b.id, b]));
}

// A signed-in player's quick bookings (last 60 days + coming): each with its slots and tickets.
async function bookingsOfUser(userId) {
  if (!(await extrasReady())) return [];
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('event_guest_bookings').select('*, events!inner(id, title, event_date, start_time, end_time, location, map_url, club_id)').eq('user_id', userId).gte('events.event_date', since).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  const out = [];
  for (const b of data || []) {
    const { events: ev, ...booking } = b;
    out.push({ id: booking.id, created_at: booking.created_at, ...(await view(ev, booking)) });
  }
  return out;
}

module.exports = { approveGroup, hostContact, bookingsOfUser, MIGRATION, WINDOW_MS, MAX_SLOTS, ready, currentInvite, setInvite, open, book, bookingByToken, view, submitProof, pendingSiblings, bookingsFor, codeFor, windowAt };
