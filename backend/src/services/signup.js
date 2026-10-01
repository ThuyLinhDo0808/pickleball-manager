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
const { notifyPaymentConfirmed, notifyPaymentRejected, notifyPaymentSubmitted } = require('./notify');

const NEW_HOLD_MS = 30 * 60 * 1000; // time to transfer + upload after pressing "register"
const REJECTED_HOLD_MS = 2 * 3600 * 1000; // time to send a better screenshot
const ACTIVE = [...HOLDS_PLACE, 'waitlisted'];
const MAX_PROOF = 400000;

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
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
    // The ticket only exists for players who actually have a confirmed place.
    ticket_code: ['registered', 'checked_in'].includes(p.status) ? p.ticket_code : null,
  };
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
  const rank = { checked_in: 0, registered: 1, pending: 2, waitlisted: 3, no_show: 4, cancelled: 5 };
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

async function registerOnline(event, userId, profile) {
  assertOpen(event);
  if (!profile?.full_name || normalizePhone(profile.phone).length < 9 || !profile.birth_date) {
    throw httpError('Complete your profile (name, phone, birth date) first.', 400, 'profile_required');
  }
  await expireHolds(event);
  const { standing, participant: existing } = await myRegistration(event, userId);
  if (existing && ACTIVE.includes(existing.status)) throw httpError('You are already registered for this event.', 409, 'already_registered');

  // Same phone already on the list (e.g. the Host added them by hand).
  const { data: samePhone } = await supabase.from('event_participants').select('phone').eq('event_id', event.id).in('status', ACTIVE);
  if ((samePhone || []).some((p) => normalizePhone(p.phone) === normalizePhone(profile.phone))) {
    throw httpError('This phone number is already registered for this event.', 409, 'duplicate_phone');
  }

  const { count } = await supabase
    .from('event_participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .in('status', HOLDS_PLACE);
  const hasPlace = (count || 0) < event.slots;

  const isMember = standing.state === 'verified';
  const row = {
    event_id: event.id,
    user_id: userId,
    full_name: profile.full_name,
    phone: profile.phone,
    dupr_level: profileLevel(profile, await clubSport(event.club_id)),
    kind: isMember ? 'member' : 'guest',
    source_club_member_id: isMember ? standing.member.id : null,
    status: hasPlace ? 'registered' : 'waitlisted',
  };
  // Guest perks: VIP pays the club's VIP price; priority/VIP go first off the waitlist.
  if (!isMember) {
    const perks = await perksFor(event, { userId, phone: profile.phone });
    if (perks.priority) row.priority = true;
    if (perks.fee_amount != null) row.fee_amount = perks.fee_amount;
  }
  if (hasPlace && (await needsOnlinePayment(event, row))) {
    Object.assign(row, {
      status: 'pending',
      payment_status: 'awaiting_proof',
      payment_ref: newPaymentRef(),
      hold_expires_at: new Date(Date.now() + NEW_HOLD_MS).toISOString(),
    });
  }
  const { data, error } = await supabase.from('event_participants').insert(row).select().single();
  if (error) throw error;
  if (data.status === 'registered' && !isMember) await ensureGuestMember(event, data);
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
    .update({ payment_status: 'rejected', payment_note: String(note || '').slice(0, 300) || null, hold_expires_at: new Date(Date.now() + REJECTED_HOLD_MS).toISOString() })
    .eq('id', participant.id)
    .select()
    .single();
  if (error) throw error;
  notifyPaymentRejected(event, data, data.payment_note);
  return data;
}

module.exports = {
  expireHolds,
  payeeFor,
  registrationView,
  myRegistration,
  registerOnline,
  submitProof,
  confirmPayment,
  rejectPayment,
  MAX_PROOF,
};
