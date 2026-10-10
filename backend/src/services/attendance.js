const { supabase } = require('../supabase');
const { consumeSession, releaseSession } = require('./memberships');
const { APP_TZ } = require('./stats');
const { notifyPromoted, notifyApproved } = require('./notify');
const { HOLDS_PLACE, needsOnlinePayment } = require('./fees');
const { newPaymentRef } = require('./payment');
const { ensureGuestMember, guestsReady } = require('./guests');

const PROMOTED_HOLD_MS = 2 * 3600 * 1000; // a promoted guest has 2 hours to pay
const APPROVED_HOLD_MS = 12 * 3600 * 1000; // an approved request has 12 hours to pay

const ATTENDANCE_ACTIONS = ['check-in', 'no-show', 'reset'];

// Check-in / no-show / reset (back to registered) for one participant.
// Shared by the Host and by staff (coordinators) so both follow the same rules:
// checking in (or a no-show) uses one session of a club member's pass; undoing gives it back.
async function setAttendance(event, prior, action) {
  const now = new Date().toISOString();
  const patch = {
    'check-in': { status: 'checked_in', checked_in_at: now },
    'no-show': { status: 'no_show', no_show_at: now },
    reset: { status: 'registered', checked_in_at: null, no_show_at: null },
  }[action];
  if (!patch) throw Object.assign(new Error(`Unknown action: ${action}`), { status: 400 });
  if (prior.status === 'cancelled') {
    throw Object.assign(new Error('This registration was cancelled.'), { status: 400 });
  }

  const { data: updated, error } = await supabase.from('event_participants').update(patch).eq('id', prior.id).select().single();
  if (error) throw error;
  if (action === 'check-in') await ensureGuestMember(event, updated);

  let pass = null;
  const memberId = prior.source_club_member_id;
  // A no-show (didn't come, didn't tell) uses the session like a check-in — it is not
  // carried over ("không bảo lưu"). Back to registered gives it back.
  const USES = ['checked_in', 'no_show'];
  if (memberId && event.club_id) {
    if (action !== 'reset' && !USES.includes(prior.status)) {
      pass = await consumeSession(memberId, event.event_date, event.id);
    } else if (action === 'reset' && USES.includes(prior.status)) {
      await releaseSession(memberId, event.id);
    }
  }

  return {
    ...updated,
    pass: pass && {
      period_label: pass.period_label,
      unlimited: pass.sessions_included === 0,
      sessions_remaining: pass.sessions_remaining,
    },
  };
}

const MAIN_LIST = ['registered', 'checked_in'];

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

