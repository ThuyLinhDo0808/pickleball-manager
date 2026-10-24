const express = require('express');
const { assertFeature } = require('../services/plan');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid, pick } = require('../utils/respond');
const { actingHost, eventAccess, coAdminClubIds, ROLE_FORBIDDEN } = require('../services/clubAccess');
const { checkCapacity, limitBody } = require('../middleware/checkCapacity');
const { requireAuth } = require('../middleware/auth');
const { normalizePhone, findClubMemberByPhone, todayYmd } = require('../services/memberships');
const {
  ATTENDANCE_ACTIONS,
  setAttendance,
  cancelParticipant,
  waiveLateCancel,
  promoteParticipant,
  checkInByCode,
  setPlace,
  tiersReady,
} = require('../services/attendance');
const signup = require('../services/signup');
const { notifyEventCancelled } = require('../services/notify');
const { suspensionOf } = require('../services/owner');
const { HOLDS_PLACE } = require('../services/fees');
const { perksFor, ensureGuestMember, memberForUser, findClubPerson, guestsReady } = require('../services/guests');
const survey = require('../services/survey');
const votes = require('../services/votes');
const meeting = require('../services/meetingMoney');
const { itemMetrics } = require('../services/inventory');
const { clubSport } = require('../services/sport');
const { linkByPhone } = require('../services/phoneLink');
const { HOST_STATUSES, completeFinished, completeIfFinished } = require('../services/eventStatus');
const { cleanCostItems, sameItems, syncEventCosts } = require('../services/eventCosts');
const { randomUUID } = require('crypto');

const router = express.Router();
const MAIN_LIST = HOLDS_PLACE; // registered, checked_in, pending (payment being checked)

function nowIso() {
  return new Date().toISOString();
}

// ---- PUBLIC routes (no auth) — must be registered before requireAuth below,
// so a matching request is handled here and never falls through to it. ------
// Only what a player needs to see — no host id, fees config internals, or phones.
const PUBLIC_EVENT_FIELDS = [
  'title', 'event_date', 'start_time', 'end_time', 'location', 'courts', 'court_labels', 'slots',
  'level_min', 'level_max', 'level_min_f', 'level_max_f', 'fee_amount', 'status', 'registration_deadline',
  'allow_public_registration', 'notice', 'club_name', 'main_count', 'waitlist_count',
  'cancel_deadline_hours', 'cancel_half_hours', 'no_refund', 'kind', 'services', 'play_format', 'map_url', 'allow_pay_later', 'series_label',
  'members_only', 'public_from',
];

// The club's Google Maps link: used for an event that has no link of its own.
async function clubMapUrl(clubId) {
  if (!clubId || !(await require('../services/clubRequests').mapReady())) return null;
  const { data } = await supabase.from('clubs').select('map_url').eq('id', clubId).maybeSingle();
  return data?.map_url || null;
}

// Short links: /e/<8 characters> stands for the event's full public token.
router.param('publicToken', async (req, res, next, token) => {
  if (isUuid(token) || !/^[0-9a-z]{6,12}$/i.test(token || '')) return next();
  const { data, error } = await supabase.from('events').select('public_token').eq('short_code', token.toLowerCase()).maybeSingle();
  if (error) return dbError(res, error);
  if (data) req.params.publicToken = data.public_token;
  next();
});

router.get('/public/:publicToken', async (req, res) => {
  if (!isUuid(req.params.publicToken)) return notFound(res, 'Event');
  const { data: event, error } = await supabase
    .from('v_event_summary')
    .select('*')
    .eq('public_token', req.params.publicToken)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!event) return notFound(res, 'Event');
  try {
    await signup.expireHolds(event);
  } catch (err) {
    // Housekeeping only — never keep players from seeing the event (e.g. a migration not run yet).
    console.error('expireHolds failed on public page', err);
  }

  const cols = 'id, full_name, dupr_level, status, joined_at, is_organizer, user_id, source_club_member_id, guest_member_id';
  // Players with a place or on the waitlist (not requests waiting for the Host, nor organizers who don't play).
  const listOf = (c) => supabase.from('event_participants').select(c).eq('event_id', event.id).not('status', 'in', '(cancelled,no_show,requested,not_playing)').order('joined_at', { ascending: true });
  let { data: people, error: pErr } = await listOf(`${cols}, dupr_id, gender`);
  if (pErr) ({ data: people, error: pErr } = await listOf(`${cols}, dupr_id`));
  if (pErr) ({ data: people, error: pErr } = await listOf(cols)); // before 20261130090000_dupr_shared.sql
  if (pErr) return dbError(res, pErr);

  let closedCode = null;
  // The organiser's account is suspended by the app owner: no new sign-ups.
  if (await suspensionOf(event.host_id)) closedCode = 'suspended';
  else if (!event.allow_public_registration) closedCode = 'disabled';
  else if (!['draft', 'open'].includes(event.status)) closedCode = 'not_open';
  else if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) closedCode = 'deadline';

  res.json({
    ...pick(event, PUBLIC_EVENT_FIELDS),
    map_url: event.map_url || (await clubMapUrl(event.club_id).catch(() => null)),
    sport: await clubSport(event.club_id), // levels show as DUPR or badminton steps
    // Xé vé (a community's kèo, or a one-off kèo): the page shows the rules to agree to.
    xeve: !event.club_id || (await supabase.from('clubs').select('kind').eq('id', event.club_id).maybeSingle()).data?.kind === 'community',
    registration_open: !closedCode,
    closed_code: closedCode,
    // Riêng tư — thành viên trước: only the club's members can sign up right now.
    members_only_now: signup.membersOnlyNow(event),
    participants: await publicPlayerInfo(event, people).catch((err) => {
      console.error('public player info', err.message);
      return people.map((p) => ({ full_name: p.full_name, dupr_level: p.dupr_level, status: p.status, is_organizer: p.is_organizer }));
    }),
    public_token: event.public_token,
    // Time groups (giờ / phí / còn chỗ): the player picks one when signing up.
    groups: await require('../services/eventGroups').publicGroups(event).catch(() => null),
    // "Đăng ký nhanh" for players who are not members yet (quick booking, /g/<id>/p-<token>).
    id: event.id,
  });
});

// What the sign-up page shows for each player: gender, DUPR doubles rating + reliability
// (from the club's DUPR import) and how many of their matches recorded here were sent to DUPR.
// No phone, email or ids.
async function publicPlayerInfo(event, people) {
  const memberIds = [...new Set(people.map((p) => p.source_club_member_id || p.guest_member_id).filter(Boolean))];
  const userIds = [...new Set(people.map((p) => p.user_id).filter(Boolean))];
  const [{ data: members }, { data: profiles }] = await Promise.all([
    memberIds.length || (userIds.length && event.club_id)
      ? supabase.from('club_members').select('*').or([memberIds.length ? `id.in.(${memberIds.join(',')})` : null, userIds.length && event.club_id ? `and(club_id.eq.${event.club_id},user_id.in.(${userIds.join(',')}))` : null].filter(Boolean).join(','))
      : { data: [] },
    userIds.length ? supabase.from('player_profiles').select('user_id, gender').in('user_id', userIds) : { data: [] },
  ]);
  const byId = new Map((members || []).map((m) => [m.id, m]));
  const byUser = new Map((members || []).filter((m) => m.user_id && m.club_id === event.club_id).map((m) => [m.user_id, m]));
  const genderOf = new Map((profiles || []).map((x) => [x.user_id, x.gender]));
  const memberOf = (p) => byId.get(p.source_club_member_id || p.guest_member_id) || (p.user_id && byUser.get(p.user_id)) || null;
  // Matches sent to DUPR, per member (club matches and kèo matches they played in).
  const mids = [...new Set(people.map((p) => memberOf(p)?.id).filter(Boolean))];
  const duprCount = new Map();
  if (mids.length) {
    const { data: rows } = await supabase.from('event_participants').select('id, source_club_member_id, guest_member_id').or(`source_club_member_id.in.(${mids.join(',')}),guest_member_id.in.(${mids.join(',')})`).limit(5000);
    const memberOfPid = new Map((rows || []).map((r) => [r.id, r.source_club_member_id || r.guest_member_id]));
    const pids = [...memberOfPid.keys()];
    const ors = [`club_member_id.in.(${mids.join(',')})`];
    if (pids.length) ors.push(`event_participant_id.in.(${pids.slice(0, 2000).join(',')})`);
    const { data: mp } = await supabase.from('match_players').select('match_id, club_member_id, event_participant_id, matches!inner(dupr_exported_at)').or(ors.join(',')).not('matches.dupr_exported_at', 'is', null).limit(10000);
    const seen = new Map();
    for (const r of mp || []) {
      const mid = r.club_member_id || memberOfPid.get(r.event_participant_id);
      if (!mid) continue;
      if (!seen.has(mid)) seen.set(mid, new Set());
      seen.get(mid).add(r.match_id);
    }
    for (const [k, v] of seen) duprCount.set(k, v.size);
  }
  const shared = await require('../services/dupr').latestRatings(people.filter((p) => !memberOf(p)?.dupr_synced_at).map((p) => memberOf(p)?.dupr_id || p.dupr_id)).catch(() => new Map());
  // Player photos: the account and the photo's version, only for those who have one.
  const accountOf = (p) => p.user_id || memberOf(p)?.user_id || null;
  const photoV = await require('../services/playerAvatars').versions(people.map(accountOf)).catch(() => new Map());
  return people.map((p) => {
    const m = memberOf(p);
    const uid = accountOf(p);
    const g = m?.gender || genderOf.get(p.user_id) || p.gender || null;
    const sh = m?.dupr_synced_at ? null : shared.get(m?.dupr_id || p.dupr_id);
    return {
      full_name: p.full_name,
      dupr_level: p.dupr_level,
      status: p.status,
      is_organizer: p.is_organizer,
      gender: g === 'male' || g === 'female' ? g : null,
      dupr: sh?.doubles ?? (m?.dupr_doubles != null ? Number(m.dupr_doubles) : null),
      dupr_rel: sh ? sh.doubles_rel ?? null : m?.dupr_doubles_rel ?? null,
      dupr_matches: m ? duprCount.get(m.id) || 0 : null,
      ...(uid && photoV.has(uid) ? { avatar_uid: uid, avatar_v: photoV.get(uid) } : {}),
    };
  });
}

// ---- Meeting vote link (/v/<token>) ---------------------------------------------
// A club meeting / get-together shared by link: anyone sees what, when, where, the fee
// and who is coming; signed-in players (members or not) vote Coming / Not coming. A
// voter from outside the club joins its guest list.
async function meetingByToken(req, res) {
  if (!isUuid(req.params.publicToken)) {
    notFound(res, 'Event');
    return null;
  }
  const { data: event, error } = await supabase.from('events').select('*, clubs(name)').eq('public_token', req.params.publicToken).maybeSingle();
  if (error) {
    dbError(res, error);
    return null;
  }
  if (!event || event.kind !== 'meeting' || !event.club_id) {
    notFound(res, 'Event');
    return null;
  }
  return event;
}
const votingClosed = (e) => e.status === 'cancelled' || e.event_date < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

