// Pro club tools, mounted on the clubs router (so :clubId access and roles apply):
//   GET  /:clubId/activity-log          who did what (activity_log)
//   GET  /:clubId/roster                duty roster (duty_roster) — all club staff may read
//   POST/PATCH/DELETE /:clubId/roster   owner / co-admin
//   GET  /:clubId/insights              advanced analytics (advanced_analytics)
const { supabase } = require('../supabase');
const { dbError, isUuid } = require('../utils/respond');
const { requireFeature } = require('../services/plan');
const { fetchAll } = require('../services/clubStats');
const { todayYmd } = require('../services/memberships');
const { insights } = require('../services/insights');

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{2}:\d{2}(:\d{2})?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const shift = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const fail = (res, status, error, code) => res.status(status).json({ error, ...(code ? { code } : {}) });

function mount(router) {
  // ---- Activity log -----------------------------------------------------------------
  router.get('/:clubId/activity-log', requireFeature('activity_log'), async (req, res) => {
    try {
      const per = 50;
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      let q = supabase.from('club_activity_logs').select('*', { count: 'exact' }).eq('club_id', req.club.id).order('created_at', { ascending: false }).range((page - 1) * per, page * per - 1);
      if (req.query.actor && EMAIL.test(req.query.actor)) q = q.eq('actor_email', req.query.actor);
      if (req.query.action && /^[a-z_.]+$/.test(req.query.action)) q = q.like('action', `${req.query.action}%`);
      if (YMD.test(req.query.from || '')) q = q.gte('created_at', `${req.query.from}T00:00:00+07:00`);
      if (YMD.test(req.query.to || '')) q = q.lt('created_at', `${shift(req.query.to, 1)}T00:00:00+07:00`);
      const { data, error, count } = await q;
      if (error) throw error;
      const { data: actors } = await supabase.from('club_activity_logs').select('actor_email').eq('club_id', req.club.id).order('actor_email').limit(1000);
      res.json({ rows: data, total: count || 0, page, pages: Math.max(1, Math.ceil((count || 0) / per)), actors: [...new Set((actors || []).map((a) => a.actor_email).filter(Boolean))] });
    } catch (err) {
      dbError(res, err);
    }
  });

  // ---- Duty roster ----------------------------------------------------------------
  const canManage = (req) => ['owner', 'co_admin'].includes(req.clubRole || 'owner');

  // Who can be put on duty: the owner and the club's staff.
  async function staffOf(club) {
    const [{ data: owner }, { data: grants }] = await Promise.all([
      supabase.from('users').select('email').eq('id', club.host_id).maybeSingle(),
      supabase.from('staff_grants').select('email, full_name, role').eq('club_id', club.id),
    ]);
    const out = new Map();
    if (owner?.email) out.set(owner.email.toLowerCase(), { email: owner.email.toLowerCase(), full_name: null, role: 'owner' });
    for (const g of grants || []) if (!out.has(g.email)) out.set(g.email, { email: g.email, full_name: g.full_name, role: g.role });
    return [...out.values()];
  }

  function cleanShift(b, partial = false) {
    const out = {};
    if (!partial || 'title' in b) {
      const t = String(b.title || '').trim();
      if (!t || t.length > 80) throw Object.assign(new Error('Title: 1–80 characters.'), { status: 400 });
      out.title = t;
    }
    if (!partial || 'shift_date' in b) {
      if (!YMD.test(String(b.shift_date || ''))) throw Object.assign(new Error('shift_date must be YYYY-MM-DD.'), { status: 400 });
      out.shift_date = b.shift_date;
    }
    for (const k of ['start_time', 'end_time']) {
      if (!(k in b)) continue;
      if (b[k] && !HM.test(String(b[k]))) throw Object.assign(new Error(`${k} must be HH:MM.`), { status: 400 });
      out[k] = b[k] || null;
    }
    if (out.start_time && out.end_time && out.end_time <= out.start_time) throw Object.assign(new Error('The shift must end after it starts.'), { status: 400 });
    if ('notes' in b) out.notes = String(b.notes || '').trim().slice(0, 300) || null;
    return out;
  }

  async function cleanPeople(club, list) {
    if (list == null) return null;
    if (!Array.isArray(list) || list.length > 20) throw Object.assign(new Error('people: up to 20 emails.'), { status: 400 });
    const staff = await staffOf(club);
    const known = new Map(staff.map((s) => [s.email, s]));
    return [...new Set(list.map((e) => String(e || '').trim().toLowerCase()))].map((email) => {
      if (!known.has(email)) throw Object.assign(new Error(`${email} is not on this club's staff.`), { status: 400, code: 'not_staff' });
      return { email, full_name: known.get(email).full_name };
    });
  }

  router.get('/:clubId/roster', requireFeature('duty_roster'), async (req, res) => {
    try {
      const from = YMD.test(req.query.from || '') ? req.query.from : todayYmd();
      const to = YMD.test(req.query.to || '') ? req.query.to : shift(from, 27);
      if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 120) return fail(res, 400, 'Pick at most about 4 months.');
      const { data: shifts, error } = await supabase.from('duty_shifts').select('*, duty_shift_people(email, full_name)').eq('club_id', req.club.id).gte('shift_date', from).lte('shift_date', to).order('shift_date').order('start_time');
      if (error) throw error;
      res.json({
        from,
        to,
        me: (req.hostEmail || '').toLowerCase(),
        can_manage: canManage(req),
        staff: await staffOf(req.club),
        shifts: shifts.map(({ duty_shift_people: people, ...s }) => ({ ...s, people: people || [] })),
      });
    } catch (err) {
      dbError(res, err);
    }
  });

  router.post('/:clubId/roster', requireFeature('duty_roster'), async (req, res) => {
    if (!canManage(req)) return fail(res, 403, 'Only the owner or a co-admin can plan duty.', 'role_forbidden');
    try {
      const base = cleanShift(req.body || {});
      const people = (await cleanPeople(req.club, req.body.people || [])) || [];
      const repeat = Math.min(12, Math.max(1, parseInt(req.body.repeat_weeks, 10) || 1));
      const rows = Array.from({ length: repeat }, (_, i) => ({ ...base, shift_date: shift(base.shift_date, 7 * i), club_id: req.club.id, created_by: req.hostEmail || null }));
      const { data, error } = await supabase.from('duty_shifts').insert(rows).select();
      if (error) throw error;
      if (people.length) {
        const { error: pErr } = await supabase.from('duty_shift_people').insert(data.flatMap((s) => people.map((p) => ({ shift_id: s.id, ...p }))));
        if (pErr) throw pErr;
      }
      res.status(201).json(data.map((s) => ({ ...s, people })));
    } catch (err) {
      if (err.status) return fail(res, err.status, err.message, err.code);
      dbError(res, err);
    }
  });

  router.patch('/:clubId/roster/:shiftId', requireFeature('duty_roster'), async (req, res) => {
    if (!canManage(req)) return fail(res, 403, 'Only the owner or a co-admin can plan duty.', 'role_forbidden');
    if (!isUuid(req.params.shiftId)) return fail(res, 404, 'Shift not found.');
    try {
      const patch = cleanShift(req.body || {}, true);
      const { data: s } = await supabase.from('duty_shifts').select('*').eq('id', req.params.shiftId).eq('club_id', req.club.id).maybeSingle();
      if (!s) return fail(res, 404, 'Shift not found.');
      const next = { ...s, ...patch };
      if (next.start_time && next.end_time && next.end_time <= next.start_time) return fail(res, 400, 'The shift must end after it starts.');
      if (Object.keys(patch).length) {
        const { error } = await supabase.from('duty_shifts').update(patch).eq('id', s.id);
        if (error) throw error;
      }
      const people = await cleanPeople(req.club, req.body.people);
      if (people) {
        await supabase.from('duty_shift_people').delete().eq('shift_id', s.id);
        if (people.length) {
          const { error } = await supabase.from('duty_shift_people').insert(people.map((p) => ({ shift_id: s.id, ...p })));
          if (error) throw error;
        }
      }
      const { data } = await supabase.from('duty_shifts').select('*, duty_shift_people(email, full_name)').eq('id', s.id).single();
      const { duty_shift_people: ppl, ...rest } = data;
      res.json({ ...rest, people: ppl || [] });
    } catch (err) {
      if (err.status) return fail(res, err.status, err.message, err.code);
      dbError(res, err);
    }
  });

  router.delete('/:clubId/roster/:shiftId', requireFeature('duty_roster'), async (req, res) => {
    if (!canManage(req)) return fail(res, 403, 'Only the owner or a co-admin can plan duty.', 'role_forbidden');
    if (!isUuid(req.params.shiftId)) return fail(res, 404, 'Shift not found.');
    const { data, error } = await supabase.from('duty_shifts').delete().eq('id', req.params.shiftId).eq('club_id', req.club.id).select('id');
    if (error) return dbError(res, error);
    if (!data.length) return fail(res, 404, 'Shift not found.');
    res.status(204).end();
  });

  // ---- Advanced analytics ---------------------------------------------------------
  router.get('/:clubId/insights', requireFeature('advanced_analytics'), async (req, res) => {
    try {
      const months = [3, 6, 12].includes(Number(req.query.months)) ? Number(req.query.months) : 6;
      const today = todayYmd();
      const [y, m] = today.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - months, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const clubId = req.club.id;

      const [members, events, plans] = await Promise.all([
        fetchAll(() => supabase.from('club_members').select('id, full_name, member_type, is_active, joined_on, created_at, user_id').eq('club_id', clubId).order('id')),
        fetchAll(() => supabase.from('events').select('id, title, event_date, kind, slots, status').eq('club_id', clubId).gte('event_date', start).lte('event_date', end).neq('status', 'cancelled').neq('kind', 'meeting').order('event_date')),
        fetchAll(() => supabase.from('membership_plans').select('id, name, period').eq('club_id', clubId).order('id')),
      ]);
      const eventIds = events.map((e) => e.id);
      const memberIds = members.map((x) => x.id);
      const chunks = (arr, n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
      const parts = [];
      for (const ids of chunks(eventIds)) {
        let rows;
        const withGuest = await supabase.from('event_participants').select('event_id, source_club_member_id, guest_member_id, user_id, status').in('event_id', ids).limit(10000);
        if (withGuest.error) {
          const plain = await supabase.from('event_participants').select('event_id, source_club_member_id, user_id, status').in('event_id', ids).limit(10000);
          if (plain.error) throw plain.error;
          rows = plain.data;
        } else rows = withGuest.data;
        parts.push(...rows);
      }
      const memberships = [];
      for (const ids of chunks(memberIds)) {
        const { data, error } = await supabase.from('memberships').select('id, club_member_id, plan_id, starts_on, ends_on, status, amount').in('club_member_id', ids).gte('ends_on', shift(start, -40)).limit(10000);
        if (error) throw error;
        memberships.push(...data);
      }
      const money = [];
      const clubMoney = await fetchAll(() => supabase.from('transactions').select('type, amount, occurred_on').eq('club_id', clubId).eq('is_voided', false).gte('occurred_on', start).lte('occurred_on', end).order('occurred_on'));
      money.push(...clubMoney.map((t) => ({ ...t, event_id: null })));
      for (const ids of chunks(eventIds)) {
        const { data, error } = await supabase.from('transactions').select('type, amount, occurred_on, event_id').in('event_id', ids).eq('is_voided', false).limit(10000);
        if (error) throw error;
        money.push(...data);
      }
      const byUser = new Map(members.filter((x) => x.user_id).map((x) => [x.user_id, x.id]));
      const participants = parts.map((p) => ({ event_id: p.event_id, status: p.status, member_id: p.source_club_member_id || p.guest_member_id || (p.user_id && byUser.get(p.user_id)) || null }));
      res.json(insights({ members, events, participants, memberships, plans, money, from: start, to: end, today }));
    } catch (err) {
      dbError(res, err);
    }
  });
}

module.exports = { mount };
