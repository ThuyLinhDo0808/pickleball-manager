// After-session review. When a club session is over, everyone who was checked in
// (guests and fixed members) gets a thank-you with a private link (email, and a card in
// the player portal). It asks for overall stars, stars for the court and for the
// organisation, whether the level suited them, "would you come back to a session like
// this?", a private note only the Host reads, and — guests only — "Do you want to join
// our fixed team?": yes opens a short member form whose answers land in the club's
// waiting list (DS chờ) for the Host to approve.
const { supabase } = require('../supabase');
const { normalizePhone } = require('./memberships');

const APP_TZ = process.env.APP_TZ || 'Asia/Ho_Chi_Minh';
const { eventEndMs } = require('./attendance');
const { guestsReady, findClubPerson } = require('./guests');
const { notifySurvey, notifyJoinFromSurvey, webUrl } = require('./notify');
const { clubSport, profileLevel, cleanLevel } = require('./sport');

const OPEN_DAYS = 30; // how long the link keeps working after the session
const SEND_WINDOW_DAYS = 3; // sessions older than this are not swept (e.g. right after deploying)
const LEVEL_FIT = ['easy', 'right', 'hard'];
const COME_BACK = ['yes', 'maybe', 'no'];
const V2_FIELDS = 'court_rating, organization_rating, come_back';
const missingColumn = (e) => e && (e.code === '42703' || e.code === 'PGRST204' || /court_rating|come_back|organization_rating/.test(e.message || ''));

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
// Calendar days in the club's time zone (event dates are local), not UTC.
const daysAgo = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date(Date.now() - n * 86400000));

// Reads the answers with the newer columns, or without them before migration 20261115090000.
async function selectSurveys(cols, build) {
  const r = await build(`${cols}, ${V2_FIELDS}`);
  if (!missingColumn(r.error)) return r;
  return build(cols);
}

// ---- sending -------------------------------------------------------------------------

// Find the players of sessions that just ended and send them the survey (once each).
async function sendDueSurveys(now = Date.now()) {
  if (!(await guestsReady())) return 0;
  const { data: events, error } = await supabase
    .from('events')
    .select('*, clubs(name)')
    .not('club_id', 'is', null)
    .neq('status', 'cancelled')
    .gte('event_date', daysAgo(SEND_WINDOW_DAYS))
    .lte('event_date', daysAgo(0));
  if (error) throw error;
  let sent = 0;
  for (const event of events || []) {
    if (eventEndMs(event) > now) continue;
    const { data: people } = await supabase
      .from('event_participants')
      .select('*')
      .eq('event_id', event.id)
      .eq('status', 'checked_in')
      .is('survey_sent_at', null);
    for (const p of people || []) {
      // Claim it first so two sweeps never send twice.
      const { data: claimed } = await supabase
        .from('event_participants')
        .update({ survey_sent_at: new Date(now).toISOString() })
        .eq('id', p.id)
        .is('survey_sent_at', null)
        .select('id')
        .maybeSingle();
      if (!claimed) continue;
      await notifySurvey(event, p, { clubName: event.clubs?.name, url: webUrl(`/s/${p.survey_token}`) });
      sent++;
    }
  }
  return sent;
}

// Run the sweep in the background every few minutes (never crashes the server).
function startSurveySweeper(everyMs = 10 * 60 * 1000) {
  const { completeFinished } = require('./eventStatus');
  const run = () =>
    completeFinished()
      .then(() => sendDueSurveys())
      .catch((err) => console.error('survey sweep failed', err));
  setTimeout(run, 30 * 1000).unref();
  setInterval(run, everyMs).unref();
}

// ---- the survey page -------------------------------------------------------------------

async function participantByToken(token) {
  if (!isUuid(token) || !(await guestsReady())) throw httpError('Survey not found.', 404, 'not_found');
  const { data: p } = await supabase
    .from('event_participants')
    .select('*, events(*, clubs(name))')
    .eq('survey_token', token)
    .maybeSingle();
  const event = p?.events;
  if (!p || !event?.club_id || p.status !== 'checked_in') throw httpError('Survey not found.', 404, 'not_found');
  if (event.event_date < daysAgo(OPEN_DAYS)) throw httpError('This survey has closed.', 410, 'closed');
  return { p, event };
}