async function meetingView(event) {
  const { data: rows, error } = await supabase.from('event_votes').select('choice, updated_at, club_members(full_name)').eq('event_id', event.id).order('updated_at');
  if (error) throw error;
  const yes = (rows || []).filter((r) => r.choice === 'yes');
  return {
    title: event.title,
    event_date: event.event_date,
    start_time: event.start_time,
    end_time: event.end_time,
    location: event.location,
    map_url: event.map_url,
    fee_amount: event.fee_amount,
    notice: event.notice,
    status: event.status,
    club_name: event.clubs?.name || null,
    closed: votingClosed(event),
    yes: yes.length,
    no: (rows || []).length - yes.length,
    coming: yes.map((r) => r.club_members?.full_name).filter(Boolean),
  };
}

router.get('/public/:publicToken/vote', async (req, res) => {
  const event = await meetingByToken(req, res);
  if (!event) return;
  try {
    res.json(await meetingView(event));
  } catch (err) {
    dbError(res, err);
  }
});

router.get('/public/:publicToken/vote/me', requireAuth, async (req, res) => {
  const event = await meetingByToken(req, res);
  if (!event) return;
  try {
    const profile = await playerProfile(req.userId);
    const member = await findClubPerson(event.club_id, { userId: req.userId, phone: profile?.phone });
    let myVote = null;
    if (member) {
      const { data } = await supabase.from('event_votes').select('choice').eq('event_id', event.id).eq('club_member_id', member.id).maybeSingle();
      myVote = data?.choice || null;
    }
    res.json({ profile, in_club: !!member, member_type: member?.member_type || null, my_vote: myVote });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/public/:publicToken/vote', requireAuth, async (req, res) => {
  const event = await meetingByToken(req, res);
  if (!event) return;
  const choice = req.body?.choice ?? null;
  if (choice !== null && !votes.CHOICES.includes(choice)) return res.status(400).json({ error: 'choice must be yes, no or null.' });
  try {
    if (votingClosed(event)) return res.status(409).json({ error: 'Voting is closed.', code: 'closed' });
    const member = await memberForUser(event, req.userId);
    if (!member) return res.status(400).json({ error: 'Add your name and phone to your profile first.', code: 'profile_required' });
    await votes.castVote(event.id, member.id, choice, false);
    res.json({ my_vote: choice, ...(await meetingView(event)) });
  } catch (err) {
    fail(res, err);
  }
});

// ---- Signed-in player on the public page ------------------------------------
// Sign-ups need an account: it tells a verified club member from a guest, and guests
// pay (and get their ticket) through it.
async function publicEvent(req, res) {
  if (!isUuid(req.params.publicToken)) {
    notFound(res, 'Event');
    return null;
  }
  const { data: event, error } = await supabase.from('events').select('*').eq('public_token', req.params.publicToken).maybeSingle();
  if (error) {
    dbError(res, error);
    return null;
  }
  if (!event) notFound(res, 'Event');
  return event;
}

function fail(res, err) {
  // reason / until: why and how long a player is kept out (blocked / suspended by the club).
  return err.status ? res.status(err.status).json({ error: err.message, code: err.code, ...(err.reason ? { reason: err.reason } : {}), ...(err.until ? { until: err.until } : {}), ...(err.public_from !== undefined ? { public_from: err.public_from } : {}) }) : dbError(res, err);
}

async function playerProfile(userId) {
  const { data } = await supabase.from('player_profiles').select('*').eq('user_id', userId).maybeSingle();
  return data;
}

// My standing (member / pending verification / guest) and my registration, with payment details when owed.
router.get('/public/:publicToken/me', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
  try {
    await signup.expireHolds(event);
    const profile = await playerProfile(req.userId);
    await linkByPhone(req.userId, profile); // same phone as a club member -> that member
    const mine = await signup.myRegistration(event, req.userId);
    const { standing, participant } = mine;
    // Guest perk (priority / VIP price) the club gave this player, if any.
    const perks = standing.state === 'verified' ? null : await perksFor(event, { userId: req.userId, phone: profile?.phone });
    const { data: acct } = await supabase.from('users').select('gender').eq('id', req.userId).maybeSingle();
    res.json({
      profile,
      account_gender: acct?.gender || null, // asked at sign-up; fills the quick profile form
      email: await require('../services/emailVerify').status(req.userId).catch(() => null),
      // A Top-month voucher this player could use here (shown with a tick on the sign-up).
      voucher: participant && participant.status !== 'cancelled' ? null : await require('../services/race').usableVoucher(event, req.userId).then((v) => (v ? { id: v.id, kind: v.kind, rank: v.rank, month: v.month, expires_on: v.expires_on } : null)).catch(() => null),
      member: {
        guest_perk: perks?.perk || null,
        my_fee: perks?.fee_amount ?? null,
        discount_pct: perks?.discount_pct ?? null,
        state: standing.state, // 'verified' | 'pending' | 'guest' | 'none'
        is_club_event: !!event.club_id,
        has_pass: !!standing.pass,
        // the Host checks this player before they get a place (and pay)
        needs_approval: await signup.needsApproval(event, standing, req.userId),
        // "register now, transfer later" is possible until then (null = not offered)
        pay_later_until: signup.payLaterUntil(event),
        sessions_remaining: standing.pass ? (standing.pass.sessions_included === 0 ? null : standing.pass.sessions_remaining) : null,
      },
      registration: await signup.registrationView(event, participant),
      survey: await survey.surveyFor(event, participant).catch(() => null),
    });
  } catch (err) {
    fail(res, err);
  }
});

// "Lịch chơi" of a kèo for a player who has a place in it (or its Host): who plays on which
// court (updated when the Host moves people), the scored matches, the session rankings and
// the challenge matches. No phone, email or account ids.
router.get('/public/:publicToken/live', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
  try {
    const { participant } = await signup.myRegistration(event, req.userId);
    const isHost = event.host_id === req.userId;
    if (!isHost && !(participant && ['registered', 'checked_in', 'pending'].includes(participant.status))) {
      return res.status(403).json({ error: 'Only players of this kèo see its schedule.', code: 'not_playing' });
    }
    const eg = require('../services/eventGroups');
    const moves = await movesReady();
    const base = 'id, full_name, dupr_level, status, joined_at, is_organizer, user_id, source_club_member_id, guest_member_id, group_id, dupr_id, gender';
    const { data: people, error: pErr } = await supabase
      .from('event_participants')
      .select(moves ? `${base}, group_moved_at, group_moved_from` : base)
      .eq('event_id', event.id)
      .in('status', ['registered', 'checked_in', 'pending'])
      .order('joined_at', { ascending: true });
    if (pErr) throw pErr;
    const cards = await publicPlayerInfo(event, people).catch(() => people.map((p) => ({ full_name: p.full_name, status: p.status })));
    const { data: matches, error: mErr } = await supabase
      .from('matches')
      .select('id, team1_score, team2_score, played_at, created_at, is_challenge, challenge_reward, match_players(team, event_participant_id, club_member_id, event_participants(full_name), club_members(full_name))')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true });
    let rows = matches;
    if (mErr) {
      // Before the challenge migration.
      const r = await supabase.from('matches').select('id, team1_score, team2_score, played_at, created_at, match_players(team, event_participant_id, club_member_id, event_participants(full_name), club_members(full_name))').eq('event_id', event.id).order('created_at', { ascending: true });
      if (r.error) throw r.error;
      rows = r.data;
    }
    const since = Date.now() - 24 * 3600000;
    res.json({
      event: { id: event.id, title: event.title, event_date: event.event_date, start_time: event.start_time, end_time: event.end_time, slots: event.slots || null, status: event.status, schedule_changed_at: event.schedule_changed_at || null },
      groups: await eg.publicGroups(event).catch(() => null),
      me: participant ? { id: participant.id, group_id: participant.group_id || null } : null,
      players: people.map((p, i) => ({ ...cards[i], id: p.id, group_id: p.group_id || null, me: participant?.id === p.id })),
      // Court moves of the last day, newest first: "A đã được điều chuyển sang chơi sân …".
      moves: people
        .filter((p) => p.group_moved_at && Date.parse(p.group_moved_at) > since)
        .sort((a, b) => b.group_moved_at.localeCompare(a.group_moved_at))
        .map((p) => ({ id: p.id, full_name: p.full_name, to: p.group_id, from: p.group_moved_from, at: p.group_moved_at, me: participant?.id === p.id })),
      matches: rows || [],
    });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/public/:publicToken/register', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
  if (await suspensionOf(event.host_id)) return res.status(423).json({ error: 'Sign-ups for this event are paused.', code: 'organiser_suspended' });
  try {
    const profile = await playerProfile(req.userId);
    await linkByPhone(req.userId, profile);
    res.status(201).json(await signup.registerOnline(event, req.userId, profile, { payLater: req.body?.pay_later === true, useVoucher: req.body?.use_voucher !== false, groupId: req.body?.group_id || null }));
  } catch (err) {
    fail(res, err);
  }
});

// "Chuyển khoản sau": keep my place until the sign-up deadline and pay later.
router.post('/public/:publicToken/pay-later', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
  try {
    const { participant } = await signup.myRegistration(event, req.userId);
    if (!participant) throw Object.assign(new Error('You are not registered for this event.'), { status: 404, code: 'not_registered' });
    res.json(await signup.payLater(event, participant));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/public/:publicToken/payment-proof', requireAuth, async (req, res) => {
  const event = await publicEvent(req, res);
  if (!event) return;
  try {
    const { participant } = await signup.myRegistration(event, req.userId);
    if (!participant) throw Object.assign(new Error('You are not registered for this event.'), { status: 404, code: 'not_registered' });
    res.json(await signup.submitProof(event, participant, req.body.image));
  } catch (err) {
    fail(res, err);
  }
});

// Everything below requires the authenticated Host.
router.use(requireAuth);

// ---- ownership guard for :eventId -----------------------------------------
router.param('eventId', async (req, res, next, eventId) => {
  if (!isUuid(eventId)) return notFound(res, 'Event');
  const { data, error } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
  if (error) return dbError(res, error);
  // The event's host, or a co-admin of its club (who then acts as the owner).
  const access = await eventAccess(req, data).catch(() => null);
  if (!access) return req.roleForbidden ? res.status(403).json(ROLE_FORBIDDEN) : notFound(res, 'Event');
  req.hostId = access.hostId;
  req.coAdmin = access.coAdmin;
  req.event = await completeIfFinished(data);
  next();
});

router.param('participantId', async (req, res, next, participantId) => {
  if (!isUuid(participantId)) return notFound(res, 'Participant');
  const { data, error } = await supabase
    .from('event_participants')
    .select('*')
    .eq('id', participantId)
    .eq('event_id', req.event.id)
    .maybeSingle();
  if (error) return dbError(res, error);
  if (!data) return notFound(res, 'Participant');
  req.participant = data;
  next();
});

// ---- Events CRUD (schedule) -------------------------------------------------
// The host the event belongs to: the club's owner (also for its co-admins), or the
// signed-in account for a standalone Xé Vé event. null = not allowed.
async function hostForClub(req, clubId) {
  if (!clubId) return req.userId || req.hostId; // standalone (Xé Vé) event
  if (!isUuid(clubId)) return null;
  return actingHost(req, clubId);
}

const EVENT_KINDS = ['weekly', 'game', 'training', 'meeting', 'challenge'];

// Normalises optional fields in place; returns an error message or null.
async function genderLevelsReady() {
  const st = await require('../services/schemaCheck').schemaStatus();
  return !st.missing_migrations.includes('20261201090000_gender_levels.sql');
}

async function noRefundReady() {
  const st = await require('../services/schemaCheck').schemaStatus();
  return !st.missing_migrations.includes('20261205090000_no_refund.sql');
}

