// Club search for players: find clubs by name or place (country, province / city,
// district), see a club's profile and its coming sessions, then ask to join the club or
// sign up for a session through its public link. Only listed clubs of accounts that are
// not suspended are shown.
const { supabase } = require('../supabase');
const { todayYmd, normalizePhone } = require('./memberships');
const { findClubPerson } = require('./guests');

const fail = (message, status = 400, code) => Object.assign(new Error(message), { status, code });
const SPORTS = ['pickleball', 'badminton'];
const PAGE = 24;
const CLUB_FIELDS = 'id, host_id, name, sport, description, country, province, district, address, schedule, member_count_hint, avatar_version, cover_version, created_at';
// Words typed in the search box go into a PostgREST filter: keep letters, digits, spaces.
const term = (v) => String(v ?? '').normalize('NFC').replace(/[^\p{L}\p{N}\s.'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

async function suspendedHosts(hostIds) {
  if (!hostIds.length) return new Set();
  const { data } = await supabase.from('users').select('id').in('id', hostIds).not('suspended_at', 'is', null);
  return new Set((data || []).map((u) => u.id));
}

// Active members and coming sessions per club, for the result cards.
async function countsFor(clubIds) {
  const out = Object.fromEntries(clubIds.map((id) => [id, { members: 0, upcoming: 0, next_date: null }]));
  if (!clubIds.length) return out;
  const [{ data: members }, { data: events }] = await Promise.all([
    supabase.from('club_members').select('club_id').in('club_id', clubIds).eq('is_active', true),
    supabase.from('events').select('club_id, event_date').in('club_id', clubIds).gte('event_date', todayYmd()).in('status', ['open', 'closed']).order('event_date'),
  ]);
  for (const m of members || []) out[m.club_id].members++;
  for (const e of events || []) {
    out[e.club_id].upcoming++;
    if (!out[e.club_id].next_date) out[e.club_id].next_date = e.event_date;
  }
  return out;
}

const present = (c, counts) => ({
  id: c.id,
  name: c.name,
  sport: c.sport || 'pickleball',
  description: c.description,
  country: c.country,
  province: c.province,
  district: c.district,
  address: c.address,
  schedule: c.schedule,
  member_count: counts?.members ?? null,
  member_count_hint: c.member_count_hint,
  upcoming: counts?.upcoming ?? 0,
  next_date: counts?.next_date ?? null,
  avatar_version: c.avatar_version,
  cover_version: c.cover_version,
});

// { q, country, province, district, sport, page } -> { items, page, more }
async function search(params = {}) {
  const page = Math.max(1, Math.min(50, parseInt(params.page, 10) || 1));
  let query = supabase.from('clubs').select(CLUB_FIELDS).eq('is_listed', true);
  const q = term(params.q);
  if (q) {
    const like = `"*${q}*"`;
    query = query.or(`name.ilike.${like},address.ilike.${like},district.ilike.${like},province.ilike.${like},description.ilike.${like}`);
  }
  for (const k of ['country', 'province', 'district']) {
    const v = term(params[k]);
    if (v) query = query.ilike(k, `%${v}%`);
  }
  if (SPORTS.includes(params.sport)) query = query.eq('sport', params.sport);
  const from = (page - 1) * PAGE;
  const { data, error } = await query.order('name').range(from, from + PAGE); // one extra row: is there a next page?
  if (error) throw error;
  const rows = data || [];
  const hidden = await suspendedHosts([...new Set(rows.map((c) => c.host_id))]);
  const visible = rows.slice(0, PAGE).filter((c) => !hidden.has(c.host_id));
  const counts = await countsFor(visible.map((c) => c.id));
  return { items: visible.map((c) => present(c, counts[c.id])), page, more: rows.length > PAGE };
}

async function listedClub(clubId) {
  const { data, error } = await supabase.from('clubs').select(CLUB_FIELDS).eq('id', clubId).eq('is_listed', true).maybeSingle();
  if (error) throw error;
  if (!data || (await suspendedHosts([data.host_id])).size) throw fail('Club not found.', 404, 'not_found');
  return data;
}

// A club's page in the search: its profile and the sessions coming up. A session with a
// public link can be signed up for; the others are for members only.
async function profile(clubId) {
  const club = await listedClub(clubId);
  const [counts, { data: events, error }] = await Promise.all([
    countsFor([club.id]),
    supabase
      .from('v_event_summary')
      .select('id, title, event_date, start_time, end_time, location, slots, main_count, waitlist_count, fee_amount, status, kind, allow_public_registration, public_token')
      .eq('club_id', club.id)
      .gte('event_date', todayYmd())
      .in('status', ['open', 'closed'])
      .order('event_date')
      .order('start_time')
      .limit(30),
  ]);
  if (error) throw error;
  return {
    club: present(club, counts[club.id]),
    events: (events || []).map((e) => ({
      id: e.id,
      title: e.title,
      event_date: e.event_date,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
      slots: e.slots,
      main_count: e.main_count,
      waitlist_count: e.waitlist_count,
      fee_amount: e.fee_amount,
      kind: e.kind,
      status: e.status,
      // Only sessions the club opened to everyone carry their sign-up link.
      link: e.allow_public_registration && e.status === 'open' ? e.public_token : null,
    })),
  };
}

// The club's avatar / cover picture as an image (data URL stored in club_images).
async function image(clubId, kind) {
  if (!['avatar', 'cover'].includes(kind)) throw fail('Not found.', 404);
  const { data } = await supabase.from('club_images').select(kind).eq('club_id', clubId).maybeSingle();
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(data?.[kind] || '');
  if (!m) throw fail('Not found.', 404);
  return { type: m[1], body: Buffer.from(m[2], 'base64') };
}

// The signed-in player and this club: member already, request waiting, or nothing yet.
async function relation(clubId, userId) {
  const { data: club } = await supabase.from('clubs').select('id, host_id').eq('id', clubId).maybeSingle();
  if (!club) throw fail('Club not found.', 404, 'not_found');
  if (club.host_id === userId) return { state: 'owner' };
  const { data: profile } = await supabase.from('player_profiles').select('phone').eq('user_id', userId).maybeSingle();
  const m = await findClubPerson(clubId, { userId, phone: profile?.phone });
  if (!m) return { state: 'none' };
  if (m.member_type === 'fixed' && m.is_active !== false && !m.join_requested) return { state: 'member' };
  if (m.join_requested) return { state: 'requested' };
  return { state: 'guest' };
}

// "Ask to join": the player lands in the club's waiting list (Members -> join requests)
// for the Host to approve, like a request from the after-session survey.
async function requestJoin(clubId, userId, body = {}) {
  const club = await listedClub(clubId);
  if (club.host_id === userId) throw fail('This is your club.', 409, 'own_club');
  const { data: profile } = await supabase.from('player_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (!profile?.full_name || normalizePhone(profile.phone).length < 9 || !profile.birth_date) {
    throw fail('Complete your profile first.', 400, 'profile_required');
  }
  const join_note = String(body.note || '').trim().slice(0, 1000) || null;
  const { profileLevel } = require('./sport');
  let member = await findClubPerson(clubId, { userId, phone: profile.phone });
  if (member?.member_type === 'fixed' && !member.join_requested) throw fail('You are already a member of this club.', 409, 'already_member');
  if (member?.join_requested) throw fail('Your request is already waiting for the club.', 409, 'already_requested');
  const info = { join_requested: true, join_requested_at: new Date().toISOString(), join_note, join_source: 'search' };
  if (member) {
    const { data, error } = await supabase.from('club_members').update({ ...info, user_id: member.user_id || userId }).eq('id', member.id).select().single();
    if (error) throw error;
    member = data;
  } else {
    await require('./plan').assertMemberRoom(club, 'guest');
    const { data, error } = await supabase
      .from('club_members')
      .insert({
        ...info,
        club_id: clubId,
        user_id: userId,
        account_verified: true,
        member_type: 'guest',
        full_name: profile.full_name,
        phone: profile.phone,
        gender: profile.gender,
        birth_date: profile.birth_date,
        birth_year: profile.birth_year,
        dupr_level: profileLevel(profile, club.sport),
        joined_on: `${todayYmd().slice(0, 7)}-01`,
      })
      .select()
      .single();
    if (error) throw error;
    member = data;
  }
  return { state: 'requested', member_id: member.id };
}

module.exports = { search, profile, image, relation, requestJoin, term };
