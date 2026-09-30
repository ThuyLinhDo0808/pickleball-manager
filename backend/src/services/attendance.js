const { supabase } = require('../supabase');
const { consumeSession, releaseSession } = require('./memberships');
const { APP_TZ } = require('./stats');
const { notifyPromoted } = require('./notify');

const ATTENDANCE_ACTIONS = ['check-in', 'no-show', 'reset'];

// Check-in / no-show / reset (back to registered) for one participant.
// Shared by the Host and by staff (coordinators) so both follow the same rules:
// checking in a club member uses one session of their pass; undoing gives it back.
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

  let pass = null;
  const memberId = prior.source_club_member_id;
  if (memberId && event.club_id) {
    if (action === 'check-in' && prior.status !== 'checked_in') {
      pass = await consumeSession(memberId, event.event_date, event.id);
    } else if (action !== 'check-in' && prior.status === 'checked_in') {
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

// Last moment a main-list player can cancel for free, or null when the event has no policy.
function cancelDeadline(event) {
  if (event.cancel_deadline_hours == null) return null;
  return new Date(eventStartMs(event) - Number(event.cancel_deadline_hours) * 3600000);
}

function isLateCancel(event, prior, now = new Date()) {
  const deadline = cancelDeadline(event);
  return !!deadline && MAIN_LIST.includes(prior.status) && now > deadline;
}

// Move the first waitlisted player up and tell them (in the background).
async function promoteNext(event) {
  const { data: nextUp } = await supabase
    .from('event_participants')
    .select('*')
    .eq('event_id', event.id)
    .eq('status', 'waitlisted')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!nextUp) return null;
  const { data: promoted, error } = await supabase
    .from('event_participants')
    .update({ status: 'registered' })
    .eq('id', nextUp.id)
    .eq('status', 'waitlisted') // someone else may have promoted them meanwhile
    .select()
    .maybeSingle();
  if (error) throw error;
  if (promoted) notifyPromoted(event, promoted); // never throws; don't make the canceller wait
  return promoted;
}

// Cancel a registration, by the Host or by the player. Cancellation policy:
//  - before the event's deadline (or no deadline): free — a used session is given back;
//  - after it: marked late_cancel — a club member's session is still used and the
//    fee is still owed. The Host can waive it afterwards (waiveLateCancel).
// A freed main-list place goes to the next waitlisted player.
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
  const promoted = MAIN_LIST.includes(prior.status) ? await promoteNext(event) : null;
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
  const { data, error } = await supabase.from('event_participants').update({ status: 'registered' }).eq('id', prior.id).select().single();
  if (error) throw error;
  notifyPromoted(event, data);
  return data;
}

// Personal QR from the player portal: "PBP:<checkin_token>" (a bare token also works).
function parseCheckinCode(code) {
  const m = String(code || '').trim().match(/^(?:PBP:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m ? m[1].toLowerCase() : null;
}

// Scan -> find this player's registration in the event -> check them in (uses a session).
async function checkInByCode(event, code) {
  const token = parseCheckinCode(code);
  if (!token) throw httpError('This is not a player check-in QR code.', 400, 'bad_code');
  const { data: profile, error: pErr } = await supabase.from('player_profiles').select('user_id, full_name').eq('checkin_token', token).maybeSingle();
  if (pErr) throw pErr;
  if (!profile) throw httpError('Unknown or expired QR code.', 404, 'unknown_code');

  const filters = [`user_id.eq.${profile.user_id}`];
  if (event.club_id) {
    const { data: members } = await supabase.from('club_members').select('id').eq('club_id', event.club_id).eq('user_id', profile.user_id);
    if (members?.length) filters.push(`source_club_member_id.in.(${members.map((m) => m.id).join(',')})`);
  }
  const { data: rows, error } = await supabase.from('event_participants').select('*').eq('event_id', event.id).or(filters.join(','));
  if (error) throw error;

  const rank = { checked_in: 0, registered: 1, no_show: 2, waitlisted: 3, cancelled: 4 };
  const prior = (rows || []).sort((a, b) => rank[a.status] - rank[b.status])[0];
  const player = { full_name: prior?.full_name || profile.full_name };
  if (!prior) throw httpError(`${player.full_name} is not registered for this event.`, 404, 'not_registered');
  if (prior.status === 'waitlisted') throw httpError(`${player.full_name} is still on the waitlist.`, 409, 'waitlisted');
  if (prior.status === 'cancelled') throw httpError(`${player.full_name} cancelled this registration.`, 409, 'cancelled');
  if (prior.status === 'checked_in') return { ...prior, already: true, pass: null };
  return { ...(await setAttendance(event, prior, 'check-in')), already: false };
}

module.exports = {
  ATTENDANCE_ACTIONS,
  MAIN_LIST,
  setAttendance,
  cancelDeadline,
  isLateCancel,
  cancelParticipant,
  waiveLateCancel,
  promoteParticipant,
  promoteNext,
  checkInByCode,
  parseCheckinCode,
  zonedToUtc,
};