// Time groups (giờ / phí / số chỗ / sân riêng) and court numbers; the event row carries the
// total places, earliest start, latest end, lowest fee. Dropped before the migration.
async function applyGroups(fields) {
  if (!('groups' in fields) && !('court_labels' in fields)) return null;
  const eg = require('../services/eventGroups');
  if (!(await eg.ready())) {
    delete fields.groups;
    delete fields.court_labels;
    return null;
  }
  if ('court_labels' in fields) {
    const list = eg.courtList(fields.court_labels);
    fields.court_labels = list.join(', ') || null;
    if (list.length) fields.courts = list.length;
  }
  if ('groups' in fields) {
    const r = eg.cleanGroups(fields.groups);
    if (r.error) return r.error;
    fields.groups = r.groups;
    Object.assign(fields, r.derived);
  }
  return null;
}

function cleanEventFields(fields) {
  // Host picks open / completed / cancelled only (no drafts, no "closed": a session that
  // won't happen is cancelled, or deleted while nobody has signed up).
  if ('status' in fields && !HOST_STATUSES.includes(fields.status)) return `status must be one of ${HOST_STATUSES.join(', ')}.`;
  if ('kind' in fields && !EVENT_KINDS.includes(fields.kind)) return `kind must be one of ${EVENT_KINDS.join(', ')}.`;
  if ('cancel_deadline_hours' in fields) {
    const v = fields.cancel_deadline_hours;
    if (v === '' || v == null) fields.cancel_deadline_hours = null;
    else if (!(Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 168)) return 'cancel_deadline_hours must be 0-168.';
    else fields.cancel_deadline_hours = Number(v);
  }
  // 50% refund tier: fewer hours than the full-refund one, else dropped (no 50% tier).
  if ('cancel_half_hours' in fields) {
    const v = fields.cancel_half_hours;
    if (v === '' || v == null) fields.cancel_half_hours = null;
    else if (!(Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 168)) return 'cancel_half_hours must be 0-168.';
    else fields.cancel_half_hours = Number(v);
    const full = 'cancel_deadline_hours' in fields ? fields.cancel_deadline_hours : undefined;
    if (full === null || (full != null && fields.cancel_half_hours != null && fields.cancel_half_hours >= full)) fields.cancel_half_hours = null;
  }
  if (fields.start_time && fields.end_time && fields.end_time <= fields.start_time) return 'end_time must be after start_time.';
  if ('services' in fields) {
    const v = fields.services == null ? '' : String(fields.services).trim();
    if (v.length > 300) return 'services: at most 300 characters.';
    fields.services = v || null;
  }
  if ('play_format' in fields) {
    if (fields.play_format === '' || fields.play_format == null) fields.play_format = null;
    else if (!PLAY_FORMATS.includes(fields.play_format)) return `play_format must be one of ${PLAY_FORMATS.join(', ')}.`;
  }
  if ('map_url' in fields) {
    const v = fields.map_url == null ? '' : String(fields.map_url).trim();
    if (v && (v.length > 500 || !/^https:\/\/\S+$/i.test(v))) return 'map_url must be an https link (Google Maps).';
    fields.map_url = v || null;
  }
  // Women's DUPR range (levels split by gender); empty = the same range as everyone.
  for (const k of ['level_min_f', 'level_max_f']) {
    if (!(k in fields)) continue;
    const v = fields[k];
    if (v === '' || v == null) fields[k] = null;
    else if (!(Number(v) >= 0 && Number(v) <= 8)) return `${k} must be 0-8.`;
    else fields[k] = Math.round(Number(v) * 100) / 100;
  }
  if (fields.level_min_f != null && fields.level_max_f != null && fields.level_max_f < fields.level_min_f) return "The women's upper level is below the lower one.";
  if ('level_keys' in fields) {
    // Kèo for some levels of the community (keys from its control panel).
    const keys = Array.isArray(fields.level_keys) ? [...new Set(fields.level_keys.map((k) => String(k)))] : [];
    if (keys.length > 12 || keys.some((k) => !/^[a-z0-9_-]{1,20}$/i.test(k))) return 'level_keys: up to 12 level keys.';
    fields.level_keys = keys.length ? keys : null;
  }
  // Riêng tư — thành viên trước: members only, until public_from (empty = until made public).
  if ('members_only' in fields) fields.members_only = fields.members_only === true;
  if ('public_from' in fields) {
    if (fields.public_from == null || fields.public_from === '') fields.public_from = null;
    else if (Number.isNaN(Date.parse(fields.public_from))) return 'public_from must be a date and time.';
    else fields.public_from = new Date(fields.public_from).toISOString();
  }
  if ('series_label' in fields) {
    const v = fields.series_label == null ? '' : String(fields.series_label).trim();
    if (v.length > 40) return 'series_label: at most 40 characters.';
    fields.series_label = v || null;
  }
  if ('auto_approve' in fields) fields.auto_approve = fields.auto_approve === true || fields.auto_approve === 'true';
  if ('allow_pay_later' in fields) fields.allow_pay_later = !(fields.allow_pay_later === false || fields.allow_pay_later === 'false');
  if ('cost_items' in fields) {
    const { items, error } = cleanCostItems(fields.cost_items);
    if (error) return error;
    fields.cost_items = items;
  }
  return null;
}
const PLAY_FORMATS = ['men', 'women', 'mixed', 'open'];
const membersFirstReady = async () => !(await require('../services/schemaCheck').schemaStatus()).missing_migrations.includes('20261215090000_members_first.sql');
// A Social Manager community runs kèo, training and weekly play — no meetings / round robin.
const NOT_FOR_COMMUNITY = ['meeting', 'challenge'];
// The club row's kind ('club' / 'community') for plan checks.
async function clubKindOf(clubId) {
  if (!clubId) return null;
  const { data } = await supabase.from('clubs').select('kind').eq('id', clubId).maybeSingle();
  return data;
}
async function kindAllowed(clubId, kind) {
  if (!clubId || !NOT_FOR_COMMUNITY.includes(kind)) return true;
  const { data } = await supabase.from('clubs').select('kind').eq('id', clubId).maybeSingle();
  return data?.kind !== 'community';
}
// Fields a weekly schedule edit copies to every upcoming session (each keeps its own day).
const SERIES_FIELDS = [
  'auto_approve', 'allow_pay_later', 'series_label', 'level_keys', 'title', 'start_time', 'end_time', 'location', 'map_url', 'courts', 'court_labels', 'groups', 'slots', 'level_min', 'level_max', 'level_min_f', 'level_max_f',
  'fee_amount', 'services', 'play_format', 'notice', 'cancel_deadline_hours', 'cancel_half_hours', 'no_refund', 'allow_public_registration', 'cost_items',
  'members_only',
];

