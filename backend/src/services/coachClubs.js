// Coach Manager: links between a coach and a club / community. The coach asks (or the
// Host invites), the other side agrees. Once linked:
//  - the Host sees the coach's students who are members of the club: name, level, sessions
//    attended, sessions left in a package, the classes they are in. Never a phone number,
//    never the coach's notes, never money.
//  - the coach sees the club's member list (name, gender, level / DUPR; no phone, no email)
//    and can add a member as a student.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { fail } = require('./coachAccess');
const A = require('./coachAttendance');

const MIGRATION = '20270105090000_coach_clubs.sql';
async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}
const need = async () => {
  if (!(await ready())) throw Object.assign(fail('Coach Manager needs a database update.', 503, 'migration_missing'), { migration: MIGRATION });
};
const note = (v) => (v == null || !String(v).trim() ? null : String(v).trim().slice(0, 500));

const CLUB_COLS = 'id, name, kind, sport, address, district, province';
const COACH_COLS = 'id, slug, display_name, level_text, area, sport, status';

// ---- Coach side --------------------------------------------------------------------------
async function linksOfCoach(coach) {
  await need();
  const { data, error } = await supabase.from('coach_club_links').select(`*, clubs(${CLUB_COLS})`).eq('coach_id', coach.id).neq('status', 'declined').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(({ clubs: c, ...l }) => ({ ...l, club: c }));
}

// The coach asks to link with a club. When the Host had invited them already, it is linked.
async function coachRequest(coach, clubId, body = {}) {
  await need();
  const { data: club } = await supabase.from('clubs').select(CLUB_COLS).eq('id', clubId).maybeSingle();
  if (!club) throw fail('Club not found.', 404, 'not_found');
  const { data: had } = await supabase.from('coach_club_links').select('*').eq('coach_id', coach.id).eq('club_id', clubId).maybeSingle();
  if (had?.status === 'active') return had;
  if (had && had.requested_by === 'host' && had.status === 'requested') return decide(had, 'active');
  const row = { coach_id: coach.id, club_id: clubId, status: 'requested', requested_by: 'coach', note: note(body.note), decided_at: null, created_at: new Date().toISOString() };
  const q = had ? supabase.from('coach_club_links').update(row).eq('id', had.id) : supabase.from('coach_club_links').insert(row);
  const { data, error } = await q.select('*').single();
  if (error) throw error;
  return data;
}

async function decide(link, status) {
  const { data, error } = await supabase.from('coach_club_links').update({ status, decided_at: new Date().toISOString() }).eq('id', link.id).select('*').single();
  if (error) throw error;
  return data;
}

async function linkOfCoach(coach, linkId) {
  await need();
  const { data } = await supabase.from('coach_club_links').select('*').eq('id', linkId).eq('coach_id', coach.id).maybeSingle();
  if (!data) throw fail('Link not found.', 404, 'not_found');
  return data;
}

// The Host invited the coach: the coach accepts or declines.
async function coachAnswer(coach, linkId, accept) {
  const l = await linkOfCoach(coach, linkId);
  if (l.status !== 'requested' || l.requested_by !== 'host') throw fail('Nothing to answer.', 409, 'not_invited');
  return decide(l, accept ? 'active' : 'declined');
}

async function coachRemove(coach, linkId) {
  const l = await linkOfCoach(coach, linkId);
  const { error } = await supabase.from('coach_club_links').delete().eq('id', l.id);
  if (error) throw error;
  return { ok: true };
}

async function activeLink(coachId, clubId) {
  await need();
  const { data } = await supabase.from('coach_club_links').select('*').eq('coach_id', coachId).eq('club_id', clubId).eq('status', 'active').maybeSingle();
  if (!data) throw fail('This club is not linked with you.', 403, 'not_linked');
  return data;
}

