// Guest list ("Thành viên giao lưu"): everyone who is not a fixed member but got a
// confirmed place at a club session is kept in the club's member list as a guest, so
// the Host knows who came, can note who cancelled after paying, and can give perks:
//
//   priority = first off the waitlist, plus the % off the ticket the Host set for this
//              guest (guest_discount_pct). Guests buy single tickets only: membership
//              plans (and their VIP stars) are for fixed members.
//
// Sign-ups that never got a confirmed place (unpaid holds, cancelled before paying)
// never reach the list.
const { supabase } = require('../supabase');
const { normalizePhone } = require('./memberships');
// Loaded lazily: plan.js -> billing -> … would be a cycle at require time.
const plan = () => require('./plan');
const { schemaStatus } = require('./schemaCheck');
const { clubSport, profileLevel } = require('./sport');

const MIGRATION = '20261009090000_guest_perks_survey.sql';
const PERKS = ['priority'];
const DISCOUNT_MIGRATION = '20261013090000_guest_priority_discount.sql';
const CONFIRMED = ['registered', 'checked_in'];

// False until the Host has run the migration: callers then behave exactly as before.
async function guestsReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

async function discountReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(DISCOUNT_MIGRATION);
}

// Ticket price after a priority guest's discount (whole VND).
function discountedFee(base, pct) {
  const p = Number(pct || 0);
  const b = Number(base || 0);
  if (!(p > 0) || !(b > 0)) return null;
  return Math.max(0, Math.round((b * (100 - Math.min(p, 100))) / 100));
}

// This person's record in the club: their linked account first, else an unlinked
// record (or one linked to them) with the same phone.
async function findClubPerson(clubId, { userId = null, phone = null } = {}) {
  if (userId) {
    const { data } = await supabase.from('club_members').select('*').eq('club_id', clubId).eq('user_id', userId).maybeSingle();
    if (data) return data;
  }
  const tel = normalizePhone(phone);
  if (tel.length < 9) return null;
  const { data } = await supabase.from('club_members').select('*').eq('club_id', clubId).not('phone', 'is', null);
  return (data || []).find((m) => normalizePhone(m.phone) === tel && (!m.user_id || m.user_id === userId)) || null;
}

// What a sign-up gets from the person's guest perk: waitlist priority and/or a lower fee.
async function perksFor(event, { userId = null, phone = null } = {}) {
  const none = { member: null, perk: null, priority: false, fee_amount: null };
  if (!event.club_id || !(await guestsReady())) return none;
  const member = await findClubPerson(event.club_id, { userId, phone });
  // ('vip' is a perk from before migration 20261013090000: treated as priority.)
  if (!member || !['priority', 'vip'].includes(member.guest_perk)) return { ...none, member };
  // Clubs: only guests have perks. Communities: regulars can be "khách ưu tiên" too.
  if (member.member_type === 'fixed') {
    const { data: club } = await supabase.from('clubs').select('kind').eq('id', event.club_id).maybeSingle();
    if ((club?.kind || 'club') !== 'community') return { ...none, member };
  }
  const pct = Number(member.guest_discount_pct || 0);
  return { member, perk: 'priority', priority: true, discount_pct: pct || null, fee_amount: discountedFee(event.fee_amount, pct) };
}

function monthStart(ymd) {
  return `${String(ymd).slice(0, 7)}-01`;
}

// Link a participant with a confirmed place to the club's record of them when there is one
// (same account / phone); nobody new is added to the list. Fixed members are left alone.
// Never throws: the sign-up, payment or check-in that called this must not fail because of it.
async function ensureGuestMember(event, p) {
  try {
    // Organizers (the Host, co-hosts) are not the club's guests.
    if (!event.club_id || !p || p.is_organizer || !CONFIRMED.includes(p.status) || !(await guestsReady())) return null;
    // Booked by the invite link (no account): the Host checks who they are by phone first.
    if (p.guest_booking_id) return null;
    if (p.guest_member_id) return p.guest_member_id;

    let member = null;
    if (p.source_club_member_id) {
      const { data } = await supabase.from('club_members').select('*').eq('id', p.source_club_member_id).maybeSingle();
      member = data;
    }
    member = member || (await findClubPerson(event.club_id, { userId: p.user_id, phone: p.phone }));
    if (member?.member_type === 'fixed') return null;

    if (!member) {
      // Playing a kèo never makes someone a member (club or community): they only get a place
      // in that kèo. They join the list with their own account and a join request.
      return null;
    } else if (p.user_id && !member.user_id) {
      // The Host's record of this person: link the account and fill what the Host left blank.
      const { data: profile } = await supabase.from('player_profiles').select('*').eq('user_id', p.user_id).maybeSingle();
      const blanks = {};
      for (const k of ['gender', 'birth_date', 'birth_year']) if (member[k] == null && profile?.[k] != null) blanks[k] = profile[k];
      const level = profileLevel(profile, await clubSport(event.club_id));
      if (member.dupr_level == null && level != null) blanks.dupr_level = level;
      await supabase.from('club_members').update({ user_id: p.user_id, account_verified: true, ...blanks }).eq('id', member.id).is('user_id', null);
    }

    await supabase.from('event_participants').update({ guest_member_id: member.id }).eq('id', p.id);
    return member.id;
  } catch (err) {
    console.error('guest list update failed', err);
    return null;
  }
}

