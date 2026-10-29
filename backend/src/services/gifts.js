// Sinh nhật tháng này + Tặng quà. The Host sees every member whose birthday falls in a
// month (with their type, level, sessions played, last visit, phone and gift) and gives a
// gift: one free session, a discount, or a gift at the court, with a message and an expiry.
// The player sees it on their bell and on Tổng quan; the Host marks it used.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');
const { todayYmd } = require('./memberships');

const MIGRATION = '20270106090000_member_gifts.sql';
async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

const KINDS = ['free_session', 'percent', 'item'];
const lastDayOfNextMonth = (today) => {
  const [y, m] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m + 1, 0));
  return d.toISOString().slice(0, 10);
};

// Members of the club born in `month` ('01'..'12'), with what the Host needs to pick gifts.
async function monthList(club, month, { today = todayYmd(), withPhone = true } = {}) {
  const mm = String(month).padStart(2, '0');
  const { data, error } = await supabase
    .from('club_members')
    .select('id, full_name, birth_date, gender, member_type, tier, phone, dupr_level, dupr_doubles, user_id, is_active')
    .eq('club_id', club.id)
    .not('birth_date', 'is', null);
  if (error) throw error;
  const rows = (data || []).filter((m) => m.is_active !== false && String(m.birth_date).slice(5, 7) === mm);
  const ids = rows.map((m) => m.id);
  const users = rows.map((m) => m.user_id).filter(Boolean);
  // Sessions played here (checked in) and the last one.
  const { data: evs } = await supabase.from('events').select('id, event_date').eq('club_id', club.id).limit(5000);
  const evDate = new Map((evs || []).map((e) => [e.id, e.event_date]));
  const played = new Map();
  const touch = (key, d) => {
    const p = played.get(key) || { n: 0, last: null };
    p.n += 1;
    if (!p.last || d > p.last) p.last = d;
    played.set(key, p);
  };
  if (evDate.size && (ids.length || users.length)) {
    const or = [ids.length ? `source_club_member_id.in.(${ids.join(',')})` : null, ids.length ? `guest_member_id.in.(${ids.join(',')})` : null, users.length ? `user_id.in.(${users.join(',')})` : null].filter(Boolean).join(',');
    const { data: parts } = await supabase.from('event_participants').select('event_id, source_club_member_id, guest_member_id, user_id').eq('status', 'checked_in').or(or).limit(10000);
    const seen = new Set();
    for (const p of parts || []) {
      if (!evDate.has(p.event_id)) continue;
      const m = rows.find((r) => r.id === p.source_club_member_id || r.id === p.guest_member_id || (p.user_id && r.user_id === p.user_id));
      if (!m || seen.has(`${m.id}:${p.event_id}`)) continue;
      seen.add(`${m.id}:${p.event_id}`);
      touch(m.id, evDate.get(p.event_id));
    }
  }
  const year = Number(today.slice(0, 4));
  const gifts = (await ready()) && ids.length ? (await supabase.from('member_gifts').select('*').in('club_member_id', ids).eq('year', year)).data || [] : [];
  return rows
    .map((m) => ({
      id: m.id,
      full_name: m.full_name,
      birth_date: m.birth_date,
      day: String(m.birth_date).slice(8, 10),
      age: year - Number(String(m.birth_date).slice(0, 4)),
      gender: m.gender || null,
      member_type: m.member_type,
      tier: m.tier || null,
      phone: withPhone ? m.phone || null : null,
      level: m.dupr_doubles != null ? Number(m.dupr_doubles) : m.dupr_level != null ? Number(m.dupr_level) : null,
      has_account: !!m.user_id,
      sessions: played.get(m.id)?.n || 0,
      last_played: played.get(m.id)?.last || null,
      is_today: String(m.birth_date).slice(5) === today.slice(5),
      gift: gifts.find((g) => g.club_member_id === m.id) || null,
    }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.full_name.localeCompare(b.full_name, 'vi'));
}

function cleanGift(b, today) {
  const kind = KINDS.includes(b?.kind) ? b.kind : null;
  if (!kind) throw fail('Chọn loại quà.', 400, 'bad_kind');
  const percent = kind === 'percent' ? Math.round(Number(b.percent)) : null;
  if (kind === 'percent' && !(percent >= 1 && percent <= 100)) throw fail('Mức giảm 1–100%.', 400, 'bad_percent');
  const item = kind === 'item' ? String(b.item || '').trim().slice(0, 120) : null;
  if (kind === 'item' && !item) throw fail('Ghi món quà.', 400, 'bad_item');
  const message = String(b.message || '').trim().slice(0, 500) || null;
  const expires = /^\d{4}-\d{2}-\d{2}$/.test(String(b.expires_on || '')) ? b.expires_on : lastDayOfNextMonth(today);
  if (expires < today) throw fail('Hạn dùng phải từ hôm nay.', 400, 'bad_expiry');
  return { kind, percent, item, message, expires_on: expires };
}

// Give the same gift to several members (one birthday gift each per year; a member who
// already has one this year is skipped).
async function give(club, memberIds, body, userId, today = todayYmd()) {
  if (!(await ready())) throw Object.assign(fail('Run the database update first.', 503, 'migration_missing'), { migration: MIGRATION });
  const g = cleanGift(body, today);
  const ids = [...new Set((memberIds || []).filter((x) => /^[0-9a-f-]{36}$/i.test(String(x))))].slice(0, 200);
  if (!ids.length) throw fail('Chọn người nhận quà.', 400, 'no_members');
  const { data: mem } = await supabase.from('club_members').select('id, user_id, full_name').eq('club_id', club.id).in('id', ids);
  const year = Number(today.slice(0, 4));
  const { data: had } = await supabase.from('member_gifts').select('club_member_id').in('club_member_id', ids).eq('occasion', 'birthday').eq('year', year);
  const skip = new Set((had || []).map((x) => x.club_member_id));
  const rows = (mem || []).filter((m) => !skip.has(m.id)).map((m) => ({ club_id: club.id, club_member_id: m.id, user_id: m.user_id || null, occasion: 'birthday', year, ...g, message: g.message ? g.message.replace(/\{name\}/g, m.full_name) : null, created_by: userId || null }));
  if (rows.length) {
    const { error } = await supabase.from('member_gifts').insert(rows);
    if (error) throw error;
  }
  return { given: rows.length, skipped: skip.size, names: rows.map((r) => (mem || []).find((m) => m.id === r.club_member_id)?.full_name) };
}

async function setUsed(club, id, used) {
  const { data, error } = await supabase.from('member_gifts').update({ used_at: used ? new Date().toISOString() : null }).eq('id', id).eq('club_id', club.id).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw fail('Gift not found.', 404, 'not_found');
  return data;
}

async function remove(club, id) {
  const { data, error } = await supabase.from('member_gifts').delete().eq('id', id).eq('club_id', club.id).select('id');
  if (error) throw error;
  if (!data?.length) throw fail('Gift not found.', 404, 'not_found');
  return { ok: true };
}

// The player's gifts that can still be used (not used, not expired), newest first.
async function forUser(userId, today = todayYmd()) {
  if (!(await ready())) return [];
  const { data } = await supabase.from('member_gifts').select('id, club_id, kind, percent, item, message, expires_on, used_at, created_at, clubs(name)').eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  return (data || []).filter((g) => !g.used_at && (!g.expires_on || g.expires_on >= today)).map(({ clubs, ...g }) => ({ ...g, club_name: clubs?.name || null }));
}

module.exports = { MIGRATION, ready, monthList, give, setUsed, remove, forUser, cleanGift, lastDayOfNextMonth };