function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Transfer screenshots waiting for the Host on their upcoming events. ?club_id= keeps it to
// one club / community (the finance page of that space), so spaces never mix.
router.get('/pending-payments', async (req, res) => {
  // Payments to review: the owner's, co-admins' and Finance's clubs (not Operations).
  const shared = await coAdminClubIds(req, ['co_admin', 'finance']).catch(() => []);
  const clubId = req.query.club_id;
  if (clubId !== undefined && !isUuid(clubId)) return res.json([]);
  let base = supabase.from('events').select('id, title, event_date, start_time, fee_amount, club_id');
  if (clubId) base = base.eq('club_id', clubId);
  const { data: events, error } = await (shared.length ? base.or(`host_id.eq.${req.hostId},club_id.in.(${shared.join(',')})`) : base.eq('host_id', req.hostId))
    .gte('event_date', new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  if (error) return dbError(res, error);
  if (!events.length) return res.json([]);
  const { data: rows, error: pErr } = await supabase
    .from('event_participants')
    .select('id, event_id, full_name, phone, kind, fee_amount, payment_ref, payment_submitted_at, guest_booking_id')
    .in('event_id', events.map((e) => e.id))
    .eq('status', 'pending')
    .eq('payment_status', 'proof_submitted')
    .order('payment_submitted_at', { ascending: true });
  if (pErr) return dbError(res, pErr);
  const byId = new Map(events.map((e) => [e.id, e]));
  const bookings = await require('../services/quickBooking').bookingsFor(rows).catch(() => new Map());
  res.json(rows.map((r) => {
    const e = byId.get(r.event_id);
    return { ...r, booking: bookings.get(r.guest_booking_id) || null, event: { id: e.id, title: e.title, event_date: e.event_date, start_time: e.start_time }, amount: Number(r.fee_amount ?? e.fee_amount ?? 0) };
  }));
});

// The Host's 🔔: who signed up lately (last 7 days) on their upcoming events — the owner's,
// co-admins' and Operations' clubs — newest first. The page keeps "seen up to" itself.
router.get('/recent-signups', async (req, res) => {
  const shared = await coAdminClubIds(req, ['co_admin', 'operator']).catch(() => []);
  const base = supabase.from('events').select('id, title, event_date, start_time, club_id');
  const { data: events, error } = await (shared.length ? base.or(`host_id.eq.${req.hostId},club_id.in.(${shared.join(',')})`) : base.eq('host_id', req.hostId))
    .gte('event_date', new Date(Date.now() - 86400000).toISOString().slice(0, 10))
    .neq('status', 'cancelled');
  if (error) return dbError(res, error);
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  // No upcoming kèo: nothing to look up by event (join requests can still come in).
  const NONE = '00000000-0000-0000-0000-000000000000';
  const { data: rows, error: pErr } = await supabase
    .from('event_participants')
    .select('id, event_id, full_name, status, payment_status, joined_at, is_organizer, guest_booking_id')
    .in('event_id', events.length ? events.map((e) => e.id) : [NONE])
    .gte('joined_at', since)
    .neq('status', 'cancelled')
    .eq('is_organizer', false)
    .order('joined_at', { ascending: false })
    .limit(40);
  if (pErr) return dbError(res, pErr);
  const byId = new Map(events.map((e) => [e.id, e]));
  // Ticket passes waiting for the Host (find a taker / check the money).
  let passes = [];
  if (await require('../services/ticketPass').ready()) {
    const { data: ps } = await supabase.from('event_ticket_passes').select('id, event_id, from_participant_id, status, created_at, submitted_at').in('event_id', events.length ? events.map((e) => e.id) : [NONE]).in('status', ['open', 'proof_submitted']).gte('created_at', since).limit(20);
    const fromIds = (ps || []).map((x) => x.from_participant_id);
    const { data: who } = fromIds.length ? await supabase.from('event_participants').select('id, full_name').in('id', fromIds) : { data: [] };
    const nameOf = new Map((who || []).map((x) => [x.id, x.full_name]));
    passes = (ps || []).map((x) => ({ id: `pass-${x.id}`, event_id: x.event_id, full_name: nameOf.get(x.from_participant_id) || '—', status: x.status === 'open' ? 'pass_open' : 'pass_proof', joined_at: x.submitted_at || x.created_at, event: byId.get(x.event_id) }));
  }
  const evIds = events.length ? events.map((e) => e.id) : [NONE];
  // Transfer screenshots sent, and players who cancelled their place.
  const [{ data: proofs }, { data: cancels }] = await Promise.all([
    supabase.from('event_participants').select('id, event_id, full_name, payment_submitted_at').in('event_id', evIds).eq('payment_status', 'proof_submitted').gte('payment_submitted_at', since).limit(30),
    supabase.from('event_participants').select('id, event_id, full_name, cancelled_at, cancelled_by').in('event_id', evIds).eq('status', 'cancelled').gte('cancelled_at', since).limit(30),
  ]);
  const proofItems = (proofs || []).map((x) => ({ id: `proof-${x.id}`, event_id: x.event_id, full_name: x.full_name, status: 'proof_sent', joined_at: x.payment_submitted_at, event: byId.get(x.event_id) }));
  const cancelItems = (cancels || []).filter((x) => x.cancelled_by !== 'host').map((x) => ({ id: `cancel-${x.id}`, event_id: x.event_id, full_name: x.full_name, status: 'cancelled', joined_at: x.cancelled_at, event: byId.get(x.event_id) }));
  // People asking to join a club / community the Host runs.
  let joins = [];
  try {
    const clubIds = [...new Set([...(await supabase.from('clubs').select('id').eq('host_id', req.hostId)).data?.map((c) => c.id) || [], ...shared])];
    if (clubIds.length && (await guestsReady())) {
      const { data: js } = await supabase.from('club_members').select('id, club_id, full_name, join_requested_at, clubs(name)').in('club_id', clubIds).eq('join_requested', true).gte('join_requested_at', since).limit(20);
      joins = (js || []).map((x) => ({ id: `join-${x.id}`, href: '/club/members/requests', club_id: x.club_id, full_name: x.full_name, status: 'join', joined_at: x.join_requested_at, event: { title: x.clubs?.name || '' } }));
    }
  } catch (err) {
    console.error('bell: join requests', err);
  }
  // Everything that needs the Host or tells them what changed, newest first.
  res.json(
    [...rows.map((r) => ({ ...r, event: byId.get(r.event_id) })), ...passes, ...proofItems, ...cancelItems, ...joins]
      .sort((a, b) => String(b.joined_at).localeCompare(String(a.joined_at)))
      .slice(0, 60)
  );
});

// ?scope=standalone -> only events not tied to a club (Xé Vé workspace).
router.get('/', async (req, res) => {
  await completeFinished({ hostId: req.hostId });
  let query = supabase.from('v_event_summary').select('*');
  // My own events, plus the sessions of clubs I co-administer (not for Xé Vé).
  const shared = req.query.scope === 'standalone' ? [] : await coAdminClubIds(req).catch(() => []);
  query = shared.length ? query.or(`host_id.eq.${req.hostId},club_id.in.(${shared.join(',')})`) : query.eq('host_id', req.hostId);
  if (req.query.scope === 'standalone') query = query.is('club_id', null);
  const { data, error } = await query.order('event_date', { ascending: true });
  if (error) return dbError(res, error);
  // Kèo marked for some community levels (Series A, B…): their names, so the schedule can
  // tell apart sessions that look the same.
  const clubIds = [...new Set((data || []).filter((e) => Array.isArray(e.level_keys) && e.level_keys.length && e.club_id).map((e) => e.club_id))];
  if (clubIds.length) {
    const { data: cl } = await supabase.from('clubs').select('id, community_settings').in('id', clubIds);
    const cs = require('../services/communitySettings');
    const names = new Map((cl || []).map((c) => [c.id, new Map(cs.resolve(c.community_settings).levels.items.map((it) => [String(it.key), it.name || it.label || String(it.key)]))]));
    for (const e of data) {
      if (Array.isArray(e.level_keys) && e.level_keys.length) e.level_names = e.level_keys.map((k) => names.get(e.club_id)?.get(String(k))).filter(Boolean);
    }
  }
  res.json(data);
});

// `repeat_weeks` (1-26) creates the same session every week — the club's recurring schedule.
router.post('/', async (req, res) => {
  const { title } = req.body;
  // `dates`: explicit list of days (weekly schedule: e.g. every Tue/Thu/Sat between two dates).
  let dates = null;
  if (Array.isArray(req.body.dates)) {
    dates = [...new Set(req.body.dates.map(String))].sort();
    if (!dates.length || dates.length > 200 || !dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)))) {
      return res.status(400).json({ error: 'dates must be 1-200 days (YYYY-MM-DD).' });
    }
  }
  const event_date = dates ? dates[0] : req.body.event_date;
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(event_date || '')) {
    return res.status(400).json({ error: 'title and event_date are required.' });
  }

  const fields = pick(req.body, [
    'club_id', 'start_time', 'end_time', 'location', 'courts', 'slots',
    'level_min', 'level_max', 'level_min_f', 'level_max_f', 'fee_amount', 'status', 'registration_deadline',
    'allow_public_registration', 'notice', 'cancel_deadline_hours', 'cancel_half_hours', 'no_refund', 'kind',
    'services', 'play_format', 'map_url', 'cost_items', 'auto_approve', 'allow_pay_later', 'series_label', 'level_keys',
    'groups', 'court_labels', 'members_only', 'public_from',
  ]);
  const bad = cleanEventFields(fields) || (await applyGroups(fields));
  if (bad) return res.status(400).json({ error: bad });
  if (!(await membersFirstReady())) for (const k of ['members_only', 'public_from']) delete fields[k];
  if ('cancel_half_hours' in fields && !(await tiersReady())) delete fields.cancel_half_hours; // migration not run yet
  if ('level_keys' in fields && !(await require('../services/communitySettings').ready())) delete fields.level_keys;
  if (!(await genderLevelsReady())) for (const k of ['level_min_f', 'level_max_f']) delete fields[k];
  if ('no_refund' in fields) {
    if (!(await noRefundReady())) delete fields.no_refund;
    else fields.no_refund = fields.no_refund === true;
  }
  const hostId = await hostForClub(req, fields.club_id);
  if (!hostId) return notFound(res, 'Club');
  if (!(await kindAllowed(fields.club_id, fields.kind))) return res.status(400).json({ error: 'Communities do not have meetings or round robin.', code: 'kind_not_for_community' });
  // Every kèo belongs to a club or a community: the old one-off space (no club) is gone.
  if (!fields.club_id) return res.status(400).json({ error: 'Pick the club or community this event belongs to.', code: 'club_required' });

  const weeks = Math.min(Math.max(parseInt(req.body.repeat_weeks, 10) || 1, 1), 26);
  // Many club sessions at once (weekly schedule) is a Standard feature.
  if (fields.club_id && ((dates && dates.length > 1) || weeks > 1)) {
    try {
      await assertFeature(hostId, 'weekly_schedule', await require('../services/plan').kindOf(await clubKindOf(fields.club_id)));
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message, code: err.code, feature: err.feature, min_tier: err.min_tier });
    }
  }
  const days = dates || Array.from({ length: weeks }, (_, i) => addDays(event_date, 7 * i));
  // The registration deadline keeps the same distance to each session as to the first.
  const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
  // Sessions made together form a series: they can be edited all at once later.
  const series_id = days.length > 1 ? randomUUID() : null;
  const rows = days.map((d) => ({
    host_id: hostId,
    title,
    ...fields,
    ...(series_id ? { series_id } : {}),
    status: fields.status || 'open',
    event_date: d,
    registration_deadline: fields.registration_deadline
      ? new Date(new Date(fields.registration_deadline).getTime() + dayMs(d) - dayMs(event_date)).toISOString()
      : null,
    // Members first: opens to everyone at the same distance before each session.
    ...(fields.public_from ? { public_from: new Date(new Date(fields.public_from).getTime() + dayMs(d) - dayMs(event_date)).toISOString() } : {}),
  }));
  const { data, error } = await supabase.from('events').insert(rows).select();
  if (error) return dbError(res, error);
  // Each session's costs (court, water…) go into the ledger on its day.
  try {
    for (const ev of data) if (ev.cost_items?.length) await syncEventCosts(ev);
  } catch (err) {
    return dbError(res, err);
  }
  data.sort((a, b) => a.event_date.localeCompare(b.event_date));
  res.status(201).json({ ...data[0], created_count: data.length });
});

// With `series_upcoming`: how many other sessions of the same weekly schedule an edit can
// also change ("Áp dụng cho tất cả các buổi").
router.get('/:eventId', async (req, res) => {
  // The Host is always shown among the organizers ("Người tổ chức"), playing or not.
  const host = await hostPerson(req.event.host_id).catch(() => null);
  const base = { ...req.event, host_name: host?.full_name || null, club_map_url: req.event.map_url ? null : await clubMapUrl(req.event.club_id).catch(() => null) };
  if (!req.event.series_id) return res.json(base);
  const { count, error } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('series_id', req.event.series_id)
    .neq('id', req.event.id)
    .gte('event_date', todayYmd())
    .not('status', 'in', '(completed,cancelled)');
  if (error) return dbError(res, error);
  res.json({ ...base, series_upcoming: count || 0 });
});

// ---- Meeting money (kind = 'meeting') ---------------------------------------------
function meetingOnly(req, res) {
  if (req.event.kind !== 'meeting' || !req.event.club_id) {
    res.status(400).json({ error: 'Only club meetings have this.' });
    return false;
  }
  return true;
}
const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1e10 ? Math.round(n) : null;
};
async function meetingReply(req, res) {
  const { data } = await supabase.from('events').select('*').eq('id', req.event.id).single();
  res.json(await meeting.summary(data));
}
async function clubMember(req, id) {
  if (!isUuid(id)) return null;
  const { data } = await supabase.from('club_members').select('id').eq('id', id).eq('club_id', req.event.club_id).maybeSingle();
  return data;
}

router.get('/:eventId/meeting', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    res.json(await meeting.summary(req.event));
  } catch (err) {
    fail(res, err);
  }
});

