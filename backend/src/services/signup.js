// Online sign-up for an event (always by a signed-in player):
//
//   member  = the account is linked to a club member the Host verified. With a pass that
//             covers the day they're in straight away (the session is used at check-in).
//   guest   = everyone else. With a fee they get a 30-minute hold ('pending'), transfer
//             the money, upload the screenshot; the Host confirms -> 'registered' + ticket.
//
// Every registration has a ticket_code; its QR ("PBT:<code>") is what gets scanned at the court.
const { supabase } = require('../supabase');
const { normalizePhone } = require('./memberships');
const { newPaymentRef, vietqrUrl } = require('./payment');
const { HOLDS_PLACE, feeFor, memberStanding, needsOnlinePayment } = require('./fees');
const { promoteNext } = require('./attendance');
const { perksFor, ensureGuestMember } = require('./guests');
const { clubSport, profileLevel } = require('./sport');
const { notifyPaymentConfirmed, notifyPaymentRejected, notifyPaymentSubmitted, notifySignupRequest } = require('./notify');

const NEW_HOLD_MS = 30 * 60 * 1000; // time to transfer + upload after pressing "register"
const MIN_PAY_LATER_MS = 30 * 60 * 1000; // "pay later" only when it gives more time than that
const REJECTED_HOLD_MS = 2 * 3600 * 1000; // time to send a better screenshot
const ACTIVE = [...HOLDS_PLACE, 'waitlisted', 'requested', 'not_playing'];

// Does this sign-up wait for the Host to check the player first?
//  * Clubs: yes unless the event approves automatically, or the player is a verified member.
//  * Communities (Social Manager): always — regulars, drop-ins and newcomers alike wait for
//    the Host to check their details, then transfer, then the Host confirms the money.
//    Only with "Tự xác nhận theo DUPR" on (community settings) is a player whose DUPR is
//    verified (from the club's DUPR list or entered by the Host from DUPR — not a score the
//    player typed) and inside the kèo's level range let through to the payment step.
async function needsApproval(event, standing, userId) {
  if (!event.club_id) return !event.auto_approve;
  const { data: club } = await supabase.from('clubs').select('kind, sport').eq('id', event.club_id).maybeSingle();
  if ((club?.kind || 'club') !== 'community') return !event.auto_approve && standing?.state !== 'verified';
  if ((club.sport || 'pickleball') !== 'pickleball') return true;
  const settings = await require('./communitySettings').forClub(event.club_id).catch(() => null);
  if (!settings?.signup?.auto_dupr) return true;
  const rating = await verifiedDupr(event.club_id, standing?.member, userId);
  if (rating == null) return true;
  let gender = standing?.member?.gender || null;
  if (!gender && userId) gender = (await supabase.from('player_profiles').select('gender').eq('user_id', userId).maybeSingle()).data?.gender || null;
  return !duprFits(rating, event, gender);
}

// The player's DUPR doubles rating as DUPR has it (not self-entered), or null. The newest one
// any club / community imported for their DUPR ID counts (a DUPR rating is the same everywhere).
async function verifiedDupr(clubId, member, userId) {
  if (member?.dupr_synced_at && member.dupr_doubles != null) return Number(member.dupr_doubles);
  let id = member?.dupr_id || null;
  if (!id && userId) {
    const { data: prof } = await supabase.from('player_profiles').select('dupr_id').eq('user_id', userId).maybeSingle();
    id = prof?.dupr_id || null;
  }
  if (id) {
    const best = (await require('./dupr').latestRatings([id]).catch(() => new Map())).get(id);
    if (best?.doubles != null) return best.doubles;
  }
  return member?.dupr_doubles != null ? Number(member.dupr_doubles) : null; // typed by the Host from the DUPR app
}

