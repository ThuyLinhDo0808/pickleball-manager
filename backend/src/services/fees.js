// Who pays what for an event registration.
const { supabase } = require('../supabase');

// Places on the main list: confirmed players plus guests whose payment is being checked.
const HOLDS_PLACE = ['registered', 'checked_in', 'pending'];

function feeFor(event, participant) {
  return Number(participant?.fee_amount ?? event.fee_amount ?? 0);
}

// A paid pass of this member covering the event date with a session left (or unlimited).
async function activePass(clubMemberId, eventDate) {
  if (!clubMemberId) return null;
  const { data, error } = await supabase
    .from('v_membership_status')
    .select('*')
    .eq('club_member_id', clubMemberId)
    .eq('status', 'paid')
    .lte('starts_on', eventDate)
    .gte('ends_on', eventDate);
  if (error) throw error;
  return (data || []).find((p) => p.sessions_included === 0 || p.sessions_remaining > 0) || null;
}

// The signed-in player's standing in the event's club: a Host-verified member (maybe with a pass),
// a link waiting for the Host to verify, a guest on the club's guest list, or nobody.
// Guests sign up and pay like anyone else (plus their perk, see guests.js).
async function memberStanding(event, userId) {
  if (!event.club_id || !userId) return { state: 'none', member: null, pass: null };
  const { data: member } = await supabase
    .from('club_members')
    .select('*')
    .eq('club_id', event.club_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member) return { state: 'none', member: null, pass: null };
  if (member.member_type === 'guest') return { state: 'guest', member, pass: null };
  if (!member.account_verified) return { state: 'pending', member, pass: null };
  return { state: 'verified', member, pass: await activePass(member.id, event.event_date) };
}

// Online sign-ups pay before they get a ticket, unless the fee is 0, it's already paid,
// or a member's pass covers the session. People the Host added by hand settle in person.
async function needsOnlinePayment(event, participant) {
  if (!participant.user_id || participant.fee_paid || feeFor(event, participant) <= 0) return false;
  if (participant.kind === 'member' && (await activePass(participant.source_club_member_id, event.event_date))) return false;
  return true;
}

module.exports = { HOLDS_PLACE, feeFor, activePass, memberStanding, needsOnlinePayment };
