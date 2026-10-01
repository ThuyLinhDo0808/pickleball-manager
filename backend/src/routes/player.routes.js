const crypto = require('crypto');
const express = require('express');
const { supabase } = require('../supabase');
const { dbError, notFound, isUuid } = require('../utils/respond');
const { limitBody } = require('../middleware/checkCapacity');
const { todayYmd, periodRange, summarize, normalizePhone } = require('../services/memberships');
const { localDate, winnerTeam } = require('../services/stats');
const { newPaymentRef, paymentInfo } = require('../services/payment');
const { cancelDeadline, cancelParticipant } = require('../services/attendance');
const { transferSlot } = require('../services/signup');
const { telegramSend } = require('../services/notify');
const survey = require('../services/survey');
const { linkByPhone } = require('../services/phoneLink');

function badRequest(message, status = 400, code) {
  return Object.assign(new Error(message), { status, code });
}

function fail(res, err) {
  return err.status ? res.status(err.status).json({ error: err.message, code: err.code }) : dbError(res, err);
}

const PLAN_FIELDS = 'id, name, period, price, sessions_included';

async function clubByToken(token) {
  if (!isUuid(token)) return null;
  const { data, error } = await supabase.from('clubs').select('*').eq('join_token', token).eq('allow_join', true).maybeSingle();
  if (error) throw error;
  return data;
}

// =============================================================================
// Public (no login): the club join page  —  /api/public
// =============================================================================
const publicRoutes = express.Router();

publicRoutes.get('/clubs/:token', async (req, res) => {
  try {
    const club = await clubByToken(req.params.token);
    if (!club) return notFound(res, 'Club');
    const { data: plans, error } = await supabase
      .from('membership_plans')
      .select(PLAN_FIELDS)
      .eq('club_id', club.id)
      .eq('is_active', true)
      .order('price');
    if (error) throw error;
    // Bank details are only shown after the player has signed in and joined.
    res.json({ name: club.name, description: club.description, join_note: club.join_note, plans });
  } catch (err) {
    fail(res, err);
  }
});

// A ticket page anyone with the (secret, random) ticket code can open — the link a player
// saves or forwards to a friend after transferring their place. No phone numbers.
// After-session survey (private link sent to the guest; no login needed).
publicRoutes.get('/surveys/:token', async (req, res) => {
  try {
    res.json(await survey.surveyView(req.params.token));
  } catch (err) {
    fail(res, err);
  }
});
publicRoutes.post('/surveys/:token', async (req, res) => {
  try {
    res.json(await survey.answerSurvey(req.params.token, req.body || {}));
  } catch (err) {
    fail(res, err);
  }
});
// "I want to join the fixed team" member form -> the club's waiting list.
publicRoutes.post('/surveys/:token/join', async (req, res) => {
  try {
    res.json(await survey.joinFromSurvey(req.params.token, req.body || {}));
  } catch (err) {
    fail(res, err);
  }
});

publicRoutes.get('/tickets/:code', async (req, res) => {
  try {
    if (!isUuid(req.params.code)) return notFound(res, 'Ticket');
    const { data: p, error } = await supabase
      .from('event_participants')
      .select('full_name, status, kind, payment_status, ticket_code, transferred_from, events(title, event_date, start_time, end_time, location, public_token, clubs(name))')
      .eq('ticket_code', req.params.code)
      .maybeSingle();
    if (error) throw error;
    if (!p) return notFound(res, 'Ticket');
    const valid = ['registered', 'checked_in'].includes(p.status);
    res.json({
      full_name: p.full_name,
      status: p.status,
      kind: p.kind,
      payment_status: p.payment_status,
      transferred_from: p.transferred_from,
      valid,
      checkin_code: valid ? `PBT:${p.ticket_code}` : null,
      event: { ...p.events, club_name: p.events?.clubs?.name || null, clubs: undefined },
    });
  } catch (err) {
    fail(res, err);
  }
});

