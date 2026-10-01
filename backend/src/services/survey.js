// After-session survey for guests. When a club session is over, every guest who was
// checked in gets a thank-you with a private link (Telegram / email, and a card in the
// player portal). The survey asks for stars, whether the level suited them, a comment,
// and finally "Do you want to join our fixed team?" — yes opens a short member form
// whose answers land in the club's waiting list (DS chờ) for the Host to approve.
const { supabase } = require('../supabase');
const { normalizePhone } = require('./memberships');
const { eventEndMs } = require('./attendance');
const { guestsReady, findClubPerson } = require('./guests');
const { notifySurvey, notifyJoinFromSurvey, webUrl } = require('./notify');

const OPEN_DAYS = 30; // how long the link keeps working after the session
const SEND_WINDOW_DAYS = 3; // sessions older than this are not swept (e.g. right after deploying)
const LEVEL_FIT = ['easy', 'right', 'hard'];

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// Fixed members get no survey; everyone else who played does.
async function isGuestParticipant(p) {
  const id = p.guest_member_id || p.source_club_member_id;
  if (!id) return true;
  const { data } = await supabase.from('club_members').select('member_type').eq('id', id).maybeSingle();
  return data?.member_type !== 'fixed';
}

// ---- sending -------------------------------------------------------------------------

// Find guests of sessions that just ended and send them the survey (once each).
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
      if (!(await isGuestParticipant(p))) continue;
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
  const run = () => sendDueSurveys().catch((err) => console.error('survey sweep failed', err));
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
  const [{ data: answer }, member] = await Promise.all([
    supabase.from('event_surveys').select('rating, level_fit, comment, wants_join').eq('participant_id', p.id).maybeSingle(),
    p.guest_member_id
      ? supabase.from('club_members').select('*').eq('id', p.guest_member_id).maybeSingle().then((r) => r.data)
      : findClubPerson(event.club_id, { userId: p.user_id, phone: p.phone }),
  ]);
  const { data: profile } = p.user_id
    ? await supabase.from('player_profiles').select('full_name, phone, gender, birth_date, dupr_level').eq('user_id', p.user_id).maybeSingle()
    : { data: null };
  const started = Date.now() >= eventEndMs(event) - 3600000; // open from the last hour of play
  return {
    event: { title: event.title, event_date: event.event_date, start_time: event.start_time, location: event.location },
    club_name: event.clubs?.name || null,
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
      dupr_level: profile?.dupr_level ?? member?.dupr_level ?? p.dupr_level ?? '',
    },
  };
}

async function answerSurvey(token, body) {
  const { p, event } = await participantByToken(token);
  if (Date.now() < eventEndMs(event) - 3600000) throw httpError('The survey opens after the session.', 409, 'too_early');
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError('Choose 1 to 5 stars.', 400, 'rating');
  const level_fit = LEVEL_FIT.includes(body.level_fit) ? body.level_fit : null;
  const comment = String(body.comment || '').trim().slice(0, 1000) || null;
  const { error } = await supabase.from('event_surveys').upsert(
    { participant_id: p.id, event_id: event.id, rating, level_fit, comment, wants_join: !!body.wants_join },
    { onConflict: 'participant_id' }
  );
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
  const dupr = body.dupr_level === '' || body.dupr_level == null ? null : Number(body.dupr_level);
  const join_note = String(body.note || '').trim().slice(0, 1000) || null;
  if (!full_name) throw httpError('Enter your full name.', 400, 'name_required');
  if (normalizePhone(phone).length < 9) throw httpError('Enter a valid phone number.', 400, 'phone_required');
  if (!birth_date) throw httpError('Enter your date of birth.', 400, 'birth_required');
  if (dupr != null && !(dupr >= 1 && dupr <= 8)) throw httpError('DUPR level should be between 1 and 8.', 400, 'dupr');

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

async function eventSurveys(event) {
  if (!(await guestsReady())) return { count: 0, average: null, items: [] };
  const { data, error } = await supabase
    .from('event_surveys')
    .select('rating, level_fit, comment, wants_join, created_at, event_participants(full_name)')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const items = (data || []).map(({ event_participants, ...s }) => ({ ...s, full_name: event_participants?.full_name || null }));
  const average = items.length ? Math.round((10 * items.reduce((s, x) => s + x.rating, 0)) / items.length) / 10 : null;
  return { count: items.length, average, items };
}

// Surveys the signed-in player can still answer (sessions they played as a guest).
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

module.exports = { sendDueSurveys, startSurveySweeper, surveyView, answerSurvey, joinFromSurvey, eventSurveys, surveysDueFor };