// Inside the kèo's level range (no range = any level).
function duprFits(rating, event, gender = null) {
  // Levels split by gender: women use the kèo's women's range when it has one.
  const women = gender === 'female' && (event.level_min_f != null || event.level_max_f != null);
  const lo = women ? event.level_min_f : event.level_min;
  const hi = women ? event.level_max_f : event.level_max;
  if (lo != null && rating < Number(lo)) return false;
  if (hi != null && rating > Number(hi)) return false;
  return true;
}

const MAX_PROOF = 400000;

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

// "Đăng ký, chuyển khoản sau": the place is held until the sign-up deadline, or until
// 12 hours before the start (when the deadline is later or there is none). null = not
// offered (the event turned it off, or there is no more time than a normal hold).
function payLaterUntil(event, now = Date.now()) {
  if (event.allow_pay_later === false) return null;
  const { eventStartMs, PAY_BEFORE_START_MS } = require('./attendance');
  const start = eventStartMs(event);
  const last = Number.isFinite(start) ? start - PAY_BEFORE_START_MS : null;
  const deadline = event.registration_deadline ? Date.parse(event.registration_deadline) : null;
  const until = deadline && (!last || deadline < last) ? deadline : last;
  if (!until || until - now <= MIN_PAY_LATER_MS) return null;
  return new Date(until).toISOString();
}

// Release holds whose owner never sent a screenshot in time; their places go to the waitlist.
async function expireHolds(event) {
  const { data: stale, error } = await supabase
    .from('event_participants')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), payment_note: 'hold_expired' })
    .eq('event_id', event.id)
    .eq('status', 'pending')
    .in('payment_status', ['awaiting_proof', 'rejected'])
    .lt('hold_expires_at', new Date().toISOString())
    .select('id');
  if (error) throw error;
  for (let i = 0; i < (stale || []).length; i++) await promoteNext(event);
  return stale?.length || 0;
}

// Bank account the guest pays into: the club's (club sessions) if set, else the Host's.
async function payeeFor(event) {
  const { data: host } = await supabase
    .from('users')
    .select('bank_code, bank_account, bank_holder, payment_qr_image')
    .eq('id', event.host_id)
    .maybeSingle();
  let bank = host?.bank_account ? { code: host.bank_code, account: host.bank_account, holder: host.bank_holder } : null;
  if (event.club_id) {
    const { data: club } = await supabase.from('clubs').select('bank_code, bank_account, bank_holder').eq('id', event.club_id).maybeSingle();
    if (club?.bank_account) bank = { code: club.bank_code, account: club.bank_account, holder: club.bank_holder };
  }
  return { bank, qr_image: host?.payment_qr_image || null };
}

// What the player's page shows about their own registration (never other people's data).
async function registrationView(event, p) {
  if (!p) return null;
  const amount = feeFor(event, p);
  const view = {
    id: p.id,
    full_name: p.full_name,
    status: p.status,
    kind: p.kind,
    late_cancel: p.late_cancel,
    fee: amount,
    fee_paid: p.fee_paid,
    payment_status: p.payment_status,
    payment_note: p.payment_note,
    payment_submitted_at: p.payment_submitted_at,
    has_proof: !!p.payment_proof,
    hold_expires_at: p.hold_expires_at,
    pay_later: !!p.pay_later,
    // when the place can be held until if the player transfers later (null = not possible)
    pay_later_until: p.status === 'pending' && !p.pay_later && p.payment_status !== 'proof_submitted' ? payLaterUntil(event) : null,
    voucher_discount: p.voucher_id ? p.voucher_discount || 0 : null,
    // The ticket only exists for players who actually have a confirmed place.
    ticket_code: ['registered', 'checked_in'].includes(p.status) ? p.ticket_code : null,
  };
  // On the list but the fee not collected yet (the Host placed them, "thu tiền sau"): what
  // is still owed and where to transfer it (or pay the Host at the court).
  if (['registered', 'checked_in'].includes(p.status) && amount > 0 && (await needsOnlinePayment(event, p))) {
    const { bank, qr_image } = await payeeFor(event);
    const ref = p.payment_ref || null;
    view.owed = { ref, amount, bank, qr_url: bank && ref ? vietqrUrl({ bank_code: bank.code, bank_account: bank.account, bank_holder: bank.holder }, amount, ref) : null, qr_image };
  }
  if (p.status === 'pending') {
    const { bank, qr_image } = await payeeFor(event);
    view.payment = {
      ref: p.payment_ref,
      amount,
      bank,
      qr_url: bank ? vietqrUrl({ bank_code: bank.code, bank_account: bank.account, bank_holder: bank.holder }, amount, p.payment_ref) : null,
      qr_image,
    };
  }
  return view;
}