// The club's members for a linked coach: name, gender, level — and whether they are
// already the coach's student. Never a phone number or an email.
async function membersForCoach(coach, clubId) {
  await activeLink(coach.id, clubId);
  const { data: club } = await supabase.from('clubs').select(CLUB_COLS).eq('id', clubId).single();
  const { data, error } = await supabase
    .from('club_members')
    .select('id, full_name, gender, member_type, dupr_level, dupr_doubles, user_id, join_requested, is_active')
    .eq('club_id', clubId)
    .order('full_name');
  if (error) throw error;
  const rows = (data || []).filter((m) => m.is_active !== false && !m.join_requested);
  const { data: studs } = await supabase.from('coach_students').select('id, user_id, club_member_id').eq('coach_id', coach.id);
  const byUser = new Map((studs || []).filter((s) => s.user_id).map((s) => [s.user_id, s.id]));
  const byMember = new Map((studs || []).filter((s) => s.club_member_id).map((s) => [s.club_member_id, s.id]));
  return {
    club,
    members: rows.map((m) => ({
      id: m.id,
      full_name: m.full_name,
      gender: m.gender || null,
      member_type: m.member_type,
      level: m.dupr_doubles != null ? Number(m.dupr_doubles) : m.dupr_level != null ? Number(m.dupr_level) : null,
      verified: m.dupr_doubles != null,
      has_account: !!m.user_id,
      student_id: byMember.get(m.id) || (m.user_id && byUser.get(m.user_id)) || null,
    })),
  };
}

// Add a club member as the coach's student (name, account, level; no phone).
async function addMemberAsStudent(coach, clubId, memberId) {
  await activeLink(coach.id, clubId);
  const { data: m } = await supabase.from('club_members').select('id, full_name, user_id, dupr_level, dupr_doubles').eq('club_id', clubId).eq('id', memberId).maybeSingle();
  if (!m) throw fail('Member not found.', 404, 'not_found');
  const level = m.dupr_doubles != null ? `DUPR ${Number(m.dupr_doubles).toFixed(2)}` : m.dupr_level != null ? `${Number(m.dupr_level).toFixed(2)}` : null;
  let q = supabase.from('coach_students').select('*').eq('coach_id', coach.id);
  q = m.user_id ? q.or(`user_id.eq.${m.user_id},club_member_id.eq.${m.id}`) : q.eq('club_member_id', m.id);
  const { data: had } = await q.limit(1).maybeSingle();
  if (had) {
    if (!had.club_member_id) await supabase.from('coach_students').update({ club_member_id: m.id }).eq('id', had.id);
    return { ...had, club_member_id: m.id, existed: true };
  }
  const { data, error } = await supabase.from('coach_students').insert({ coach_id: coach.id, user_id: m.user_id || null, club_member_id: m.id, full_name: m.full_name, level_text: level }).select('*').single();
  if (error) throw error;
  return data;
}

// ---- Host side ---------------------------------------------------------------------------
async function linksOfClub(clubId) {
  await need();
  const { data, error } = await supabase.from('coach_club_links').select(`*, coach_profiles(${COACH_COLS})`).eq('club_id', clubId).neq('status', 'declined').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(({ coach_profiles: c, ...l }) => ({ ...l, coach: c }));
}

async function linkOfClub(clubId, linkId) {
  await need();
  const { data } = await supabase.from('coach_club_links').select('*').eq('id', linkId).eq('club_id', clubId).maybeSingle();
  if (!data) throw fail('Link not found.', 404, 'not_found');
  return data;
}

