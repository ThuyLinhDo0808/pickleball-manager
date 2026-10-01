// A player becomes "member X of club Y" automatically when the phone in their profile
// matches a club member's phone (last 9 digits). Runs when they save their profile and
// whenever they open the player portal or an event page, so a member the Host adds
// later is picked up at the player's next visit. Records already linked to another
// account are never taken over, and an account the Host unlinked is never re-linked.
const { supabase } = require('../supabase');
const { normalizePhone } = require('./memberships');
const { schemaStatus } = require('./schemaCheck');
const { clubSport, profileLevel } = require('./sport');

const MIGRATION = '20261010090000_member_phone_link.sql';

async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

// Copy profile details into blank fields of a club record (never overwrite the Host's data).
function blanksFrom(member, profile, sport) {
  const patch = {};
  for (const k of ['gender', 'birth_year', 'birth_date']) if (member[k] == null && profile?.[k] != null) patch[k] = profile[k];
  const level = profileLevel(profile, sport); // DUPR or the badminton step, by the club's sport
  if (member.dupr_level == null && level != null) patch.dupr_level = level;
  return patch;
}

// Link (and verify) every club member with this phone. Returns the clubs newly linked.
// Never throws: a failure here must not break the page that called it.
async function linkByPhone(userId, profile) {
  try {
    const key = normalizePhone(profile?.phone).slice(-9);
    if (!userId || key.length < 9 || !(await ready())) return [];
    const [{ data: matches }, { data: mine }] = await Promise.all([
      supabase.from('club_members').select('*').eq('phone_key', key),
      supabase.from('club_members').select('id, club_id').eq('user_id', userId),
    ]);
    const haveClub = new Set((mine || []).map((m) => m.club_id));
    const linked = [];
    for (const m of matches || []) {
      if (m.unlinked_user_id === userId) continue; // the Host said no
      if (m.join_requested && !m.account_verified && m.user_id === userId) continue; // a pending request: Host decides
      if (m.user_id === userId) {
        // linked earlier but waiting for the Host: the phone matches, so it's them
        if (!m.account_verified) await supabase.from('club_members').update({ account_verified: true }).eq('id', m.id);
        continue;
      }
      if (m.user_id || haveClub.has(m.club_id)) continue; // someone else's, or already a member there
      const { data } = await supabase
        .from('club_members')
        .update({ user_id: userId, account_verified: true, ...blanksFrom(m, profile, await clubSport(m.club_id)) })
        .eq('id', m.id)
        .is('user_id', null)
        .select('id, club_id')
        .maybeSingle();
      if (data) {
        haveClub.add(data.club_id);
        linked.push(data.club_id);
      }
    }
    return linked;
  } catch (err) {
    console.error('phone link failed', err);
    return [];
  }
}

module.exports = { linkByPhone, phoneLinkReady: ready, MIGRATION };