// The signed-in player's live registration for this event (their own, or via their verified member record).
// Riêng tư — thành viên trước: still only for members (public_from not reached, or none).
function membersOnlyNow(event, now = Date.now()) {
  return !!event?.members_only && (!event.public_from || Date.parse(event.public_from) > now);
}
// A member of the club / community (official, account checked, not just asking to join).
const isMemberStanding = (standing) => standing?.state === 'verified' && standing.member?.is_active !== false && !standing.member?.join_requested;

async function myRegistration(event, userId) {
  const standing = await memberStanding(event, userId);
  const filters = [`user_id.eq.${userId}`];
  if (standing.state === 'verified') filters.push(`source_club_member_id.eq.${standing.member.id}`);
  const { data, error } = await supabase
    .from('event_participants')
    .select('*')
    .eq('event_id', event.id)
    .or(filters.join(','))
    .order('joined_at', { ascending: false });
  if (error) throw error;
  const rank = { checked_in: 0, registered: 1, pending: 2, waitlisted: 3, requested: 4, not_playing: 5, no_show: 6, cancelled: 7 };
  const mine = (data || []).sort((a, b) => rank[a.status] - rank[b.status])[0] || null;
  return { standing, participant: mine };
}

function assertOpen(event) {
  if (!event.allow_public_registration) throw httpError('This event does not take sign-ups via the link.', 403, 'disabled');
  if (!['draft', 'open'].includes(event.status)) throw httpError('Registration is not open for this event.', 403, 'not_open');
  if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
    throw httpError('The registration deadline has passed.', 403, 'deadline');
  }
}