// What one person transferred / sponsored.
router.put('/:eventId/meeting/money/:clubMemberId', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    if (!(await clubMember(req, req.params.clubMemberId))) return notFound(res, 'Member');
    const patch = {};
    for (const k of ['paid_amount', 'sponsor_amount']) {
      if (k in (req.body || {})) {
        const v = money(req.body[k] === '' || req.body[k] == null ? 0 : req.body[k]);
        if (v == null) return res.status(400).json({ error: `${k} must be a non-negative amount.` });
        patch[k] = v;
      }
    }
    await meeting.setMoney(req.event.id, req.params.clubMemberId, patch);
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

// Guests a member brings: one more share of the fee each, charged to the inviter.
router.post('/:eventId/meeting/guests', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  const name = String(req.body?.full_name || '').trim().slice(0, 120);
  try {
    if (!name) return res.status(400).json({ error: 'full_name is required.' });
    if (!(await clubMember(req, req.body?.invited_by))) return res.status(400).json({ error: 'Pick who invited the guest.', code: 'inviter_required' });
    const { error } = await supabase.from('meeting_guests').insert({ event_id: req.event.id, full_name: name, invited_by: req.body.invited_by });
    if (error) throw error;
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:eventId/meeting/guests/:guestId', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    if (!isUuid(req.params.guestId)) return notFound(res, 'Guest');
    const { error } = await supabase.from('meeting_guests').delete().eq('id', req.params.guestId).eq('event_id', req.event.id);
    if (error) throw error;
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:eventId/meeting/expenses', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  const label = String(req.body?.label || '').trim().slice(0, 200);
  const amount = money(req.body?.amount);
  try {
    if (!label || amount == null) return res.status(400).json({ error: 'label and amount are required.' });
    const { error } = await supabase.from('meeting_expenses').insert({ event_id: req.event.id, label, amount });
    if (error) throw error;
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

router.patch('/:eventId/meeting/expenses/:expenseId', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    if (!isUuid(req.params.expenseId)) return notFound(res, 'Expense');
    const patch = {};
    if ('label' in req.body) {
      patch.label = String(req.body.label || '').trim().slice(0, 200);
      if (!patch.label) return res.status(400).json({ error: 'label is required.' });
    }
    if ('amount' in req.body) {
      patch.amount = money(req.body.amount);
      if (patch.amount == null) return res.status(400).json({ error: 'amount must be a non-negative amount.' });
    }
    const { error } = await supabase.from('meeting_expenses').update(patch).eq('id', req.params.expenseId).eq('event_id', req.event.id);
    if (error) throw error;
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:eventId/meeting/expenses/:expenseId', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    if (!isUuid(req.params.expenseId)) return notFound(res, 'Expense');
    const { error } = await supabase.from('meeting_expenses').delete().eq('id', req.params.expenseId).eq('event_id', req.event.id);
    if (error) throw error;
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

// Settle the result (surplus -> fund; deficit -> sponsor / fund / split), or undo it.
router.post('/:eventId/meeting/settle', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    await meeting.settle(req.event, req.hostId, req.body || {});
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/:eventId/meeting/settle', async (req, res) => {
  if (!meetingOnly(req, res)) return;
  try {
    await meeting.undoSettle(req.event);
    await meetingReply(req, res);
  } catch (err) {
    fail(res, err);
  }
});

// Meeting votes: who comes (yes), who doesn't (no), who hasn't answered yet.
router.get('/:eventId/votes', async (req, res) => {
  if (req.event.kind !== 'meeting' || !req.event.club_id) return res.status(400).json({ error: 'Only club meetings have votes.' });
  try {
    res.json(await votes.votesFor(req.event));
  } catch (err) {
    dbError(res, err);
  }
});

// The Host marks a member's vote (e.g. told in the group chat). choice null clears it.
router.put('/:eventId/votes/:clubMemberId', async (req, res) => {
  const choice = req.body?.choice ?? null;
  if (req.event.kind !== 'meeting' || !req.event.club_id) return res.status(400).json({ error: 'Only club meetings have votes.' });
  if (choice !== null && !votes.CHOICES.includes(choice)) return res.status(400).json({ error: 'choice must be yes, no or null.' });
  if (!isUuid(req.params.clubMemberId)) return notFound(res, 'Member');
  const { data: m } = await supabase.from('club_members').select('id').eq('id', req.params.clubMemberId).eq('club_id', req.event.club_id).maybeSingle();
  if (!m) return notFound(res, 'Member');
  try {
    await votes.castVote(req.event.id, m.id, choice, true);
    res.json(await votes.votesFor(req.event));
  } catch (err) {
    dbError(res, err);
  }
});

router.patch('/:eventId', async (req, res) => {
  const fields = pick(req.body, [
    'title', 'event_date', 'club_id', 'start_time', 'end_time', 'location', 'courts',
    'slots', 'level_min', 'level_max', 'level_min_f', 'level_max_f', 'fee_amount', 'status', 'registration_deadline',
    'allow_public_registration', 'notice', 'cancel_deadline_hours', 'cancel_half_hours', 'no_refund', 'kind',
    'services', 'play_format', 'map_url', 'cost_items', 'auto_approve', 'allow_pay_later', 'series_label', 'level_keys',
    'groups', 'court_labels', 'members_only', 'public_from',
  ]);
  const bad = cleanEventFields(fields) || (await applyGroups(fields));
  if (bad) return res.status(400).json({ error: bad });
  if (!(await membersFirstReady())) for (const k of ['members_only', 'public_from']) delete fields[k];
  if ('cancel_half_hours' in fields && !(await tiersReady())) delete fields.cancel_half_hours; // migration not run yet
  if ('level_keys' in fields && !(await require('../services/communitySettings').ready())) delete fields.level_keys;
  if (!(await genderLevelsReady())) for (const k of ['level_min_f', 'level_max_f']) delete fields[k];
  if ('no_refund' in fields) {
    if (!(await noRefundReady())) delete fields.no_refund;
    else fields.no_refund = fields.no_refund === true;
  }
  if (req.event.status === 'cancelled' && fields.status && fields.status !== 'cancelled') {
    return res.status(409).json({ error: 'A cancelled event stays cancelled.', code: 'cancelled' });
  }
  if ('club_id' in fields && !fields.club_id) return res.status(400).json({ error: 'An event cannot leave its club or community.', code: 'club_required' });
  if ('club_id' in fields && (await hostForClub(req, fields.club_id)) !== req.event.host_id) return notFound(res, 'Club');
  if ('kind' in fields && fields.kind !== req.event.kind && !(await kindAllowed(fields.club_id ?? req.event.club_id, fields.kind))) {
    return res.status(400).json({ error: 'Communities do not have meetings or round robin.', code: 'kind_not_for_community' });
  }
  // Date / time changed or cancelled: the only changes players are told about.
  if ((schedChanged(req.event, fields) || (fields.status === 'cancelled' && req.event.status !== 'cancelled')) && (await schedReady())) fields.schedule_changed_at = nowIso();
  const { data, error } = await supabase
    .from('events')
    .update(fields)
    .eq('id', req.event.id)
    .select()
    .single();
  if (error) return dbError(res, error);
  // Host cancelled the event: tell everyone who had a place (in the background).
  if (fields.status === 'cancelled' && req.event.status !== 'cancelled') notifyEventCancelled(data);
  let updated = 0;
  try {
    if (('cost_items' in fields && !sameItems(fields.cost_items, req.event.cost_items)) || ('event_date' in fields && fields.event_date !== req.event.event_date && data.cost_items?.length)) {
      await syncEventCosts(data);
    }
    // "Áp dụng cho tất cả các buổi": the same change on every upcoming session of the schedule.
    if (req.body.apply_to === 'series' && data.series_id) updated = await applyToSeries(data, fields);
  } catch (err) {
    return dbError(res, err);
  }
  res.json(req.body.apply_to === 'series' ? { ...data, series_updated: updated } : data);
});

const schedReady = async () => !(await require('../services/schemaCheck').schemaStatus()).missing_migrations.includes('20261217090000_event_schedule_changed.sql');
const hm5 = (v) => (v ? String(v).slice(0, 5) : null);
const groupTimes = (g) => JSON.stringify((Array.isArray(g) ? g : []).map((x) => [x.id, hm5(x.start_time), hm5(x.end_time)]));
// Did this edit move the kèo in time (day, start, end, or a court's hours)?
function schedChanged(before, fields) {
  if ('event_date' in fields && fields.event_date !== before.event_date) return true;
  for (const k of ['start_time', 'end_time']) if (k in fields && hm5(fields[k]) !== hm5(before[k])) return true;
  return 'groups' in fields && groupTimes(fields.groups) !== groupTimes(before.groups);
}

// Copy an edit to the other sessions of the same weekly schedule that haven't happened
// yet (not completed / cancelled, today or later). Each keeps its own day; a registration
// deadline keeps the same distance to its session as on the edited one.
async function applyToSeries(ev, fields) {
  const patch = pick(fields, SERIES_FIELDS);
  const { data: others, error } = await supabase
    .from('events')
    .select('id, event_date, start_time, end_time, groups, cost_items, host_id')
    .eq('series_id', ev.series_id)
    .neq('id', ev.id)
    .gte('event_date', todayYmd())
    .not('status', 'in', '(completed,cancelled)');
  if (error) throw error;
  const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
  const deadline = 'registration_deadline' in fields ? fields.registration_deadline : undefined;
  const publicFrom = 'public_from' in fields ? fields.public_from : undefined;
  for (const o of others) {
    const row = { ...patch };
    if (publicFrom !== undefined) {
      row.public_from = publicFrom ? new Date(new Date(publicFrom).getTime() + dayMs(o.event_date) - dayMs(ev.event_date)).toISOString() : null;
    }
    if (deadline !== undefined) {
      row.registration_deadline = deadline ? new Date(new Date(deadline).getTime() + dayMs(o.event_date) - dayMs(ev.event_date)).toISOString() : null;
    }
    if (!Object.keys(row).length) continue;
    if (schedChanged(o, row) && (await schedReady())) row.schedule_changed_at = new Date().toISOString();
    const { data: next, error: uErr } = await supabase.from('events').update(row).eq('id', o.id).select().single();
    if (uErr) throw uErr;
    if ('cost_items' in row && !sameItems(row.cost_items, o.cost_items)) await syncEventCosts(next);
  }
  return others.length;
}

// Deleting wipes the event's participants and money records too. When there are any,
// the Host must confirm (?force=1); "Cancelled" is the way to keep the history.
// Upcoming session with people signed up: never deleted — cancel it so they are told.
// A past session (completed / cancelled / its date gone) can be deleted to tidy up the
// history, but only once the Host confirmed (?force=1) after seeing what goes with it.
// Otherwise money records alone also need ?force=1.
router.delete('/:eventId', async (req, res) => {
  const [{ count: people }, { count: money }, { count: matches }] = await Promise.all([
    // (organizers who don't play, e.g. the Host's own row, are not sign-ups)
    supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id).not('status', 'in', '(cancelled,not_playing)'),
    // (the session's own costs from the form don't count: they go with it)
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id).eq('is_voided', false).eq('event_cost', false),
    supabase.from('matches').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id),
  ]);
  const past = ['completed', 'cancelled'].includes(req.event.status) || req.event.event_date < todayYmd();
  const force = req.query.force === '1';
  if (people > 0 && !past) {
    return res.status(409).json({ error: 'People have signed up for this event: cancel it instead (they will be notified).', code: 'has_signups', participants: people });
  }
  if (people + money + matches > 0 && !force) {
    return res.status(409).json({
      error: 'This event has sign-ups, matches or money records: confirm to delete them too.',
      code: past ? 'past_has_data' : 'has_activity',
      participants: people || 0,
      transactions: money || 0,
      matches: matches || 0,
    });
  }
  const { error } = await supabase.from('events').delete().eq('id', req.event.id);
  if (error) return dbError(res, error);
  res.status(204).end();
});

// ---- Participants -----------------------------------------------------------
router.get('/:eventId/participants', async (req, res) => {
  try {
    await signup.expireHolds(req.event);
  } catch (err) {
    return dbError(res, err);
  }
  const list = () => supabase.from('event_participants').select('*').eq('event_id', req.event.id).order('joined_at', { ascending: true });
  let { data, error } = await list();
  if (error) return dbError(res, error);
  // Members with an account added without it: the rows go to their accounts now.
  if (await require('../services/memberLink').linkEventAccounts(data).catch(() => 0)) ({ data, error } = await list());
  if (error) return dbError(res, error);
  let cards;
  try {
    cards = await playerCards(req.event, data);
  } catch (err) {
    return dbError(res, err);
  }
  // Accounts whose email is not confirmed yet (quick sign-up): the Host sees a tag.
  const userIds = [...new Set(data.map((p) => p.user_id).filter(Boolean))];
  const unverified = new Set();
  if (userIds.length) {
    const { data: us } = await supabase.from('users').select('id, email_unverified_since').in('id', userIds);
    for (const u of us || []) if (u.email_unverified_since) unverified.add(u.id);
  }
  // How often each player cancelled / didn't come before (same club or community).
  let history = new Map();
  try {
    history = await require('../services/cancelHistory').cancelHistory(req.event, data);
  } catch (err) {
    console.error('cancel history', err.message); // the list still loads without it
  }
  // Who plays on a pass. Clubs: fixed members pay through their membership plan.
  // Communities: only "khách VIP" — a paid pass (month / quarter / year) covering the date;
  // regulars and drop-ins pay per kèo.
  let vip = new Map(); // member -> pass period (month / quarter / year)
  const community = req.event.club_id ? (await supabase.from('clubs').select('kind').eq('id', req.event.club_id).maybeSingle()).data?.kind === 'community' : false;
  if (community) {
    const ids = [...new Set([...cards.values()].map((c) => c?.member_id).filter(Boolean))];
    if (ids.length) {
      const { data: all } = await supabase.from('v_membership_status').select('club_member_id, plan_id, sessions_included, sessions_remaining').in('club_member_id', ids).eq('status', 'paid').lte('starts_on', req.event.event_date).gte('ends_on', req.event.event_date);
      const passes = (all || []).filter((x) => x.sessions_included === 0 || x.sessions_remaining > 0); // a used-up pack is no pass
      const planIds = [...new Set(passes.map((x) => x.plan_id))];
      const { data: plans } = planIds.length ? await supabase.from('membership_plans').select('*').in('id', planIds) : { data: [] };
      const periodOf = new Map((plans || []).map((x) => [x.id, x.validity_months ? 'sessions' : x.period]));
      vip = new Map((passes || []).map((x) => [x.club_member_id, periodOf.get(x.plan_id) || null]));
    }
  }
  // Quick bookings (invite link, no account): who booked the group, to call them.
  const bookings = await require('../services/quickBooking').bookingsFor(data).catch(() => new Map());
  // screenshots are fetched one at a time (they are large)
  res.json(
    data.map(({ payment_proof, ...p }) => {
      const c = cards.get(p.id) || null;
      const card = c && community ? { ...c, vip: vip.has(c.member_id), vip_period: vip.get(c.member_id) || null } : c;
      const paidByPlan = community ? !!card?.vip : card?.member_type === 'fixed';
      return { ...p, has_proof: !!payment_proof, card, paid_by_plan: paidByPlan, email_unverified: unverified.has(p.user_id), cancel_history: history.get(p.id) || null, booking: bookings.get(p.guest_booking_id) || null };
    })
  );
});

// What the participant list shows about each player (avatar, level, the Host's rank…)
// and the profile pop-up: their club record and their own player profile.
async function playerCards(event, rows) {
  const memberIds = [...new Set(rows.map((p) => p.source_club_member_id || p.guest_member_id).filter(Boolean))];
  const { data: members, error } = memberIds.length
    ? await supabase.from('club_members').select('*').in('id', memberIds)
    : { data: [] };
  if (error) throw error;
  const byMember = new Map((members || []).map((m) => [m.id, m]));
  const userIds = [...new Set(rows.map((p) => p.user_id || byMember.get(p.source_club_member_id || p.guest_member_id)?.user_id).filter(Boolean))];
  const { data: profiles, error: pErr } = userIds.length
    ? await supabase.from('player_profiles').select('*').in('user_id', userIds)
    : { data: [] };
  if (pErr) throw pErr;
  const byUser = new Map((profiles || []).map((x) => [x.user_id, x]));
  // DUPR rating as DUPR gave it (newest from any club / community's file, source not shown):
  // the member's linked rating, else by the DUPR ID of the profile / the quick booking.
  const idOf = (p, m, prof) => (m?.dupr_synced_at ? null : m?.dupr_id || prof?.dupr_id || p.dupr_id || null);
  const shared = await require('../services/dupr')
    .latestRatings(rows.map((p) => {
      const m = byMember.get(p.source_club_member_id || p.guest_member_id);
      return idOf(p, m, byUser.get(p.user_id || m?.user_id));
    }))
    .catch(() => new Map());
  // Community levels (control panel) from the Host's Điểm trình / hand-picked level.
  const CS = require('../services/communitySettings');
  const levelSettings = event.club_id ? await CS.forClub(event.club_id).catch(() => null) : null;
  const cards = new Map();
  for (const p of rows) {
    const m = byMember.get(p.source_club_member_id || p.guest_member_id) || null;
    const prof = byUser.get(p.user_id || m?.user_id) || null;
    const sh = shared.get(idOf(p, m, prof));
    const verified = m?.dupr_synced_at && m.dupr_doubles != null ? { doubles: Number(m.dupr_doubles), at: m.dupr_synced_at, rel: m.dupr_doubles_rel ?? null } : sh?.doubles != null ? { doubles: sh.doubles, at: sh.at, rel: sh.doubles_rel ?? null } : null;
    cards.set(p.id, {
      member_id: m?.id || null,
      member_type: m?.member_type || null,
      tier: m?.tier || null,
      avatar: prof?.avatar || null,
      level: m?.dupr_level ?? p.dupr_level ?? null,
      skill_score: m?.skill_score == null ? null : Number(m.skill_score),
      level_label: m && levelSettings && levelSettings.levels.mode !== 'none' ? CS.levelOf(m, levelSettings)?.label || null : null,
      dupr: prof?.dupr_level ?? null,
      dupr_verified: verified?.doubles ?? null,
      dupr_updated_at: verified?.at ?? null,
      dupr_rel: verified?.rel ?? null, // DUPR reliability (%), shown as "Uy tín"
      dupr_id: m?.dupr_id || prof?.dupr_id || p.dupr_id || null,
      district: m?.district || null,
      play_duration: m?.play_duration || null,
      gender: m?.gender || prof?.gender || null,
      birth_date: m?.birth_date || prof?.birth_date || null,
      birth_year: m?.birth_year || prof?.birth_year || null,
      joined_on: m?.joined_on || null,
      phone: m?.phone || p.phone || prof?.phone || null,
      guest_perk: m?.guest_perk || null,
    });
  }
  return cards;
}

router.get('/:eventId/participants/:participantId/proof', (req, res) => {
  // Deleted by the retention rule (services/privacy.js): say so instead of "not found".
  if (!req.participant.payment_proof && req.participant.proof_purged_at) {
    return res.status(410).json({ error: 'The screenshot was deleted under the retention policy.', code: 'proof_purged', purged_at: req.participant.proof_purged_at });
  }
  if (!req.participant.payment_proof) return notFound(res, 'Screenshot');
  res.json({ image: req.participant.payment_proof, submitted_at: req.participant.payment_submitted_at, ref: req.participant.payment_ref });
});

router.post('/:eventId/participants', checkCapacity(), async (req, res) => {
  const { phone, fee_amount } = req.body;
  const full_name = String(req.body.full_name || '').trim().slice(0, 120);
  if (!full_name) return res.status(400).json({ error: 'full_name is required.' });
  // "Thêm thành viên": name, gender, DUPR ID and self-entered DUPR (all but the name optional).
  const gender = ['male', 'female'].includes(req.body.gender) ? req.body.gender : null;
  const selfDupr = req.body.dupr_self === '' || req.body.dupr_self == null ? null : Number(req.body.dupr_self);
  if (selfDupr != null && !(selfDupr >= 1 && selfDupr <= 8)) return res.status(400).json({ error: 'DUPR must be between 1 and 8.', code: 'bad_dupr' });
  let duprId = null;
  try {
    duprId = require('../services/dupr').cleanId(req.body.dupr_id);
  } catch (err) {
    return res.status(400).json({ error: err.message, code: err.code });
  }
  const dupr_level = selfDupr ?? req.body.dupr_level ?? null;
  let memberId = await findClubMemberByPhone(req.event.club_id, phone);
  // Someone already on the list (same name) is linked, so their DUPR and level follow them.
  // A new person only plays this kèo: they are not saved on the member list.
  if (!memberId && req.event.club_id && req.body.as_member) {
    memberId = await addListedMember(req.event, { full_name, gender, duprId, level: dupr_level });
  }

  const { count } = await supabase
    .from('event_participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', req.event.id)
    .in('status', MAIN_LIST);
  // Kèo with time groups: the Host picks the group (default: the first); its fee and places.
  const eg = require('../services/eventGroups');
  const tg = eg.groupsOf(req.event).length ? eg.groupOf(req.event, req.body.group_id) || eg.groupsOf(req.event)[0] : null;
  const groupFull = tg && ((await eg.takenByGroup(req.event))[tg.id] || 0) >= tg.slots;
  const status = (count || 0) >= req.event.slots || groupFull ? 'waitlisted' : 'registered';
  const perks = await perksFor(eg.forGroup(req.event, tg), { phone });

  const { data, error } = await supabase
    .from('event_participants')
    .insert({
      ...(perks?.priority ? { priority: true } : {}),
      event_id: req.event.id,
      full_name,
      phone: phone || null,
      dupr_level: dupr_level ?? null,
      ...(gender ? { gender } : {}),
      ...(duprId ? { dupr_id: duprId } : {}),
      fee_amount: fee_amount ?? (tg ? tg.fee_amount : null),
      ...(tg ? { group_id: tg.id } : {}),
      status,
      source_club_member_id: memberId,
      kind: memberId ? 'member' : 'guest',
      // Added by the Host with "Thêm người" and not one of the club's members: "Khách của Host".
      ...(!memberId && (await extrasReady()) ? { tags: ['host_guest'] } : {}),
    })
    .select()
    .single();
  if (error) return dbError(res, error);
  await ensureGuestMember(req.event, data);
  await require('../services/memberLink').linkEventAccounts([data]).catch(() => 0);
  res.status(201).json(data);
});

// Badminton: shuttles used in this session, what they cost (each shuttle at its item's
// average purchase price) and the share per player present.
router.get('/:eventId/shuttles', async (req, res) => {
  try {
    if (!req.event.club_id) return res.json({ items: [], used: [], total_qty: 0, total_cost: 0, players: 0, per_player: null });
    const { data: items, error } = await supabase.from('inventory_items').select('*, inventory_moves(*)').eq('club_id', req.event.club_id).order('created_at');
    if (error) throw error;
    const { count: players } = await supabase.from('event_participants').select('id', { count: 'exact', head: true }).eq('event_id', req.event.id).eq('status', 'checked_in');
    const used = [];
    for (const it of items || []) {
      const m = itemMetrics(it.inventory_moves || []);
      for (const mv of (it.inventory_moves || []).filter((x) => x.kind === 'use' && x.event_id === req.event.id)) {
        used.push({ move_id: mv.id, item_id: it.id, name: it.name, unit: it.unit, quantity: mv.quantity, unit_cost: m.avg_unit_cost, cost: Math.round(mv.quantity * (m.avg_unit_cost || 0)) });
      }
      it.stock = m.stock;
    }
    const total_cost = used.reduce((t, u) => t + u.cost, 0);
    res.json({
      items: (items || []).filter((i) => i.is_active).map((i) => ({ id: i.id, name: i.name, unit: i.unit, stock: i.stock })),
      used,
      total_qty: used.reduce((t, u) => t + u.quantity, 0),
      total_cost,
      players: players || 0,
      per_player: players ? Math.round(total_cost / players) : null,
    });
  } catch (err) {
    dbError(res, err);
  }
});

// After-session survey answers for this event (guests' stars, comments, join wishes).
router.get('/:eventId/surveys', async (req, res) => {
  try {
    res.json(await survey.eventSurveys(req.event));
  } catch (err) {
    dbError(res, err);
  }
});

// Import from Club: clone selected club members into this event's participants
router.post('/:eventId/participants/import', checkCapacity(), async (req, res) => {
  const memberIds = Array.isArray(req.body.club_member_ids) ? req.body.club_member_ids : [];
  if (!memberIds.length) return res.status(400).json({ error: 'club_member_ids[] is required.' });

  const { willExceed, allowed, usage } = await limitBody(req.hostId, memberIds.length);
  if (willExceed) {
    return res.status(403).json({
      error: `Only ${allowed} more people fit on the ${usage.tier} plan (${usage.used}/${usage.capacity_limit} used).`,
      usage,
    });
  }

  // Only members of the event's own club / community (an old kèo without one: the Host's clubs).
  let clubIds = [req.event.club_id];
  if (!req.event.club_id) {
    const { data: own } = await supabase.from('clubs').select('id').eq('host_id', req.event.host_id);
    clubIds = (own || []).map((c) => c.id);
  }
  const { data: found, error: mErr } = await supabase
    .from('club_members')
    .select('*')
    .in('club_id', clubIds.length ? clubIds : ['00000000-0000-0000-0000-000000000000'])
    .in('id', memberIds);
  if (mErr) return dbError(res, mErr);
  // Members of another club / community are never imported.
  if (!(found || []).length) return res.status(400).json({ error: 'These members are not in this event\'s club.', code: 'not_club_member' });
  // Already on this event (any list but cancelled): not added a second time.
  const { data: onList, error: oErr } = await supabase
    .from('event_participants')
    .select('source_club_member_id, guest_member_id, user_id, phone')
    .eq('event_id', req.event.id)
    .neq('status', 'cancelled');
  if (oErr) return dbError(res, oErr);
  const tel = (v) => String(v || '').replace(/\D/g, '').replace(/^84/, '0');
  const taken = new Set((onList || []).flatMap((p) => [p.source_club_member_id, p.guest_member_id]).filter(Boolean));
  const takenUsers = new Set((onList || []).map((p) => p.user_id).filter(Boolean));
  const takenPhones = new Set((onList || []).map((p) => tel(p.phone)).filter((x) => x.length >= 9));
  const members = (found || []).filter((m) => !taken.has(m.id) && !(m.user_id && takenUsers.has(m.user_id)) && !(tel(m.phone).length >= 9 && takenPhones.has(tel(m.phone))));
  if (!members.length) return res.status(409).json({ error: 'Everyone picked is already on this event.', code: 'already_on_event' });

  const { count } = await supabase
    .from('event_participants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', req.event.id)
    .in('status', MAIN_LIST);
  let mainCount = count || 0;

  // Kèo with time groups: everyone picked goes into one group (default: the first).
  const eg = require('../services/eventGroups');
  const tg = eg.groupsOf(req.event).length ? eg.groupOf(req.event, req.body.group_id) || eg.groupsOf(req.event)[0] : null;
  let groupLeft = tg ? tg.slots - ((await eg.takenByGroup(req.event))[tg.id] || 0) : Infinity;
  const payload = members.map((m) => {
    const status = mainCount < req.event.slots && groupLeft > 0 ? 'registered' : 'waitlisted';
    if (status === 'registered') { mainCount += 1; groupLeft -= 1; }
    return {
      event_id: req.event.id,
      full_name: m.full_name,
      phone: m.phone,
      dupr_level: m.dupr_level,
      source_club_member_id: m.id,
      kind: 'member',
      status,
      ...(tg ? { group_id: tg.id, fee_amount: tg.fee_amount } : {}),
    };
  });

  const { data, error } = await supabase.from('event_participants').insert(payload).select();
  if (error) return dbError(res, error);
  await require('../services/memberLink').linkEventAccounts(data).catch(() => 0); // their accounts see the kèo
  res.status(201).json(data);
});

// The member row for someone the Host adds by hand: the existing row with that name (their
// gender / DUPR fill gaps on it), else none — a new person is not saved on the list.
async function addListedMember(event, { full_name, gender, duprId, level }) {
  try {
    const { data: same } = await supabase.from('club_members').select('*').eq('club_id', event.club_id).ilike('full_name', full_name.replace(/[%_]/g, '')).limit(1);
    const found = same?.[0];
    const fill = (m) => ({
      ...(gender && !m?.gender ? { gender } : {}),
      ...(duprId && !m?.dupr_id ? { dupr_id: duprId } : {}),
      ...(level != null && m?.dupr_level == null ? { dupr_level: level } : {}),
    });
    if (found) {
      const patch = fill(found);
      if (Object.keys(patch).length) await supabase.from('club_members').update(patch).eq('id', found.id);
      return found.id;
    }
    // Someone new is added to this kèo only, never to the member list (club or community).
    return null;
  } catch (err) {
    console.error('add listed member', err.message);
    return null;
  }
}

// Name, gender, DUPR ID, self-entered DUPR of someone without an account. Also written to
// their member row (when that row has no account either), which DUPR exports read first.
async function editGuestInfo(event, p, body) {
  const bad = (msg, code) => Object.assign(new Error(msg), { status: 400, code });
  if (p.user_id) throw Object.assign(new Error('This player has an account: they edit their own profile.'), { status: 409, code: 'has_account' });
  const patch = {};
  if ('full_name' in body) {
    const name = String(body.full_name || '').trim().slice(0, 120);
    if (!name) throw bad('full_name is required.', 'name_required');
    patch.full_name = name;
  }
  if ('gender' in body) {
    if (body.gender != null && body.gender !== '' && !['male', 'female'].includes(body.gender)) throw bad('gender must be male or female.', 'bad_gender');
    patch.gender = body.gender || null;
  }
  if ('dupr_id' in body) patch.dupr_id = require('../services/dupr').cleanId(body.dupr_id);
  if ('dupr_self' in body) {
    const v = body.dupr_self === '' || body.dupr_self == null ? null : Number(body.dupr_self);
    if (v != null && !(v >= 1 && v <= 8)) throw bad('DUPR must be between 1 and 8.', 'bad_dupr');
    patch.dupr_level = v;
  }
  if (!Object.keys(patch).length) throw bad('Nothing to change.', 'nothing');
  const { data, error } = await supabase.from('event_participants').update(patch).eq('id', p.id).select().single();
  if (error) throw error;
  const memberId = p.source_club_member_id || p.guest_member_id;
  if (memberId) {
    const { data: m } = await supabase.from('club_members').select('id, user_id').eq('id', memberId).maybeSingle();
    if (m && !m.user_id) {
      const mp = { ...patch };
      // A DUPR ID that changed: the old link to DUPR's file no longer applies.
      if ('dupr_id' in mp) Object.assign(mp, { dupr_synced_at: null, dupr_verified_at: null, dupr_name: null });
      let { error: mErr } = await supabase.from('club_members').update(mp).eq('id', m.id);
      if (mErr && 'dupr_id' in mp) {
        for (const k of ['dupr_id', 'dupr_synced_at', 'dupr_verified_at', 'dupr_name']) delete mp[k]; // before the DUPR migrations
        ({ error: mErr } = await supabase.from('club_members').update(mp).eq('id', m.id));
      }
      if (mErr) throw mErr;
    }
  }
  return data;
}

async function hostPerson(hostId) {
  const [{ data: prof }, { data: user }] = await Promise.all([
    supabase.from('player_profiles').select('full_name, phone').eq('user_id', hostId).maybeSingle(),
    supabase.from('users').select('full_name, username, email').eq('id', hostId).maybeSingle(),
  ]);
  return { full_name: prof?.full_name || user?.full_name || user?.username || (user?.email || 'Host').split('@')[0], phone: prof?.phone || null };
}

// The Host plays (main list), may play (waitlist) or only organizes. Their row on the
// list is made the first time they choose to play; their place never costs a fee.
router.post('/:eventId/host-play', async (req, res) => {
  const to = req.body?.to;
  if (!['main', 'waitlist', 'not_playing'].includes(to)) return res.status(400).json({ error: 'to must be main, waitlist or not_playing.' });
  try {
    const { data: rows, error } = await supabase.from('event_participants').select('*').eq('event_id', req.event.id).eq('user_id', req.event.host_id).neq('status', 'cancelled').limit(1);
    if (error) throw error;
    let row = rows[0];
    // The Host's own member row (made if missing): their DUPR / level show on the list.
    const hostMember = to === 'not_playing' || !req.event.club_id
      ? null
      : await require('../services/guests').ensureHostMember({ id: req.event.club_id, host_id: req.event.host_id });
    if (!row) {
      if (to === 'not_playing') return res.json(null);
      const host = await hostPerson(req.event.host_id);
      const { data, error: iErr } = await supabase
        .from('event_participants')
        .insert({ event_id: req.event.id, user_id: req.event.host_id, full_name: hostMember?.full_name || host.full_name, phone: host.phone, kind: 'member', status: 'not_playing', is_organizer: true, fee_amount: 0, source_club_member_id: hostMember?.id || null, dupr_level: hostMember?.dupr_level ?? null })
        .select()
        .single();
      if (iErr) throw iErr;
      row = data;
    } else if (!row.is_organizer || (hostMember && !row.source_club_member_id)) {
      const { data } = await supabase.from('event_participants').update({ is_organizer: true, ...(hostMember && !row.source_club_member_id ? { source_club_member_id: hostMember.id } : {}) }).eq('id', row.id).select().single();
      row = data;
    }
    res.json(await setPlace(req.event, row, to));
  } catch (err) {
    err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
  }
});

const TAGS = ['coach', 'referee'];
// Notes the Host toggles on a person (migration 20261208090000): Khách mời, Miễn phí.
const NOTE_TAGS = ['invited', 'free'];
const EXTRAS_MIGRATION = '20261208090000_event_extras.sql';
async function extrasReady() {
  const { schemaStatus } = require('../services/schemaCheck');
  return !(await schemaStatus()).missing_migrations.includes(EXTRAS_MIGRATION);
}
async function setRoles(event, prior, body) {
  const patch = {};
  if ('is_organizer' in body) {
    if (prior.user_id === event.host_id && !body.is_organizer) throw Object.assign(new Error('The Host is always an organizer.'), { status: 400, code: 'host_organizer' });
    patch.is_organizer = !!body.is_organizer;
    // No longer an organizer: someone "not playing" goes to the waitlist.
    if (!patch.is_organizer && prior.status === 'not_playing') patch.status = 'waitlisted';
  }
  if ('tags' in body) {
    const allowed = (await extrasReady()) ? [...TAGS, ...NOTE_TAGS] : TAGS;
    // 'host_guest' is set by the app, never by hand: keep it as it was.
    const asked = Array.isArray(body.tags) ? body.tags.filter((x) => x !== 'host_guest') : null;
    if (!asked || asked.some((x) => !allowed.includes(x))) throw Object.assign(new Error(`tags: ${allowed.join(', ')}.`), { status: 400 });
    const keep = (prior.tags || []).filter((x) => x === 'host_guest');
    patch.tags = [...new Set([...asked, ...keep])];
    // Miễn phí: nothing to pay for this place (and nothing owed). Off again: the kèo's fee.
    const wasFree = (prior.tags || []).includes('free');
    const isFree = patch.tags.includes('free');
    if (isFree && !wasFree) patch.fee_amount = 0;
    if (!isFree && wasFree) patch.fee_amount = null;
  }
  const { data, error } = await supabase.from('event_participants').update(patch).eq('id', prior.id).select().single();
  if (error) throw error;
  return data;
}

const refundErr = (message, status, code) => Object.assign(new Error(message), { status, code });
async function markRefund(req, p) {
  if (p.status !== 'cancelled' || !p.fee_paid) throw refundErr('Only a cancelled player who paid can be refunded.', 409, 'not_refundable');
  if (p.refunded_at) throw refundErr('Already marked as refunded.', 409, 'already_refunded');
  // Default: the refund tier of the cancellation (100% / 50%) of what they paid.
  const share = require('../services/attendance').refundShare(p);
  if (share === 0) throw refundErr('Cancelled too late: no refund under the cancel policy.', 409, 'no_refund');
  const raw = req.body?.amount ?? Math.round((Number(p.fee_amount ?? req.event.fee_amount ?? 0) * share) / 100);
  const amount = Math.round(Number(raw));
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) throw refundErr('amount must be a whole number of đồng.', 400, 'bad_amount');
  let txnId = null;
  if (amount > 0) {
    const { data: txn, error: tErr } = await supabase
      .from('transactions')
      .insert({ host_id: req.event.host_id, owner_type: 'event', event_id: req.event.id, type: 'expense', category: 'refund', amount, note: `Refund to ${p.full_name}` })
      .select('id')
      .single();
    if (tErr) throw tErr;
    txnId = txn.id;
  }
  const { data, error } = await supabase
    .from('event_participants')
    .update({ refunded_at: nowIso(), refund_amount: amount, refunded_by: req.hostEmail || null, refund_txn_id: txnId })
    .eq('id', p.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
async function undoRefund(req, p) {
  if (!p.refunded_at) throw refundErr('Not marked as refunded.', 409, 'not_refunded');
  if (p.refund_txn_id) {
    await supabase.from('transactions').update({ is_voided: true, voided_at: nowIso(), void_reason: 'refund mark taken back' }).eq('id', p.refund_txn_id);
  }
  const { data, error } = await supabase
    .from('event_participants')
    .update({ refunded_at: null, refund_amount: null, refunded_by: null, refund_txn_id: null })
    .eq('id', p.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

const { moveToGroup: changeGroup, movesReady } = require('../services/eventGroups');

// Actions: check-in / no-show / reset / promote / cancel / waive / fee / place / roles / group
async function withGroup(prior, act) {
  const others = ['pending', 'requested'].includes(prior.status) ? await require('../services/quickBooking').pendingSiblings(prior) : [];
  const out = await act(prior);
  for (const p of others) await act(p);
  return others.length ? { ...out, group_count: others.length + 1 } : out;
}

// Delete a cancelled registration (e.g. someone the Host asked to test signing up): it no
// longer shows in the cancelled list nor counts in the player's cancel history. Not when
// money was paid and not refunded (the ledger keeps that record).
router.delete('/:eventId/participants/:participantId', async (req, res) => {
  const p = req.participant;
  if (p.status !== 'cancelled') return res.status(409).json({ error: 'Only cancelled registrations can be deleted.', code: 'not_cancelled' });
  if (p.fee_paid && !p.refunded_at) return res.status(409).json({ error: 'Paid and not refunded: mark the refund first.', code: 'paid_not_refunded' });
  const { error } = await supabase.from('event_participants').delete().eq('id', p.id).eq('status', 'cancelled');
  if (error) return dbError(res, error);
  res.status(204).end();
});

router.post('/:eventId/participants/:participantId/:action', async (req, res) => {
  const { action } = req.params;
  const prior = req.participant;

  try {
    if (ATTENDANCE_ACTIONS.includes(action)) return res.json(await setAttendance(req.event, prior, action));
    // A quick booking waiting for the info check is approved / declined as one group.
    const cancel = (p) => cancelParticipant(req.event, p, new Date(), { reason: req.body?.reason, by: 'host' });
    if (action === 'cancel') return res.json(prior.status === 'requested' ? await withGroup(prior, cancel) : await cancel(prior));
    if (action === 'waive') return res.json(await waiveLateCancel(req.event, prior));
    if (action === 'promote') return res.json(await promoteParticipant(req.event, prior));
    // The sheet on a name: where they are (main / waitlist / waiting for approval / not playing)…
    // unpaid: "Vào danh sách chính, thu tiền sau" — the place now, the fee collected later.
    const unpaid = req.body?.unpaid === true;
    if (action === 'place' && req.body.to === 'main' && prior.status === 'requested' && prior.guest_booking_id) return res.json(await require('../services/quickBooking').approveGroup(req.event, prior, { unpaid }));
    if (action === 'place' && req.body.to === 'main' && unpaid) return res.json(await withGroup(prior, (p) => setPlace(req.event, p, 'main', { unpaid })));
    if (action === 'place') return res.json(await setPlace(req.event, prior, req.body.to));
    // Kèo with time groups: move them to another group (its fee if not paid yet).
    if (action === 'group') return res.json(await changeGroup(req.event, prior, req.body?.group_id));
    // …and their role: organizer (Host / co-host), coach, referee.
    if (action === 'roles') return res.json(await setRoles(req.event, prior, req.body || {}));
    // A player with no account (added by hand or booked quickly): fix name / gender / DUPR
    // later, e.g. after they make a DUPR account, so their matches can be sent again.
    if (action === 'info') return res.json(await editGuestInfo(req.event, prior, req.body || {}));
    // A quick booking (invite link) is paid in one transfer: confirming / rejecting one slot
    // does the same to the group's other slots still waiting.
    if (action === 'confirm-payment') return res.json(await withGroup(prior, (p) => signup.confirmPayment(req.event, p, req.hostId)));
    if (action === 'reject-payment') return res.json(await withGroup(prior, (p) => signup.rejectPayment(req.event, p, req.body.note)));
    // A player who paid and cancelled in time got their money back: mark it (and write the
    // refund to the ledger as an expense), or take the mark back.
    if (action === 'refund') return res.json(await markRefund(req, prior));
    if (action === 'refund-undo') return res.json(await undoRefund(req, prior));
    // "Paid" on someone still waiting for confirmation = confirm their payment.
    if (action === 'fee' && req.body.fee_paid && prior.status === 'pending') return res.json(await withGroup(prior, (p) => signup.confirmPayment(req.event, p, req.hostId)));
  } catch (err) {
    return err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
  }
  if (action !== 'fee') return res.status(400).json({ error: `Unknown action: ${action}` });

  const patch = { fee_paid: !!req.body.fee_paid };
  if (req.body.fee_amount != null) patch.fee_amount = req.body.fee_amount;
  const { data: updated, error } = await supabase
    .from('event_participants')
    .update(patch)
    .eq('id', prior.id)
    .select()
    .single();
  if (error) return dbError(res, error);

  // Fee ledger sync: write/void an event_fee transaction to match fee_paid
  // (only on an actual change, so a repeated "paid" can't book the fee twice).
  if (patch.fee_paid !== !!prior.fee_paid) {
    const owed = req.body.fee_amount ?? prior.fee_amount ?? req.event.fee_amount ?? 0;
    if (patch.fee_paid) {
      await supabase.from('transactions').insert({
        host_id: req.hostId,
        owner_type: 'event',
        event_id: req.event.id,
        type: 'income',
        category: 'event_fee',
        amount: owed,
        note: `Fee from ${prior.full_name}`,
      });
    } else {
      const { data: existing } = await supabase
        .from('transactions')
        .select('*')
        .eq('owner_type', 'event')
        .eq('event_id', req.event.id)
        .eq('category', 'event_fee')
        .eq('is_voided', false)
        .ilike('note', `Fee from ${String(prior.full_name).replace(/[\\%_]/g, (c) => `\\${c}`)}`)
        .limit(1)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('transactions')
          .update({ is_voided: true, voided_at: nowIso(), void_reason: 'fee marked unpaid' })
          .eq('id', existing.id);
      }
    }
  }

  res.json(updated);
});

// Pass vé (services/ticketPass.js): the Host finds who on the waitlist takes a ticket,
// checks the holder got the money, and moves the place.
router.get('/:eventId/passes', async (req, res) => {
  try {
    res.json(await require('../services/ticketPass').listForHost(req.event));
  } catch (err) {
    fail(res, err);
  }
});
router.get('/:eventId/passes/:passId/proof', async (req, res) => {
  if (!isUuid(req.params.passId)) return notFound(res, 'Pass');
  try {
    res.json(await require('../services/ticketPass').proof(req.event, req.params.passId));
  } catch (err) {
    fail(res, err);
  }
});
router.post('/:eventId/passes/:passId/:action', async (req, res) => {
  if (!isUuid(req.params.passId)) return notFound(res, 'Pass');
  const tp = require('../services/ticketPass');
  const { passId, action } = req.params;
  try {
    if (action === 'match') return res.json(await tp.match(req.event, passId, req.body?.to_participant_id));
    if (action === 'confirm') return res.json(await tp.confirm(req.event, passId));
    if (action === 'reject') return res.json(await tp.reject(req.event, passId, req.body?.note));
    if (action === 'cancel') return res.json(await tp.cancelByHost(req.event, passId));
    res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    fail(res, err);
  }
});

// Quick invite link (no account, straight to the transfer): the link changes every 30 s.
// GET -> the link to show now; POST {enabled} -> on (a new secret: old links stop) / off.
router.get('/:eventId/quick-invite', async (req, res) => {
  try {
    res.json(await require('../services/quickBooking').currentInvite(req.event));
  } catch (err) {
    fail(res, err);
  }
});
router.post('/:eventId/quick-invite', async (req, res) => {
  if (req.event.kind === 'meeting') return res.status(400).json({ error: 'Meetings use the vote link.', code: 'meeting' });
  try {
    res.json(await require('../services/quickBooking').setInvite(req.event, !!req.body?.enabled));
  } catch (err) {
    fail(res, err);
  }
});

// Scan a player's personal QR (from the player portal) -> check them in.
router.post('/:eventId/checkin-code', async (req, res) => {
  try {
    res.json(await checkInByCode(req.event, req.body.code));
  } catch (err) {
    err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
  }
});

// ---- Match scorers (referee/coordinator role) ------------------------------
router.get('/:eventId/scorers', async (req, res) => {
  const { data, error } = await supabase.from('event_scorers').select('*').eq('event_id', req.event.id);
  if (error) return dbError(res, error);
  res.json(data);
});

router.post('/:eventId/scorers', async (req, res) => {
  const { full_name, role } = req.body;
  if (!full_name || !['referee', 'coordinator'].includes(role)) {
    return res.status(400).json({ error: 'full_name and role (referee|coordinator) are required.' });
  }
  const { data, error } = await supabase
    .from('event_scorers')
    .insert({ event_id: req.event.id, full_name, role })
    .select()
    .single();
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// ---- Finance ------------------------------------------------------------------
router.get('/:eventId/finance', async (req, res) => {
  const { data: summary, error: sErr } = await supabase
    .from('v_event_finance')
    .select('*')
    .eq('event_id', req.event.id)
    .maybeSingle();
  if (sErr) return dbError(res, sErr);

  const { data: txns, error: tErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('owner_type', 'event')
    .eq('event_id', req.event.id)
    .order('occurred_on', { ascending: false });
  if (tErr) return dbError(res, tErr);

  res.json({ income: summary?.income || 0, expense: summary?.expense || 0, net: summary?.net || 0, transactions: txns });
});

// ---- Player reliability -------------------------------------------------------
router.get('/reliability/:clubMemberId', async (req, res) => {
  if (!isUuid(req.params.clubMemberId)) return notFound(res, 'Club member');
  const { data: member } = await supabase
    .from('club_members')
    .select('id, clubs!inner(host_id)')
    .eq('id', req.params.clubMemberId)
    .eq('clubs.host_id', req.hostId)
    .maybeSingle();
  if (!member) return notFound(res, 'Club member');
  const { data, error } = await supabase
    .from('v_player_reliability')
    .select('*')
    .eq('club_member_id', req.params.clubMemberId)
    .maybeSingle();
  if (error) return dbError(res, error);
  res.json(data || { club_member_id: req.params.clubMemberId, total_registrations: 0, no_shows: 0, attended: 0, reliability_pct: null });
});

module.exports = router;
module.exports.publicPlayerInfo = publicPlayerInfo;