// Wall-clock time in APP_TZ -> UTC ms (handles any offset, DST included).
function zonedToUtc(ymd, hm, tz = APP_TZ) {
  const guess = Date.parse(`${ymd}T${hm}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value])
  );
  const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return guess - (shown - guess);
}

function eventStartMs(event) {
  return zonedToUtc(event.event_date, (event.start_time || '00:00').slice(0, 5));
}

// When the session is over: its end time, else 2 hours after the start, else end of day.
function eventEndMs(event) {
  if (event.end_time) return zonedToUtc(event.event_date, event.end_time.slice(0, 5));
  if (event.start_time) return eventStartMs(event) + 2 * 3600000;
  return zonedToUtc(event.event_date, '23:59');
}

// Last moment a main-list player can cancel for free, or null when the event has no policy.
function cancelDeadline(event) {
  if (event.cancel_deadline_hours == null) return null;
  return new Date(eventStartMs(event) - Number(event.cancel_deadline_hours) * 3600000);
}

function isLateCancel(event, prior, now = new Date()) {
  const deadline = cancelDeadline(event);
  return !!deadline && MAIN_LIST.includes(prior.status) && now > deadline;
}

// Status for someone getting a place: straight in, or 'pending' while an online guest pays.
async function placePatch(event, participant, holdMs = PROMOTED_HOLD_MS) {
  if (!(await needsOnlinePayment(event, participant))) return { status: 'registered', hold_expires_at: null };
  return {
    status: 'pending',
    payment_status: participant.payment_status === 'proof_submitted' ? 'proof_submitted' : 'awaiting_proof',
    payment_ref: participant.payment_ref || newPaymentRef(),
    hold_expires_at: new Date(Date.now() + holdMs).toISOString(),
  };
}

// Where the Host puts someone on the participant list (the sheet on a name):
//   main        = "Xác nhận tham gia": a place (pays first if they owe online)
//   waitlist    = "Đặt vào danh sách chờ"
//   requested   = "Tạm hoãn duyệt": back to the requests waiting for a decision
//   not_playing = an organizer who runs the event without playing
const PLACES = ['main', 'waitlist', 'requested', 'not_playing'];
async function setPlace(event, prior, to) {
  if (!PLACES.includes(to)) throw httpError(`to must be one of ${PLACES.join(', ')}.`, 400, 'bad_place');
  if (['cancelled', 'checked_in', 'no_show'].includes(prior.status)) throw httpError('This person already played or cancelled.', 409, 'locked');
  if (to === 'not_playing' && !prior.is_organizer) throw httpError('Only organizers can be "not playing".', 400, 'not_organizer');
  const target = { main: null, waitlist: 'waitlisted', requested: 'requested', not_playing: 'not_playing' }[to];
  let patch;
  if (to === 'main') {
    if (HOLDS_PLACE.includes(prior.status)) return prior;
    const { count, error } = await supabase
      .from('event_participants')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .in('status', HOLDS_PLACE);
    if (error) throw error;
    if ((count || 0) >= event.slots) throw httpError('The main list is full: add places or move someone out first.', 409, 'full');
    patch = await placePatch(event, prior, prior.status === 'requested' ? APPROVED_HOLD_MS : PROMOTED_HOLD_MS);
  } else {
    if (prior.status === target) return prior;
    // Out of the main list: an unpaid hold is dropped (a paid fee stays paid).
    patch = { status: target, hold_expires_at: null };
    if (prior.status === 'pending' && prior.payment_status !== 'proof_submitted') patch.payment_status = 'none';
  }
  const { data, error } = await supabase.from('event_participants').update(patch).eq('id', prior.id).select().single();
  if (error) throw error;
  if (to === 'main') {
    if (data.status === 'registered') await ensureGuestMember(event, data);
    if (data.user_id && !data.is_organizer) (prior.status === 'requested' ? notifyApproved : notifyPromoted)(event, data);
  }
  return data;
}

// Move the first waitlisted player up and tell them (in the background).
// Guests with a perk (priority / VIP) go before everyone else on the waitlist.
async function promoteNext(event) {
  let q = supabase.from('event_participants').select('*').eq('event_id', event.id).eq('status', 'waitlisted');
  if (await guestsReady()) q = q.order('priority', { ascending: false });
  const { data: nextUp } = await q.order('joined_at', { ascending: true }).limit(1).maybeSingle();
  if (!nextUp) return null;
  const { data: promoted, error } = await supabase
    .from('event_participants')
    .update(await placePatch(event, nextUp))
    .eq('id', nextUp.id)
    .eq('status', 'waitlisted') // someone else may have promoted them meanwhile
    .select()
    .maybeSingle();
  if (error) throw error;
  if (promoted) notifyPromoted(event, promoted); // never throws; don't make the canceller wait
  if (promoted?.status === 'registered') await ensureGuestMember(event, promoted);
  return promoted;
}

// Cancel a registration, by the Host or by the player. Cancellation policy:
//  - before the event's deadline (or no deadline): free — a used session is given back;
//  - after it: marked late_cancel — a club member's session is still used and the
//    fee is still owed. The Host can waive it afterwards (waiveLateCancel).
// A freed main-list place goes to the next waitlisted player. A guest still waiting for
// payment confirmation ('pending') cancels for free: they never had a confirmed place.
async function cancelParticipant(event, prior, now = new Date()) {
  if (prior.status === 'cancelled') throw httpError('This registration is already cancelled.', 400, 'already_cancelled');
  const late = isLateCancel(event, prior, now);
  const { data: updated, error } = await supabase
    .from('event_participants')
    .update({ status: 'cancelled', cancelled_at: now.toISOString(), late_cancel: late })
    .eq('id', prior.id)
    .select()
    .single();
  if (error) throw error;

  let pass = null;
  if (prior.source_club_member_id && event.club_id) {
    if (late) pass = await consumeSession(prior.source_club_member_id, event.event_date, event.id);
    else if (prior.status === 'checked_in') await releaseSession(prior.source_club_member_id, event.id);
  }
  const promoted = HOLDS_PLACE.includes(prior.status) ? await promoteNext(event) : null;
  return {
    ...updated,
    late,
    pass: pass && { period_label: pass.period_label, unlimited: pass.sessions_included === 0, sessions_remaining: pass.sessions_remaining },
    promoted: promoted && { id: promoted.id, full_name: promoted.full_name },
  };
}

// Host forgives a late cancellation: session back, nothing owed.
async function waiveLateCancel(event, prior) {
  if (!(prior.status === 'cancelled' && prior.late_cancel)) throw httpError('Only late cancellations can be waived.', 400, 'not_late');
  const { data, error } = await supabase.from('event_participants').update({ late_cancel: false }).eq('id', prior.id).select().single();
  if (error) throw error;
  if (prior.source_club_member_id && event.club_id) await releaseSession(prior.source_club_member_id, event.id);
  return data;
}

// Manual promotion by the Host (also notifies the player).
async function promoteParticipant(event, prior) {
  if (prior.status !== 'waitlisted') throw httpError('Only waitlisted players can be promoted.', 400, 'not_waitlisted');
  const { data, error } = await supabase.from('event_participants').update(await placePatch(event, prior)).eq('id', prior.id).select().single();
  if (error) throw error;
  notifyPromoted(event, data);
  return data;
}

// Two kinds of check-in QR:
//   "PBT:<ticket_code>"    the ticket of one registration (shown after sign-up / payment)
//   "PBP:<checkin_token>"  the player's personal code from the portal (a bare token = PBP)
const UUID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
function parseCheckinCode(code) {
  const m = String(code || '').trim().match(new RegExp(`^(?:(PBT|PBP):)?${UUID}$`, 'i'));
  return m ? { kind: (m[1] || 'PBP').toUpperCase() === 'PBT' ? 'ticket' : 'player', token: m[2].toLowerCase() } : null;
}

async function registrationsForCode(event, parsed) {
  if (parsed.kind === 'ticket') {
    const { data, error } = await supabase.from('event_participants').select('*').eq('ticket_code', parsed.token).maybeSingle();
    if (error) throw error;
    if (!data) throw httpError('Unknown or replaced ticket.', 404, 'unknown_code');
    if (data.event_id !== event.id) throw httpError(`This ticket (${data.full_name}) is for another event.`, 409, 'other_event');
    return { rows: [data], name: data.full_name };
  }
  const { data: profile, error: pErr } = await supabase.from('player_profiles').select('user_id, full_name').eq('checkin_token', parsed.token).maybeSingle();
  if (pErr) throw pErr;
  if (!profile) throw httpError('Unknown or expired QR code.', 404, 'unknown_code');
  const filters = [`user_id.eq.${profile.user_id}`];
  if (event.club_id) {
    // only member records the Host has verified as this account
    const { data: members } = await supabase
      .from('club_members')
      .select('id')
      .eq('club_id', event.club_id)
      .eq('user_id', profile.user_id)
      .eq('account_verified', true);
    if (members?.length) filters.push(`source_club_member_id.in.(${members.map((m) => m.id).join(',')})`);
  }
  const { data: rows, error } = await supabase.from('event_participants').select('*').eq('event_id', event.id).or(filters.join(','));
  if (error) throw error;
  return { rows: rows || [], name: profile.full_name };
}

// Scan -> find the registration in this event -> check them in (uses a session).
async function checkInByCode(event, code) {
  const parsed = parseCheckinCode(code);
  if (!parsed) throw httpError('This is not a check-in QR code.', 400, 'bad_code');
  const { rows, name } = await registrationsForCode(event, parsed);

  const rank = { checked_in: 0, registered: 1, pending: 2, no_show: 3, waitlisted: 4, cancelled: 5 };
  const prior = rows.sort((a, b) => rank[a.status] - rank[b.status])[0];
  const player = { full_name: prior?.full_name || name };
  if (!prior) throw httpError(`${player.full_name} is not registered for this event.`, 404, 'not_registered');
  if (prior.status === 'pending') throw httpError(`${player.full_name} hasn't had their payment confirmed yet.`, 409, 'unpaid');
  if (prior.status === 'waitlisted') throw httpError(`${player.full_name} is still on the waitlist.`, 409, 'waitlisted');
  if (prior.status === 'cancelled') throw httpError(`${player.full_name} cancelled this registration.`, 409, 'cancelled');
  if (prior.status === 'checked_in') return { ...prior, already: true, pass: null };
  return { ...(await setAttendance(event, prior, 'check-in')), already: false };
}

module.exports = {
  eventStartMs,
  PLACES,
  setPlace,
  ATTENDANCE_ACTIONS,
  eventEndMs,
  MAIN_LIST,
  setAttendance,
  cancelDeadline,
  isLateCancel,
  cancelParticipant,
  waiveLateCancel,
  promoteParticipant,
  promoteNext,
  placePatch,
  checkInByCode,
  parseCheckinCode,
  zonedToUtc,
};