// The club record for a signed-in player who acts on a club event (e.g. votes on a
// meeting): their own record, else one with their phone, else a new guest record made
// from their profile. Returns null when the profile has no name/phone to go on.
async function memberForUser(event, userId) {
  const { data: profile } = await supabase.from('player_profiles').select('*').eq('user_id', userId).maybeSingle();
  const found = await findClubPerson(event.club_id, { userId, phone: profile?.phone });
  if (found) {
    if (!found.user_id && found.unlinked_user_id !== userId) await supabase.from('club_members').update({ user_id: userId, account_verified: true }).eq('id', found.id).is('user_id', null);
    return found;
  }
  if (!profile?.full_name || normalizePhone(profile.phone).length < 9) return null;
  await plan().assertMemberRoom({ id: event.club_id, host_id: event.host_id }, 'guest');
  const { data, error } = await supabase
    .from('club_members')
    .insert({
      club_id: event.club_id,
      user_id: userId,
      account_verified: true,
      full_name: profile.full_name,
      phone: profile.phone,
      dupr_level: profileLevel(profile, await clubSport(event.club_id)) ?? null,
      gender: profile.gender ?? null,
      birth_date: profile.birth_date ?? null,
      birth_year: profile.birth_year ?? null,
      member_type: 'guest',
      joined_on: monthStart(event.event_date),
    })
    .select()
    .single();
  if (error) {
    if (error.code !== '23505') throw error;
    return findClubPerson(event.club_id, { userId, phone: profile.phone });
  }
  return data;
}

// Per guest record: sessions played, cancellations after a confirmed (paid / late) place.
async function guestStats(memberIds) {
  const out = {};
  if (!memberIds.length || !(await guestsReady())) return out;
  const { data, error } = await supabase
    .from('event_participants')
    .select('guest_member_id, status, late_cancel, fee_paid, cancelled_at, events(event_date)')
    .in('guest_member_id', memberIds);
  if (error) throw error;
  for (const r of data || []) {
    const s = (out[r.guest_member_id] = out[r.guest_member_id] || { played: 0, last_played: null, paid_cancels: 0, last_cancel: null });
    const day = r.events?.event_date || null;
    if (r.status === 'checked_in') {
      s.played++;
      if (day && (!s.last_played || day > s.last_played)) s.last_played = day;
    }
    if (r.status === 'cancelled' && (r.fee_paid || r.late_cancel)) {
      s.paid_cancels++;
      if (day && (!s.last_cancel || day > s.last_cancel)) s.last_cancel = day;
    }
  }
  return out;
}

// The Host plays too: their own row in the club's / community's member list, linked to their
// account, so their DUPR and level show like everyone else's when they join a kèo (and they
// can set their DUPR ID / score like any member). Made the first time it is needed; a row
// already there with their phone is linked instead. Never throws.
async function ensureHostMember(club) {
  try {
    if (!club?.id || !club.host_id) return null;
    const { data: profile } = await supabase.from('player_profiles').select('*').eq('user_id', club.host_id).maybeSingle();
    const found = await findClubPerson(club.id, { userId: club.host_id, phone: profile?.phone });
    if (found) {
      if (found.user_id === club.host_id) return found;
      const { data } = await supabase.from('club_members').update({ user_id: club.host_id, account_verified: true }).eq('id', found.id).select().single();
      return data || found;
    }
    const { data: user } = await supabase.from('users').select('full_name, username, email').eq('id', club.host_id).maybeSingle();
    const name = profile?.full_name || user?.full_name || user?.username || (user?.email || 'Host').split('@')[0];
    const today = new Date().toISOString().slice(0, 10);
    const row = {
      club_id: club.id,
      user_id: club.host_id,
      account_verified: true,
      full_name: name,
      phone: profile?.phone || null,
      gender: profile?.gender ?? null,
      birth_date: profile?.birth_date ?? null,
      birth_year: profile?.birth_year ?? null,
      dupr_level: (profile && profileLevel(profile, await clubSport(club.id))) ?? null,
      member_type: 'fixed',
      joined_on: monthStart(today),
    };
    let { data, error } = await supabase.from('club_members').insert({ ...row, ...(profile?.dupr_id ? { dupr_id: profile.dupr_id } : {}) }).select().single();
    if (error && profile?.dupr_id) ({ data, error } = await supabase.from('club_members').insert(row).select().single()); // before the DUPR migration
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('host member', err.message);
    return null;
  }
}

module.exports = { MIGRATION, PERKS, memberForUser, guestsReady, discountReady, discountedFee, findClubPerson, perksFor, ensureGuestMember, ensureHostMember, guestStats };