// Telegram bot updates (set up with backend/scripts/telegram-webhook.js). Telegram
// signs each call with the secret we registered; anything else is ignored.
publicRoutes.post('/telegram', async (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.get('X-Telegram-Bot-Api-Secret-Token') !== secret) return res.status(404).json({ error: 'Not found.' });
  res.json({ ok: true }); // answer Telegram right away; it retries on errors
  try {
    const msg = req.body?.message;
    const code = String(msg?.text || '').match(/^\/start\s+([a-f0-9]{16,64})$/i)?.[1];
    if (!msg?.chat?.id) return;
    if (!code) {
      await telegramSend(msg.chat.id, 'Xin chào! Hãy mở Cổng người chơi → Hồ sơ → "Kết nối Telegram" để nhận thông báo kèo.');
      return;
    }
    const { data: profile } = await supabase
      .from('player_profiles')
      .update({ telegram_chat_id: msg.chat.id })
      .eq('telegram_link_code', code.toLowerCase())
      .select('full_name')
      .maybeSingle();
    await telegramSend(
      msg.chat.id,
      profile
        ? `✅ Đã kết nối, ${profile.full_name}! Bạn sẽ nhận tin khi được đẩy từ danh sách chờ lên danh sách chính.`
        : 'Mã kết nối không đúng hoặc đã hết hạn. Hãy bấm lại "Kết nối Telegram" trong app.'
    );
  } catch (err) {
    console.error('telegram webhook', err);
  }
});

// =============================================================================
// Signed-in player  —  /api/player
// =============================================================================
const player = express.Router();