// The Host invites a coach by their page address (nexuszone.vn/coach/<slug>).
async function hostInvite(clubId, slug, body = {}) {
  await need();
  const s = String(slug || '').trim().toLowerCase().replace(/^.*\/coach\//, '').replace(/[/?#].*$/, '');
  const { data: coach } = s ? await supabase.from('coach_profiles').select(COACH_COLS).eq('slug', s).maybeSingle() : { data: null };
  if (!coach || coach.status === 'blocked') throw fail('No coach with this address.', 404, 'coach_not_found');
  const { data: had } = await supabase.from('coach_club_links').select('*').eq('coach_id', coach.id).eq('club_id', clubId).maybeSingle();
  if (had?.status === 'active') return had;
  if (had && had.requested_by === 'coach' && had.status === 'requested') return decide(had, 'active');
  const row = { coach_id: coach.id, club_id: clubId, status: 'requested', requested_by: 'host', note: note(body.note), decided_at: null, created_at: new Date().toISOString() };
  const q = had ? supabase.from('coach_club_links').update(row).eq('id', had.id) : supabase.from('coach_club_links').insert(row);
  const { data, error } = await q.select('*').single();
  if (error) throw error;
  return data;
}

async function hostAnswer(clubId, linkId, accept) {
  const l = await linkOfClub(clubId, linkId);
  if (l.status !== 'requested' || l.requested_by !== 'coach') throw fail('Nothing to answer.', 409, 'not_requested');
  return decide(l, accept ? 'active' : 'declined');
}

async function hostRemove(clubId, linkId) {
  const l = await linkOfClub(clubId, linkId);
  const { error } = await supabase.from('coach_club_links').delete().eq('id', l.id);
  if (error) throw error;
  return { ok: true };
}

// A linked coach's students who are members of this club, for the Host.
async function studentsForHost(clubId, linkId) {
  const l = await linkOfClub(clubId, linkId);
  if (l.status !== 'active') throw fail('This coach is not linked yet.', 403, 'not_linked');
  const { data: mem } = await supabase.from('club_members').select('id, full_name, user_id').eq('club_id', clubId);
  const memberIds = new Set((mem || []).map((m) => m.id));
  const memberOfUser = new Map((mem || []).filter((m) => m.user_id).map((m) => [m.user_id, m]));
  const { data: studs, error } = await supabase.from('coach_students').select('id, user_id, club_member_id, full_name, level_text, status, first_seen').eq('coach_id', l.coach_id).neq('status', 'blocked');
  if (error) throw error;
  const mine = (studs || [])
    .map((s) => ({ s, m: (s.club_member_id && memberIds.has(s.club_member_id) ? (mem || []).find((x) => x.id === s.club_member_id) : null) || (s.user_id && memberOfUser.get(s.user_id)) || null }))
    .filter((x) => x.m);
  const ids = mine.map((x) => x.s.id);
  const [bal, att, enr] = await Promise.all([
    A.balances(ids),
    ids.length ? supabase.from('coach_attendance').select('student_id, status, checked_at').in('student_id', ids) : { data: [] },
    ids.length ? supabase.from('coach_enrollments').select('student_id, status, coach_classes(id, title, status)').in('student_id', ids).in('status', ['confirmed', 'waitlist']) : { data: [] },
  ]);
  const { data: classes } = await supabase.from('coach_classes').select('id, title, kind, status, weekdays, start_time, duration_min, court_name').eq('coach_id', l.coach_id).eq('status', 'open').neq('kind', 'single').order('start_time');
  const { data: coach } = await supabase.from('coach_profiles').select(COACH_COLS).eq('id', l.coach_id).single();
  return {
    coach,
    classes: classes || [],
    others: (studs || []).filter((s) => s.status === 'active').length - mine.filter((x) => x.s.status === 'active').length,
    students: mine
      .map(({ s, m }) => {
        const rows = (att.data || []).filter((a) => a.student_id === s.id);
        const n = A.tally(rows);
        const last = rows.filter((a) => a.status === 'present').map((a) => a.checked_at).sort().pop() || null;
        return {
          id: s.id,
          member_id: m.id,
          full_name: m.full_name || s.full_name,
          level_text: s.level_text,
          status: s.status,
          since: s.first_seen,
          present: n.present,
          absent: n.absent,
          excused: n.excused,
          last_present: last,
          remaining: bal[s.id]?.has_package ? bal[s.id].remaining : null,
          expires_on: bal[s.id]?.expires_on || null,
          classes: (enr.data || []).filter((e) => e.student_id === s.id && e.coach_classes && e.coach_classes.status !== 'archived').map((e) => e.coach_classes.title),
        };
      })
      .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'vi')),
  };
}

// How many coach requests wait for this Host (the bell / menu badge).
async function pendingForHost(clubIds) {
  if (!clubIds.length || !(await ready())) return 0;
  const { count } = await supabase.from('coach_club_links').select('id', { count: 'exact', head: true }).in('club_id', clubIds).eq('status', 'requested').eq('requested_by', 'coach');
  return count || 0;
}

module.exports = { MIGRATION, ready, linksOfCoach, coachRequest, coachAnswer, coachRemove, membersForCoach, addMemberAsStudent, linksOfClub, hostInvite, hostAnswer, hostRemove, studentsForHost, pendingForHost };