// What the survey page shows: the session, what was answered, and the join form's prefill.
async function surveyView(token) {
  const { p, event } = await participantByToken(token);
  const sport = await clubSport(event.club_id);
  const [{ data: answer }, member] = await Promise.all([
    selectSurveys('rating, level_fit, comment, wants_join', (c) => supabase.from('event_surveys').select(c).eq('participant_id', p.id).maybeSingle()),
    p.guest_member_id
      ? supabase.from('club_members').select('*').eq('id', p.guest_member_id).maybeSingle().then((r) => r.data)
      : findClubPerson(event.club_id, { userId: p.user_id, phone: p.phone }),
  ]);
  const { data: profile } = p.user_id
    ? await supabase.from('player_profiles').select('*').eq('user_id', p.user_id).maybeSingle()
    : { data: null };
  const started = Date.now() >= eventEndMs(event) - 3600000; // open from the last hour of play
  return {
    event: { title: event.title, event_date: event.event_date, start_time: event.start_time, location: event.location },
    club_name: event.clubs?.name || null,
    sport,
    player_name: p.full_name,
    open: started,
    answer: answer || null,
    is_fixed: member?.member_type === 'fixed',
    join_requested: !!member?.join_requested,
    prefill: {
      full_name: profile?.full_name || member?.full_name || p.full_name,
      phone: profile?.phone || member?.phone || p.phone || '',
      gender: profile?.gender || member?.gender || '',
      birth_date: profile?.birth_date || member?.birth_date || '',
      dupr_level: profileLevel(profile, sport) ?? member?.dupr_level ?? p.dupr_level ?? '',
    },
  };
}

async function answerSurvey(token, body) {
  const { p, event } = await participantByToken(token);
  if (Date.now() < eventEndMs(event) - 3600000) throw httpError('The survey opens after the session.', 409, 'too_early');
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError('Choose 1 to 5 stars.', 400, 'rating');
  const stars = (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5 ? Number(v) : null);
  const level_fit = LEVEL_FIT.includes(body.level_fit) ? body.level_fit : null;
  const comment = String(body.comment || '').trim().slice(0, 1000) || null;
  const row = { participant_id: p.id, event_id: event.id, rating, level_fit, comment, wants_join: !!body.wants_join };
  const extra = { court_rating: stars(body.court_rating), organization_rating: stars(body.organization_rating), come_back: COME_BACK.includes(body.come_back) ? body.come_back : null };
  let { error } = await supabase.from('event_surveys').upsert({ ...row, ...extra }, { onConflict: 'participant_id' });
  if (missingColumn(error)) ({ error } = await supabase.from('event_surveys').upsert(row, { onConflict: 'participant_id' }));
  if (error) throw error;
  return surveyView(token);
}