async function getProfile(userId) {
  const { data, error } = await supabase.from('player_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

function cleanProfile(body) {
  const full_name = String(body.full_name || '').trim();
  const phone = String(body.phone || '').trim();
  if (!full_name) throw badRequest('full_name is required.');
  if (normalizePhone(phone).length < 9) throw badRequest('A valid phone number is required.');
  const dupr = body.dupr_level === '' || body.dupr_level == null ? null : Number(body.dupr_level);
  if (dupr != null && !(dupr >= 1 && dupr <= 8)) throw badRequest('dupr_level must be between 1 and 8.');
  // Full birth date is required (the club uses it for birthdays); the year follows it.
  const birth = String(body.birth_date || '').slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || Number.isNaN(Date.parse(birth)) || birth < '1900-01-01' || birth > today) {
    throw badRequest('A valid birth date is required.', 400, 'birth_date_required');
  }
  const year = Number(birth.slice(0, 4));
  const gender = ['male', 'female'].includes(body.gender) ? body.gender : null;
  let avatar = body.avatar || null;
  if (avatar && !(/^data:image\/(jpeg|png|webp);base64,/.test(avatar) && avatar.length <= 150000)) {
    throw badRequest('avatar must be a small JPEG/PNG/WebP image.');
  }
  return { full_name, phone, dupr_level: dupr, birth_date: birth, birth_year: year, gender, avatar };
}

// Copy profile details into blank fields of a club record (never overwrite the Host's data).
function blanksFrom(member, profile) {
  const patch = {};
  for (const k of ['phone', 'dupr_level', 'gender', 'birth_year', 'birth_date']) if (member[k] == null && profile[k] != null) patch[k] = profile[k];
  return patch;
}

player.put('/profile', async (req, res) => {
  try {
    const p = cleanProfile(req.body);
    const { data, error } = await supabase
      .from('player_profiles')
      .upsert({ user_id: req.hostId, ...p, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    await linkByPhone(req.hostId, data); // a club already has this phone -> member there

    // Fill blanks on the player's club records (never overwrite what the Host entered).
    const { data: mine } = await supabase.from('club_members').select('*').eq('user_id', req.hostId);
    for (const m of mine || []) {
      const patch = blanksFrom(m, p);
      if (Object.keys(patch).length) await supabase.from('club_members').update(patch).eq('id', m.id);
    }
    res.json(data);
  } catch (err) {
    fail(res, err);
  }
});

// Join a club and request a membership. The Host confirms once the transfer arrives.
player.post('/join/:token', async (req, res) => {
  try {
    const club = await clubByToken(req.params.token);
    if (!club) throw badRequest('Club not found.', 404);
    const profile = await getProfile(req.hostId);
    if (!profile?.full_name || !profile?.phone || !profile?.birth_date) throw badRequest('Complete your profile first.', 400, 'profile_required');

    const count = Math.min(Math.max(parseInt(req.body.count, 10) || 1, 1), 12);
    if (!isUuid(req.body.plan_id) || !/^\d{4}-\d{2}$/.test(req.body.start_month || '')) {
      throw badRequest('plan_id and start_month (YYYY-MM) are required.');
    }
    const { data: plan } = await supabase
      .from('membership_plans')
      .select('*')
      .eq('id', req.body.plan_id)
      .eq('club_id', club.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!plan) throw badRequest('Plan not found.', 404);
    if (req.body.start_month < todayYmd().slice(0, 7)) throw badRequest('The starting month is in the past.');

    // Find this player's record in the club: already linked, else same phone (unlinked), else new.
    let { data: member } = await supabase.from('club_members').select('*').eq('club_id', club.id).eq('user_id', req.hostId).maybeSingle();
    if (!member) {
      const { data: samePhone } = await supabase.from('club_members').select('*').eq('club_id', club.id).is('user_id', null);
      member = (samePhone || []).find((m) => normalizePhone(m.phone) === normalizePhone(profile.phone)) || null;
      if (member) {
        const { data: linked, error } = await supabase
          .from('club_members')
          .update({ user_id: req.hostId, account_verified: false, ...blanksFrom(member, profile) })
          .eq('id', member.id)
          .select()
          .single();
        if (error) throw error;
        member = linked;
      }
    }
    if (!member) {
      const { willExceed } = await limitBody(club.host_id, 1);
      if (willExceed) throw badRequest('This club is full right now. Please contact the host.', 403);
      const { data: created, error } = await supabase
        .from('club_members')
        .insert({
          club_id: club.id,
          user_id: req.hostId,
          account_verified: false,
          full_name: profile.full_name,
          phone: profile.phone,
          dupr_level: profile.dupr_level,
          gender: profile.gender,
          birth_year: profile.birth_year,
          birth_date: profile.birth_date || null,
          member_type: 'fixed',
        })
        .select()
        .single();
      if (error) throw error;
      member = created;
    }

    const periods = Array.from({ length: count }, (_, i) => periodRange(plan.period, req.body.start_month, i));
    const { data: existing } = await supabase.from('memberships').select('period_label, plan_id').eq('club_member_id', member.id);
    const clash = periods.find((p) => (existing || []).some((e) => e.plan_id === plan.id && e.period_label === p.period_label));
    if (clash) throw badRequest(`You already have ${plan.name} for ${clash.period_label}.`, 409);

    const ref = newPaymentRef();
    const { data: rows, error } = await supabase
      .from('memberships')
      .insert(
        periods.map((p) => ({
          club_member_id: member.id,
          plan_id: plan.id,
          ...p,
          amount: plan.price,
          status: 'pending',
          requested_by_player: true,
          payment_ref: ref,
        }))
      )
      .select();
    if (error) throw error;
    res.status(201).json({ club_name: club.name, plan_name: plan.name, payment: paymentInfo(club, rows) });
  } catch (err) {
    fail(res, err);
  }
});

// Payment requests belong to the player only through their own linked club records.
async function myPaymentRows(userId, ref) {
  const { data: members } = await supabase.from('club_members').select('id, club_id').eq('user_id', userId);
  const ids = (members || []).map((m) => m.id);
  if (!ids.length || !/^PB[A-Z0-9]{6}$/.test(ref)) return { rows: [], club: null };
  const { data: rows, error } = await supabase.from('memberships').select('*').eq('payment_ref', ref).in('club_member_id', ids);
  if (error) throw error;
  if (!rows.length) return { rows, club: null };
  const clubId = members.find((m) => m.id === rows[0].club_member_id).club_id;
  const { data: club } = await supabase.from('clubs').select('*').eq('id', clubId).maybeSingle();
  return { rows, club };
}

player.get('/payments/:ref', async (req, res) => {
  try {
    const { rows, club } = await myPaymentRows(req.hostId, req.params.ref);
    if (!rows.length) throw badRequest('Payment not found.', 404);
    res.json({ club_name: club?.name, payment: paymentInfo(club, rows) });
  } catch (err) {
    fail(res, err);
  }
});

// Withdraw a request the Host hasn't confirmed yet.
player.delete('/payments/:ref', async (req, res) => {
  try {
    const { rows } = await myPaymentRows(req.hostId, req.params.ref);
    if (!rows.length) throw badRequest('Payment not found.', 404);
    if (rows.some((m) => m.status === 'paid' || !m.requested_by_player)) throw badRequest('Already confirmed by the host.', 409);
    const { error } = await supabase.from('memberships').delete().in('id', rows.map((m) => m.id));
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    fail(res, err);
  }
});

// Everything on the player dashboard in one request.
player.get('/me', async (req, res) => {
  try {
    const uid = req.hostId;
    const profile = await getProfile(uid);
    await linkByPhone(uid, profile); // members the Host added since the last visit
    const { data: members, error: mErr } = await supabase.from('club_members').select('*, clubs(id, name, bank_code, bank_account, bank_holder)').eq('user_id', uid);
    if (mErr) throw mErr;
    const memberIds = members.map((m) => m.id);

    const { data: passes } = memberIds.length
      ? await supabase.from('v_membership_status').select('*').in('club_member_id', memberIds).order('starts_on', { ascending: false })
      : { data: [] };
    const { data: rawMemberships } = memberIds.length
      ? await supabase.from('memberships').select('id, club_member_id, payment_ref, requested_by_player, status, amount, period_label, membership_plans(name)').in('club_member_id', memberIds)
      : { data: [] };
    const today = todayYmd();
    const clubs = members.map((m) => {
      const mine = (passes || []).filter((p) => p.club_member_id === m.id);
      const raw = (rawMemberships || []).filter((x) => x.club_member_id === m.id);
      const refs = [...new Set(raw.filter((x) => x.payment_ref && x.status !== 'paid').map((x) => x.payment_ref))];
      return {
        club_id: m.club_id,
        club_name: m.clubs?.name,
        member_type: m.member_type,
        tier: m.tier,
        account_verified: m.account_verified,
        ...summarize(mine, today),
        memberships: mine.slice(0, 12).map((p) => ({
          period_label: p.period_label,
          status: p.status,
          amount: p.amount,
          sessions_included: p.sessions_included,
          sessions_used: p.sessions_used,
          sessions_remaining: p.sessions_remaining,
          plan_name: raw.find((x) => x.id === p.membership_id)?.membership_plans?.name || null,
        })),
        pending_payments: refs.map((ref) => ({ club_name: m.clubs?.name, ...paymentInfo(m.clubs, raw.filter((x) => x.payment_ref === ref)) })),
      };
    });

    // Event history: sign-ups made while logged in + sessions as a club member.
    const orFilter = [`user_id.eq.${uid}`, memberIds.length ? `source_club_member_id.in.(${memberIds.join(',')})` : null].filter(Boolean).join(',');
    const { data: regs, error: rErr } = await supabase
      .from('event_participants')
      .select(
        'id, status, event_id, source_club_member_id, fee_amount, fee_paid, late_cancel, kind, payment_status, ticket_code, events(title, event_date, start_time, location, public_token, allow_public_registration, status, fee_amount, cancel_deadline_hours, clubs(name))'
      )
      .or(orFilter)
      .limit(500);
    if (rErr) throw rErr;
    const seen = new Set();
    const history = [];
    // Prefer the live registration when a player has several rows for one event.
    const order = { checked_in: 0, registered: 1, pending: 2, waitlisted: 3, no_show: 4, cancelled: 5 };
    regs.sort((a, b) => order[a.status] - order[b.status]);
    for (const r of regs) {
      if (!r.events || seen.has(r.event_id)) continue;
      seen.add(r.event_id);
      const upcoming = r.events.event_date >= today && ['draft', 'open', 'closed'].includes(r.events.status);
      const deadline = cancelDeadline(r.events);
      history.push({
        participant_id: r.id,
        can_cancel: upcoming && ['registered', 'waitlisted', 'pending'].includes(r.status),
        cancel_deadline: deadline ? deadline.toISOString() : null,
        late_cancel: r.late_cancel,
        payment_status: r.payment_status,
        ticket_code: ['registered', 'checked_in'].includes(r.status) ? r.ticket_code : null,
        transferable: upcoming && r.kind === 'guest' && ['registered', 'pending'].includes(r.status),
        public_token: r.events.public_token,
        event_id: r.event_id,
        title: r.events.title,
        event_date: r.events.event_date,
        start_time: r.events.start_time,
        location: r.events.location,
        club_name: r.events.clubs?.name || null,
        status: r.status,
        link: r.events.allow_public_registration ? r.events.public_token : null,
      });
    }
    history.sort((a, b) => b.event_date.localeCompare(a.event_date));

    // Event fees still owed: played (or cancelled late), not marked paid by the Host,
    // and not covered by a membership session.
    const membershipIds = (rawMemberships || []).map((m) => m.id);
    const { data: usedSessions } = membershipIds.length
      ? await supabase.from('membership_sessions').select('event_id').in('membership_id', membershipIds).not('event_id', 'is', null)
      : { data: [] };
    const coveredByPass = new Set((usedSessions || []).map((u) => u.event_id));
    const eventDebts = regs
      .filter((r) => r.events && !r.fee_paid && (r.status === 'checked_in' || (r.status === 'cancelled' && r.late_cancel)))
      .filter((r) => !(r.source_club_member_id && coveredByPass.has(r.event_id)))
      .map((r) => ({
        event_id: r.event_id,
        title: r.events.title,
        event_date: r.events.event_date,
        club_name: r.events.clubs?.name || null,
        amount: Number(r.fee_amount ?? r.events.fee_amount ?? 0),
        late_cancel: r.status === 'cancelled',
      }))
      .filter((d) => d.amount > 0)
      .sort((a, b) => b.event_date.localeCompare(a.event_date));

    // Form over the last 12 months: club matches + matches inside events I played.
    const participantIds = regs.map((r) => r.id);
    const mp = [];
    if (memberIds.length) {
      const { data } = await supabase.from('match_players').select('team, matches(played_at, team1_score, team2_score)').in('club_member_id', memberIds);
      mp.push(...(data || []));
    }
    if (participantIds.length) {
      const { data } = await supabase.from('match_players').select('team, matches(played_at, team1_score, team2_score)').in('event_participant_id', participantIds);
      mp.push(...(data || []));
    }
    const months = {};
    for (const row of mp) {
      const m = row.matches;
      if (!m) continue;
      const key = localDate(m.played_at).slice(0, 7);
      const s = (months[key] = months[key] || { month: key, matches: 0, wins: 0, points_for: 0, points_against: 0 });
      s.matches++;
      if (winnerTeam(m) === row.team) s.wins++;
      s.points_for += row.team === 1 ? m.team1_score : m.team2_score;
      s.points_against += row.team === 1 ? m.team2_score : m.team1_score;
    }
    const form = Object.values(months)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((s) => ({ ...s, win_rate: Math.round((1000 * s.wins) / s.matches) / 10, diff: s.points_for - s.points_against }));

    // DUPR over time (SCD2 history): the player's own profile + what their clubs recorded.
    const duprFilters = [`and(entity.eq.player,entity_id.eq.${uid})`];
    if (memberIds.length) duprFilters.push(`and(entity.eq.club_member,entity_id.in.(${memberIds.join(',')}))`);
    const { data: dupr } = await supabase
      .from('change_history')
      .select('entity, value, valid_from')
      .eq('attribute', 'dupr_level')
      .or(duprFilters.join(','))
      .order('valid_from', { ascending: true })
      .limit(200);
    const duprHistory = (dupr || [])
      .filter((h) => h.value != null)
      .map((h) => ({ date: localDate(h.valid_from), dupr: Number(h.value), source: h.entity === 'player' ? 'self' : 'club' }));

    res.json({
      email: req.hostEmail,
      profile: profile && (({ telegram_link_code, telegram_chat_id, ...p }) => p)(profile),
      checkin_code: profile ? `PBP:${profile.checkin_token}` : null,
      telegram: {
        available: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME),
        linked: !!profile?.telegram_chat_id,
      },
      event_debts: eventDebts,
      surveys_due: await survey.surveysDueFor(uid).catch(() => []),
      dupr_history: duprHistory,
      clubs,
      history: history.slice(0, 50),
      form,
      totals: {
        matches: form.reduce((s, x) => s + x.matches, 0),
        wins: form.reduce((s, x) => s + x.wins, 0),
        debt: clubs.reduce((s, c) => s + c.debt, 0) + eventDebts.reduce((s, d) => s + d.amount, 0),
        events: history.filter((h) => h.status === 'checked_in').length,
      },
    });
  } catch (err) {
    fail(res, err);
  }
});

// Cancel one of my registrations. Same policy as the Host's cancel: after the event's
// cancel deadline the session is still used / the fee still owed.
player.post('/participations/:participantId/cancel', async (req, res) => {
  try {
    if (!isUuid(req.params.participantId)) throw badRequest('Registration not found.', 404);
    const { data: prior } = await supabase.from('event_participants').select('*').eq('id', req.params.participantId).maybeSingle();
    let mine = prior?.user_id === req.hostId;
    if (prior && !mine && prior.source_club_member_id) {
      const { data: m } = await supabase.from('club_members').select('user_id').eq('id', prior.source_club_member_id).maybeSingle();
      mine = m?.user_id === req.hostId;
    }
    if (!mine) throw badRequest('Registration not found.', 404);
    const { data: event } = await supabase.from('events').select('*').eq('id', prior.event_id).single();
    if (event.event_date < todayYmd() || !['draft', 'open', 'closed'].includes(event.status)) {
      throw badRequest('This event can no longer be cancelled here. Please contact the host.', 409, 'event_over');
    }
    if (!['registered', 'waitlisted', 'pending'].includes(prior.status)) throw badRequest('Only upcoming registrations can be cancelled.', 409, 'not_cancellable');
    const r = await cancelParticipant(event, prior);
    res.json({ status: r.status, late: r.late, pass: r.pass });
  } catch (err) {
    fail(res, err);
  }
});

// Give my (guest) place to someone else: they get a new ticket link, my old ticket stops working.
player.post('/participations/:participantId/transfer', async (req, res) => {
  try {
    if (!isUuid(req.params.participantId)) throw badRequest('Registration not found.', 404);
    const { data: prior } = await supabase.from('event_participants').select('*').eq('id', req.params.participantId).maybeSingle();
    if (!prior || prior.user_id !== req.hostId) throw badRequest('Registration not found.', 404);
    const { data: event } = await supabase.from('events').select('*').eq('id', prior.event_id).single();
    if (event.event_date < todayYmd() || !['draft', 'open', 'closed'].includes(event.status)) {
      throw badRequest('This event is over.', 409, 'event_over');
    }
    const moved = await transferSlot(event, prior, req.body);
    res.json({ full_name: moved.full_name, status: moved.status, ticket_code: moved.ticket_code });
  } catch (err) {
    fail(res, err);
  }
});

// My personal check-in QR: make a new one if the old one was shared by mistake.
player.post('/checkin-code/rotate', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('player_profiles')
      .update({ checkin_token: crypto.randomUUID() })
      .eq('user_id', req.hostId)
      .select('checkin_token')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw badRequest('Complete your profile first.', 400, 'profile_required');
    res.json({ checkin_code: `PBP:${data.checkin_token}` });
  } catch (err) {
    fail(res, err);
  }
});

// Telegram: get a one-time link that opens the bot and connects this account.
player.post('/telegram/link', async (req, res) => {
  try {
    const bot = process.env.TELEGRAM_BOT_USERNAME;
    if (!process.env.TELEGRAM_BOT_TOKEN || !bot) throw badRequest('Telegram notifications are not set up on this server.', 501, 'not_configured');
    const code = crypto.randomBytes(12).toString('hex');
    const { data, error } = await supabase
      .from('player_profiles')
      .update({ telegram_link_code: code })
      .eq('user_id', req.hostId)
      .select('user_id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw badRequest('Complete your profile first.', 400, 'profile_required');
    res.json({ url: `https://t.me/${bot.replace(/^@/, '')}?start=${code}` });
  } catch (err) {
    fail(res, err);
  }
});

player.delete('/telegram', async (req, res) => {
  try {
    const { error } = await supabase.from('player_profiles').update({ telegram_chat_id: null, telegram_link_code: null }).eq('user_id', req.hostId);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    fail(res, err);
  }
});

module.exports = { publicRoutes, playerRoutes: player };
