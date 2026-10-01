// Guest list ("Thành viên giao lưu"): everyone who is not a fixed member but got a
// confirmed place at a club session is kept in the club's member list as a guest, so
// the Host knows who came, can note who cancelled after paying, and can give perks:
//
//   priority = first off the waitlist
//   vip      = priority + the club's VIP discount on every session fee
//
// Sign-ups that never got a confirmed place (unpaid holds, cancelled before paying)
// never reach the list.
const { supabase } = require('../supabase');
const { normalizePhone } = require('./memberships');
const { schemaStatus } = require('./schemaCheck');

const MIGRATION = '20261009090000_guest_perks_survey.sql';
const PERKS = ['priority', 'vip'];
const CONFIRMED = ['registered', 'checked_in'];

// False until the Host has run the migration: callers then behave exactly as before.
async function guestsReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
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
  if (!member || member.member_type === 'fixed' || !PERKS.includes(member.guest_perk)) return { ...none, member };
  let fee = null;
  if (member.guest_perk === 'vip') {
    const { data: club } = await supabase.from('clubs').select('guest_vip_discount').eq('id', event.club_id).maybeSingle();
    const discount = Number(club?.guest_vip_discount || 0);
    const base = Number(event.fee_amount || 0);
    if (discount > 0 && base > 0) fee = Math.max(0, base - discount);
  }
  return { member, perk: member.guest_perk, priority: true, fee_amount: fee };
}

function monthStart(ymd) {
  return `${String(ymd).slice(0, 7)}-01`;
}

// Put a participant with a confirmed place on the club's guest list (or link them to the
// record that's already there). Fixed members are left alone. Never throws: the sign-up,
// payment or check-in that called this must not fail because of the guest list.
async function ensureGuestMember(event, p) {
  try {
    if (!event.club_id || !p || !CONFIRMED.includes(p.status) || !(await guestsReady())) return null;
    if (p.guest_member_id) return p.guest_member_id;

    let member = null;
    if (p.source_club_member_id) {
      const { data } = await supabase.from('club_members').select('*').eq('id', p.source_club_member_id).maybeSingle();
      member = data;
    }
    member = member || (await findClubPerson(event.club_id, { userId: p.user_id, phone: p.phone }));
    if (member?.member_type === 'fixed') return null;

    if (!member) {
      // Nothing to recognise them by next time: skip.
      if (!p.user_id && normalizePhone(p.phone).length < 9) return null;
      const { data: profile } = p.user_id
        ? await supabase.from('player_profiles').select('full_name, phone, gender, birth_date, birth_year, dupr_level').eq('user_id', p.user_id).maybeSingle()
        : { data: null };
      const { data, error } = await supabase
        .from('club_members')
        .insert({
          club_id: event.club_id,
          user_id: p.user_id || null,
          account_verified: !!p.user_id,
          full_name: profile?.full_name || p.full_name,
          phone: profile?.phone || p.phone || null,
          dupr_level: profile?.dupr_level ?? p.dupr_level ?? null,
          gender: profile?.gender ?? null,
          birth_date: profile?.birth_date ?? null,
          birth_year: profile?.birth_year ?? null,
          member_type: 'guest',
          joined_on: monthStart(event.event_date),
        })
        .select()
        .single();
      if (error) {
        if (error.code !== '23505') throw error; // created meanwhile by another request: use it
        member = await findClubPerson(event.club_id, { userId: p.user_id, phone: p.phone });
        if (!member) return null;
      } else {
        member = data;
      }
    } else if (p.user_id && !member.user_id) {
      // The Host's record of this person: link the account and fill what the Host left blank.
      const { data: profile } = await supabase.from('player_profiles').select('gender, birth_date, birth_year, dupr_level').eq('user_id', p.user_id).maybeSingle();
      const blanks = {};
      for (const k of ['gender', 'birth_date', 'birth_year', 'dupr_level']) if (member[k] == null && profile?.[k] != null) blanks[k] = profile[k];
      await supabase.from('club_members').update({ user_id: p.user_id, account_verified: true, ...blanks }).eq('id', member.id).is('user_id', null);
    }

    await supabase.from('event_participants').update({ guest_member_id: member.id }).eq('id', p.id);
    return member.id;
  } catch (err) {
    console.error('guest list update failed', err);
    return null;
  }
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

module.exports = { MIGRATION, PERKS, guestsReady, findClubPerson, perksFor, ensureGuestMember, guestStats };