// "Yes, I want to join the fixed team": the member form. The person's guest record (or a
// new one) is marked as a join request; the Host approves it in DS chờ.
async function joinFromSurvey(token, body) {
  const { p, event } = await participantByToken(token);
  const full_name = String(body.full_name || '').trim().slice(0, 120);
  const phone = String(body.phone || '').trim().slice(0, 30);
  const gender = ['male', 'female'].includes(body.gender) ? body.gender : null;
  const birth_date = /^\d{4}-\d{2}-\d{2}$/.test(body.birth_date || '') ? body.birth_date : null;
  const sport = await clubSport(event.club_id);
  let dupr;
  try {
    dupr = cleanLevel(body.dupr_level, sport);
  } catch (err) {
    throw httpError(err.message, 400, 'level');
  }
  const join_note = String(body.note || '').trim().slice(0, 1000) || null;
  if (!full_name) throw httpError('Enter your full name.', 400, 'name_required');
  if (normalizePhone(phone).length < 9) throw httpError('Enter a valid phone number.', 400, 'phone_required');
  if (!birth_date) throw httpError('Enter your date of birth.', 400, 'birth_required');

  let member = p.guest_member_id
    ? (await supabase.from('club_members').select('*').eq('id', p.guest_member_id).maybeSingle()).data
    : await findClubPerson(event.club_id, { userId: p.user_id, phone });
  if (member?.member_type === 'fixed') throw httpError('You are already a fixed member of this club.', 409, 'already_member');

  const info = {
    full_name,
    phone,
    gender,
    birth_date,
    birth_year: Number(birth_date.slice(0, 4)),
    dupr_level: dupr,
    join_requested: true,
    join_requested_at: new Date().toISOString(),
    join_note,
  };
  if (member) {
    const { data, error } = await supabase.from('club_members').update(info).eq('id', member.id).select().single();
    if (error) throw error;
    member = data;
  } else {
    await require('./plan').assertMemberRoom({ id: event.club_id, host_id: event.host_id }, 'guest');
    const { data, error } = await supabase
      .from('club_members')
      .insert({
        ...info,
        club_id: event.club_id,
        user_id: p.user_id || null,
        account_verified: !!p.user_id,
        member_type: 'guest',
        joined_on: `${event.event_date.slice(0, 7)}-01`,
      })
      .select()
      .single();
    if (error) throw error;
    member = data;
  }
  if (!p.guest_member_id) await supabase.from('event_participants').update({ guest_member_id: member.id }).eq('id', p.id);
  notifyJoinFromSurvey(event, member);
  return surveyView(token);
}

// ---- for the Host and the player portal -------------------------------------------------

// Average of the given field (1 decimal), over the answers that have it.
function avgOf(items, field) {
  const v = items.map((x) => x[field]).filter((n) => Number.isInteger(n));
  return v.length ? Math.round((10 * v.reduce((s, n) => s + n, 0)) / v.length) / 10 : null;
}

// Share (%) of "yes" among those who answered "would you come back?".
function comeBackRate(items) {
  const v = items.filter((x) => x.come_back);
  return v.length ? Math.round((100 * v.filter((x) => x.come_back === 'yes').length) / v.length) : null;
}

function summarizeAnswers(items) {
  const level = { easy: 0, right: 0, hard: 0 };
  const back = { yes: 0, maybe: 0, no: 0 };
  for (const x of items) {
    if (x.level_fit) level[x.level_fit]++;
    if (x.come_back) back[x.come_back]++;
  }
  return {
    count: items.length,
    average: avgOf(items, 'rating'),
    court: avgOf(items, 'court_rating'),
    organization: avgOf(items, 'organization_rating'),
    come_back_rate: comeBackRate(items),
    level,
    come_back: back,
    wants_join: items.filter((x) => x.wants_join).length,
  };
}

async function eventSurveys(event) {
  if (!(await guestsReady())) return { ...summarizeAnswers([]), items: [] };
  const { data, error } = await selectSurveys('rating, level_fit, comment, wants_join, created_at, event_participants(full_name)', (c) =>
    supabase.from('event_surveys').select(c).eq('event_id', event.id).order('created_at', { ascending: true })
  );
  if (error) throw error;
  const items = (data || []).map(({ event_participants, ...s }) => ({ ...s, full_name: event_participants?.full_name || null }));
  return { ...summarizeAnswers(items), items };
}