// opts.payLater: hold the place now, transfer later (until the sign-up deadline).
async function registerOnline(event, userId, profile, opts = {}) {
  assertOpen(event);
  // Name + phone are enough to play (the Host calls the name, matches the transfer and
  // the person across sessions); birth date and the rest come later.
  if (!profile?.full_name || normalizePhone(profile.phone).length < 9) {
    throw httpError('Add your name and phone first.', 400, 'profile_required');
  }
  // Blocked by this Host, or suspended ("to review") in this club: no sign-up.
  await require('./moderation').assertCanJoin(event, { userId, phone: profile.phone });
  await expireHolds(event);
  const { standing, participant: existing } = await myRegistration(event, userId);
  if (existing && ACTIVE.includes(existing.status)) throw httpError('You are already registered for this event.', 409, 'already_registered');
  // Riêng tư — thành viên trước: only the club's own members until it opens to everyone.
  if (membersOnlyNow(event) && event.host_id !== userId && !isMemberStanding(standing)) {
    throw Object.assign(httpError('Members of the club sign up first; this session opens to everyone later.', 403, 'members_only'), { public_from: event.public_from || null });
  }
  // Email not confirmed yet: one upcoming place, inside 48 hours.
  await require('./emailVerify').assertCanRegister(userId);

  // Same phone already on the list (e.g. the Host added them by hand).
  const { data: samePhone } = await supabase.from('event_participants').select('phone').eq('event_id', event.id).in('status', ACTIVE);
  if ((samePhone || []).some((p) => normalizePhone(p.phone) === normalizePhone(profile.phone))) {
    throw httpError('This phone number is already registered for this event.', 409, 'duplicate_phone');
  }

  // Kèo with time groups: the player picks one; its places, fee and hours count.
  const group = require('./eventGroups').pickGroup(event, opts.groupId);
  const ev = require('./eventGroups').forGroup(event, group);
  let cq = supabase
    .from('event_participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .in('status', HOLDS_PLACE);
  if (group) cq = cq.eq('group_id', group.id);
  const { count } = await cq;
  const hasPlace = (count || 0) < ev.slots;

  // A pass holder ("VIP") plays on the pass even when listed as a guest.
  const isMember = standing.state === 'verified' || (standing.state === 'guest' && !!standing.pass);
  const row = {
    event_id: event.id,
    user_id: userId,
    full_name: profile.full_name,
    phone: profile.phone,
    dupr_level: profileLevel(profile, await clubSport(event.club_id)),
    kind: isMember ? 'member' : 'guest',
    source_club_member_id: isMember ? standing.member.id : null,
    status: hasPlace ? 'registered' : 'waitlisted',
    ...(group ? { group_id: group.id, fee_amount: group.fee_amount } : {}),
  };
  // The Host checks new players first (level, who they are): no place or payment yet.
  const approval = await needsApproval(event, standing, userId);
  if (approval) row.status = 'requested';
  // Guest perks: priority goes first off the waitlist (+ the % off). Communities: regulars
  // can be priority too.
  if (!isMember || standing.member?.guest_perk) {
    const perks = await perksFor(ev, { userId, phone: profile.phone });
    if (perks.priority) row.priority = true;
    if (perks.fee_amount != null) row.fee_amount = perks.fee_amount;
  }
  // Top-month voucher (communities): free kèo / 50% off, taken off the fee now. Members
  // whose pass covers the session pay nothing, so they keep their voucher.
  let claimed = null;
  if (opts.useVoucher !== false && !(isMember && standing.pass)) {
    claimed = await require('./race').claimVoucher(event, userId, feeFor(event, row)).catch(() => null);
    if (claimed) Object.assign(row, { fee_amount: claimed.fee, voucher_id: claimed.voucher.id, voucher_discount: claimed.discount });
  }
  if (!approval && hasPlace && (await needsOnlinePayment(event, row))) {
    Object.assign(row, {
      status: 'pending',
      payment_status: 'awaiting_proof',
      payment_ref: newPaymentRef(),
      hold_expires_at: new Date(Date.now() + require('./attendance').capHoldMs(event, NEW_HOLD_MS)).toISOString(),
    });
    const later = opts.payLater ? payLaterUntil(event) : null;
    if (later) Object.assign(row, { hold_expires_at: later, pay_later: true });
  }
  let { data, error } = await supabase.from('event_participants').insert(row).select().single();
  if (error) {
    if (claimed) await require('./race').releaseVoucher(claimed.voucher.id);
    throw error;
  }
  // Many people tapping "Đăng ký" at the same moment can all see the last place free.
  // Settle it after the insert: in sign-up order, whoever is past the number of places
  // goes to the waitlist (and pays nothing yet).
  if (HOLDS_PLACE.includes(data.status)) data = (await settleOverbooking(ev, data, group)) || data;
  if (claimed) await require('./race').attachVoucher(claimed.voucher.id, data.id);
  if (data.status === 'registered' && !isMember) await ensureGuestMember(event, data);
  if (data.status === 'requested') notifySignupRequest(event, data); // Host webhook, in the background
  return registrationView(event, data);
}

async function settleOverbooking(event, mine, group = null) {
  let q = supabase
    .from('event_participants')
    .select('id, joined_at')
    .eq('event_id', event.id)
    .in('status', HOLDS_PLACE);
  if (group) q = q.eq('group_id', group.id); // event = the group's view: its places
  const { data: rows, error } = await q
    .order('joined_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(2000);
  if (error || !rows || rows.length <= event.slots) return null;
  const place = rows.findIndex((r) => r.id === mine.id);
  if (place < event.slots) return null;
  const { data } = await supabase
    .from('event_participants')
    .update({ status: 'waitlisted', payment_status: 'none', payment_ref: null, hold_expires_at: null, pay_later: false })
    .eq('id', mine.id)
    .select()
    .single();
  return data || null;
}

// Already holding a place and owing the fee: keep it until the deadline, transfer later.
async function payLater(event, participant) {
  if (participant.status !== 'pending' || participant.payment_status === 'proof_submitted') {
    throw httpError('There is no payment waiting for this registration.', 409, 'not_pending');
  }
  const until = payLaterUntil(event);
  if (!until) throw httpError('Paying later is not possible for this event.', 409, 'pay_later_off');
  const { data, error } = await supabase
    .from('event_participants')
    .update({ pay_later: true, hold_expires_at: until })
    .eq('id', participant.id)
    .select()
    .single();
  if (error) throw error;
  return registrationView(event, data);
}

// Transfer screenshot (small JPEG/PNG/WebP data URL, resized in the browser).
async function submitProof(event, participant, image) {
  if (participant.status !== 'pending') throw httpError('There is no payment waiting for this registration.', 409, 'not_pending');
  if (!(typeof image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(image) && image.length <= MAX_PROOF)) {
    throw httpError('Upload a JPEG/PNG/WebP screenshot (it is resized automatically).', 400, 'bad_image');
  }
  const { data, error } = await supabase
    .from('event_participants')
    .update({ payment_proof: image, payment_status: 'proof_submitted', payment_submitted_at: new Date().toISOString(), payment_note: null, hold_expires_at: null })
    .eq('id', participant.id)
    .select()
    .single();
  if (error) throw error;
  notifyPaymentSubmitted(event, data, feeFor(event, data));
  return registrationView(event, data);
}

// Host: the money arrived (screenshot checked, or paid in cash). Writes the fee into the event's books.
async function confirmPayment(event, participant, hostId) {
  if (!['pending', 'registered', 'checked_in'].includes(participant.status)) {
    throw httpError('Only active registrations can be confirmed.', 409, 'not_active');
  }
  const patch = { payment_status: 'confirmed', payment_note: null, hold_expires_at: null, fee_paid: true };
  if (participant.status === 'pending') patch.status = 'registered';
  const { data, error } = await supabase.from('event_participants').update(patch).eq('id', participant.id).select().single();
  if (error) throw error;
  const amount = feeFor(event, participant);
  if (!participant.fee_paid && amount > 0) {
    const { error: tErr } = await supabase.from('transactions').insert({
      host_id: hostId,
      owner_type: 'event',
      event_id: event.id,
      type: 'income',
      category: 'event_fee',
      amount,
      note: `Fee from ${participant.full_name}`,
    });
    if (tErr) throw tErr;
  }
  if (participant.status === 'pending') notifyPaymentConfirmed(event, data);
  await ensureGuestMember(event, data); // paid and on the list: now on the club's guest list
  return data;
}

// Host: screenshot doesn't match. The place stays held for a while so they can send another.
async function rejectPayment(event, participant, note) {
  if (participant.status !== 'pending') throw httpError('Only registrations waiting for payment can be rejected.', 409, 'not_pending');
  const { data, error } = await supabase
    .from('event_participants')
    .update({ payment_status: 'rejected', payment_note: String(note || '').slice(0, 300) || null, hold_expires_at: new Date(Date.now() + require('./attendance').capHoldMs(event, REJECTED_HOLD_MS)).toISOString() })
    .eq('id', participant.id)
    .select()
    .single();
  if (error) throw error;
  notifyPaymentRejected(event, data, data.payment_note);
  return data;
}

module.exports = {
  membersOnlyNow,
  isMemberStanding,
  expireHolds,
  payeeFor,
  registrationView,
  myRegistration,
  registerOnline,
  submitProof,
  confirmPayment,
  rejectPayment,
  MAX_PROOF,
  needsApproval,
  verifiedDupr,
  duprFits,
  payLaterUntil,
  payLater,
};