// The club's reviews over the last few months: totals, a line per month and per session,
// the latest private notes, and the people who want to join the fixed team.
async function clubSurveys(clubId, { months = 6, today } = {}) {
  const empty = { months, summary: summarizeAnswers([]), by_month: [], sessions: [], notes: [], want_join: [] };
  if (!(await guestsReady())) return empty;
  const [y, m] = (today || daysAgo(0)).split('-').map(Number);
  const from = new Date(Date.UTC(y, m - months, 1)).toISOString().slice(0, 10);
  const { data: events, error: e1 } = await supabase
    .from('events')
    .select('id, title, event_date, start_time')
    .eq('club_id', clubId)
    .gte('event_date', from)
    .neq('status', 'cancelled')
    .order('event_date', { ascending: false })
    .limit(1000);
  if (e1) throw e1;
  if (!events?.length) return empty;
  const byId = new Map(events.map((e) => [e.id, e]));
  const items = [];
  for (let i = 0; i < events.length; i += 150) {
    const ids = events.slice(i, i + 150).map((e) => e.id);
    const { data, error } = await selectSurveys('event_id, rating, level_fit, comment, wants_join, created_at, event_participants(full_name, guest_member_id, source_club_member_id)', (c) =>
      supabase.from('event_surveys').select(c).in('event_id', ids).limit(10000)
    );
    if (error) throw error;
    items.push(...(data || []));
  }
  const rows = items.map(({ event_participants: ep, ...s }) => ({ ...s, full_name: ep?.full_name || null, member_id: ep?.guest_member_id || ep?.source_club_member_id || null, event: byId.get(s.event_id) }));

  const group = (key) => {
    const map = new Map();
    for (const r of rows) {
      const k = key(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return map;
  };
  const by_month = [...group((r) => r.event.event_date.slice(0, 7)).entries()]
    .map(([month, list]) => ({ month, ...summarizeAnswers(list) }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const sessions = [...group((r) => r.event_id).entries()]
    .map(([id, list]) => ({ event_id: id, title: byId.get(id).title, date: byId.get(id).event_date, ...summarizeAnswers(list) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const newest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));
  const notes = rows
    .filter((r) => r.comment)
    .sort(newest)
    .slice(0, 50)
    .map((r) => ({ full_name: r.full_name, comment: r.comment, rating: r.rating, date: r.event.event_date, title: r.event.title, event_id: r.event_id }));

  // People who said yes to the fixed team, once each, with where their request stands.
  const wanted = rows.filter((r) => r.wants_join).sort(newest);
  const memberIds = [...new Set(wanted.map((r) => r.member_id).filter(Boolean))];
  const { data: members } = memberIds.length
    ? await supabase.from('club_members').select('id, member_type, join_requested').in('id', memberIds)
    : { data: [] };
  const memberOf = new Map((members || []).map((x) => [x.id, x]));
  const seen = new Set();
  const want_join = [];
  for (const r of wanted) {
    const key = r.member_id || `n:${String(r.full_name || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mem = memberOf.get(r.member_id);
    want_join.push({
      full_name: r.full_name,
      date: r.event.event_date,
      title: r.event.title,
      state: mem?.member_type === 'fixed' ? 'member' : mem?.join_requested ? 'requested' : 'not_yet',
    });
  }
  return { months, summary: summarizeAnswers(rows), by_month, sessions, notes, want_join };
}

// Surveys the signed-in player can still answer (sessions they played).
async function surveysDueFor(userId) {
  if (!(await guestsReady())) return [];
  const { data } = await supabase
    .from('event_participants')
    .select('id, survey_token, guest_member_id, source_club_member_id, events(title, event_date, start_time, end_time, club_id, clubs(name))')
    .eq('user_id', userId)
    .eq('status', 'checked_in')
    .not('survey_sent_at', 'is', null)
    .limit(50);
  const rows = (data || []).filter((r) => r.events?.club_id && r.events.event_date >= daysAgo(OPEN_DAYS));
  if (!rows.length) return [];
  const { data: answered } = await supabase.from('event_surveys').select('participant_id').in('participant_id', rows.map((r) => r.id));
  const done = new Set((answered || []).map((a) => a.participant_id));
  return rows
    .filter((r) => !done.has(r.id))
    .map((r) => ({ token: r.survey_token, title: r.events.title, event_date: r.events.event_date, club_name: r.events.clubs?.name || null }))
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
}

// The survey link of one registration, shown on the event page once play is over
// (so a player does not have to wait for the email or the sweeper).
async function surveyFor(event, p, now = Date.now()) {
  if (!p || p.status !== 'checked_in' || !event?.club_id || !p.survey_token) return null;
  if (now < eventEndMs(event) || event.event_date < daysAgo(OPEN_DAYS)) return null;
  if (!(await guestsReady())) return null;
  const { data } = await supabase.from('event_surveys').select('participant_id').eq('participant_id', p.id).maybeSingle();
  return { token: p.survey_token, answered: !!data };
}

module.exports = { sendDueSurveys, startSurveySweeper, surveyView, answerSurvey, joinFromSurvey, eventSurveys, clubSurveys, surveysDueFor, surveyFor, summarizeAnswers };
