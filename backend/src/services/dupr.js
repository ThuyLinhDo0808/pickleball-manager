// DUPR without the partner API (pickleball clubs):
//  - players give their DUPR ID (DUPR app → share button → "Copy DUPR ID");
//  - the Host exports the DUPR Club's member list (CSV) and imports it here: members are
//    matched by DUPR ID (never by name), the Host confirms, ratings are copied in;
//  - matches played in the app are exported in DUPR's "Import Matches via CSV" template,
//    and marked as exported so they are not sent twice.
const { supabase } = require('../supabase');

const MIGRATION = '20261119090000_dupr_link.sql';
const ID_RE = /^[A-Z0-9]{4,10}$/;

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

let readyCache = null;
async function ready() {
  if (readyCache && Date.now() - readyCache.at < 60000) return readyCache.ok;
  const { error } = await supabase.from('club_members').select('dupr_id').limit(1);
  readyCache = { ok: !error, at: Date.now() };
  return !error;
}

// "yn9n0g " -> "YN9N0G"; '' -> null; anything else that is not an ID -> error.
function cleanId(raw) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return null;
  if (!ID_RE.test(v)) throw httpError('A DUPR ID is 4-10 letters or digits, e.g. YN9N0G.', 400, 'bad_dupr_id');
  return v;
}

// ---- CSV ------------------------------------------------------------------------------
// RFC 4180: quoted fields, "" inside quotes, commas / new lines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

const rating = (v) => {
  const n = Number(v);
  return v == null || v === '' || /^NR$/i.test(String(v)) || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 1000) / 1000;
};
const reliability = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
};

// The DUPR Club member export: duprId, name, email, phone, singles, singlesReliability,
// doubles, doublesReliability, status, metrics. Email / phone come masked and are ignored.
function parseMembersCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw httpError('The file is empty.', 400, 'empty_file');
  const head = rows[0].map((h) => h.trim());
  const col = (name) => head.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const at = { id: col('duprId'), name: col('name'), s: col('singles'), sr: col('singlesReliability'), d: col('doubles'), dr: col('doublesReliability'), status: col('status') };
  if (at.id < 0 || at.d < 0) throw httpError('This is not a DUPR club member list (needs the duprId and doubles columns).', 400, 'not_dupr_members');
  const out = [];
  const seen = new Set();
  for (const r of rows.slice(1)) {
    const id = String(r[at.id] || '').trim().toUpperCase();
    if (!ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      dupr_id: id,
      name: String(r[at.name] || '').trim().slice(0, 80),
      doubles: rating(r[at.d]),
      doubles_rel: at.dr >= 0 ? reliability(r[at.dr]) : null,
      singles: at.s >= 0 ? rating(r[at.s]) : null,
      singles_rel: at.sr >= 0 ? reliability(r[at.sr]) : null,
      status: at.status >= 0 ? String(r[at.status] || '').trim() : null,
    });
  }
  if (!out.length) throw httpError('No DUPR IDs found in the file.', 400, 'no_rows');
  if (out.length > 3000) throw httpError('At most 3000 members per file.', 400, 'too_many');
  return out;
}

// ---- names (only to help the Host check, never to link) ------------------------------
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

// DUPR shows "First L." (e.g. "Do L." for "Do Thuy Linh"). Does it fit our full name?
// Whole words must all appear; the initial is only used when there is no whole word
// (Vietnamese names are often typed in another order on DUPR, e.g. "Tuan A.").
function nameFits(duprName, fullName) {
  const d = fold(duprName);
  const f = fold(fullName);
  if (!d.length || !f.length) return false;
  const words = d.filter((part) => part.length > 1);
  if (words.length) return words.every((part) => f.includes(part));
  return d.every((part) => f.some((w) => w[0] === part));
}
function nameScore(duprName, fullName) {
  const d = fold(duprName);
  const f = fold(fullName);
  let s = 0;
  for (const part of d) if (f.some((w) => (part.length === 1 ? w[0] === part : w === part))) s += part.length === 1 ? 1 : 2;
  return s;
}

// ---- members ----------------------------------------------------------------------------
async function clubMembers(club) {
  const { data, error } = await supabase
    .from('club_members')
    .select('id, full_name, member_type, is_active, user_id, dupr_level, dupr_id, dupr_name, dupr_doubles, dupr_doubles_rel, dupr_singles, dupr_singles_rel, dupr_synced_at, dupr_verified_at')
    .eq('club_id', club.id)
    ;
  if (error) throw error;
  const userIds = [...new Set((data || []).map((m) => m.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length ? await supabase.from('player_profiles').select('user_id, dupr_id').in('user_id', userIds) : { data: [] };
  const byUser = new Map((profiles || []).map((p) => [p.user_id, p.dupr_id]));
  // The ID the member uses: the one on the club record, else the one in their own profile.
  return (data || []).map((m) => ({ ...m, claimed: m.dupr_id || byUser.get(m.user_id) || null, from_profile: !m.dupr_id && !!byUser.get(m.user_id) }));
}

// What importing this file would do. Nothing is saved.
async function preview(club, text) {
  const rows = parseMembersCsv(text);
  const byId = new Map(rows.map((r) => [r.dupr_id, r]));
  const members = await clubMembers(club);
  const claims = new Map();
  for (const m of members) if (m.claimed) claims.set(m.claimed, [...(claims.get(m.claimed) || []), m.id]);

  const matched = [];
  const notInFile = [];
  for (const m of members) {
    if (!m.claimed) continue;
    const row = byId.get(m.claimed);
    const dup = claims.get(m.claimed).length > 1;
    if (!row) {
      notInFile.push({ member_id: m.id, full_name: m.full_name, dupr_id: m.claimed });
      continue;
    }
    matched.push({
      member_id: m.id,
      full_name: m.full_name,
      member_type: m.member_type,
      dupr_id: m.claimed,
      dupr_name: row.name,
      doubles: row.doubles,
      doubles_rel: row.doubles_rel,
      singles: row.singles,
      singles_rel: row.singles_rel,
      old_doubles: m.dupr_doubles ?? null,
      level: m.dupr_level ?? null,
      verified: !!m.dupr_verified_at && m.dupr_id === m.claimed,
      from_profile: m.from_profile,
      name_fits: nameFits(row.name, m.full_name),
      duplicate: dup,
    });
  }
  const linked = new Set(matched.map((x) => x.dupr_id));
  const free = members.filter((m) => !m.claimed);
  const unlinked = rows
    .filter((r) => !linked.has(r.dupr_id) && !claims.has(r.dupr_id))
    .map((r) => ({
      ...r,
      suggestions: free
        .map((m) => ({ member_id: m.id, full_name: m.full_name, score: nameScore(r.name, m.full_name) }))
        .filter((x) => x.score >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    }));
  return {
    total: rows.length,
    matched: matched.sort((a, b) => Number(a.name_fits) - Number(b.name_fits) || a.full_name.localeCompare(b.full_name)),
    unlinked,
    not_in_file: notInFile,
    free_members: free.map((m) => ({ member_id: m.id, full_name: m.full_name })),
  };
}

// Save: links = [{ member_id, dupr_id }] the Host confirmed (matched rows they kept ticked and
// file rows they paired with a member). Ratings come from the file; the doubles rating
// becomes the member's level (the level used everywhere in the app).
async function apply(club, text, links) {
  const rows = parseMembersCsv(text);
  const byId = new Map(rows.map((r) => [r.dupr_id, r]));
  const members = await clubMembers(club);
  const byMember = new Map(members.map((m) => [m.id, m]));
  if (!Array.isArray(links) || !links.length) throw httpError('Choose at least one member.', 400, 'nothing');
  const usedIds = new Set();
  const usedMembers = new Set();
  const plan = [];
  for (const l of links) {
    const m = byMember.get(l?.member_id);
    const id = cleanId(l?.dupr_id);
    const row = id && byId.get(id);
    if (!m || !row) throw httpError('A selected member or DUPR ID is not in this club / file.', 400, 'bad_link');
    if (usedIds.has(id) || usedMembers.has(m.id)) throw httpError(`DUPR ID ${id} is chosen twice.`, 400, 'duplicate');
    usedIds.add(id);
    usedMembers.add(m.id);
    plan.push({ m, row });
  }
  // An ID already on another member of this club (not part of this import) stays theirs.
  const taken = members.filter((m) => m.dupr_id && usedIds.has(m.dupr_id) && !usedMembers.has(m.id));
  if (taken.length) throw httpError(`DUPR ID ${taken[0].dupr_id} already belongs to ${taken[0].full_name}.`, 409, 'taken');

  const now = new Date().toISOString();
  let levels = 0;
  for (const { m, row } of plan) {
    const patch = {
      dupr_id: row.dupr_id,
      dupr_name: row.name || null,
      dupr_doubles: row.doubles,
      dupr_doubles_rel: row.doubles_rel,
      dupr_singles: row.singles,
      dupr_singles_rel: row.singles_rel,
      dupr_synced_at: now,
      dupr_verified_at: m.dupr_verified_at && m.dupr_id === row.dupr_id ? m.dupr_verified_at : now,
    };
    if (row.doubles != null) {
      const lvl = Math.round(row.doubles * 100) / 100;
      if (Number(m.dupr_level) !== lvl) levels++;
      patch.dupr_level = lvl;
    }
    const { error } = await supabase.from('club_members').update(patch).eq('id', m.id);
    if (error) throw error;
  }
  return { linked: plan.length, levels_changed: levels };
}

// Host sets / clears a member's DUPR ID by hand (checked against the file on next import).
async function setMemberId(club, memberId, raw) {
  const id = cleanId(raw);
  if (id) {
    const { data: other } = await supabase.from('club_members').select('id, full_name').eq('club_id', club.id).eq('dupr_id', id).neq('id', memberId).maybeSingle();
    if (other) throw httpError(`DUPR ID ${id} already belongs to ${other.full_name}.`, 409, 'taken');
  }
  const patch = id
    ? { dupr_id: id }
    : { dupr_id: null, dupr_name: null, dupr_doubles: null, dupr_doubles_rel: null, dupr_singles: null, dupr_singles_rel: null, dupr_synced_at: null, dupr_verified_at: null };
  const { data: cur } = await supabase.from('club_members').select('dupr_id').eq('id', memberId).eq('club_id', club.id).maybeSingle();
  if (!cur) throw httpError('Member not found.', 404, 'not_found');
  if (id && cur.dupr_id !== id) Object.assign(patch, { dupr_name: null, dupr_verified_at: null });
  const { data, error } = await supabase.from('club_members').update(patch).eq('id', memberId).select().single();
  if (error) throw error;
  return data;
}

// ---- matches -> DUPR "Import Matches via CSV" ------------------------------------------
const TEMPLATE = [
  'matchType', 'event', 'date',
  'playerA1', 'playerA1DuprId', 'playerA1ExternalId', 'playerA2', 'playerA2DuprId', 'playerA2ExternalId',
  'playerB1', 'playerB1DuprId', 'playerB1ExternalId', 'playerB2', 'playerB2DuprId', 'playerB2ExternalId',
  'teamAGame1', 'teamBGame1', 'teamAGame2', 'teamBGame2', 'teamAGame3', 'teamBGame3', 'teamAGame4', 'teamBGame4', 'teamAGame5', 'teamBGame5',
  'location', 'scoreType',
];

const ymdOf = (iso) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10) : null);

// Games as [[a, b], ...]: the games typed / scored live, else the match score as one game.
function gamesOf(m) {
  const g = Array.isArray(m.games) ? m.games.filter((x) => Array.isArray(x) && x.length === 2 && x.every((n) => Number.isFinite(Number(n)))) : [];
  if (g.length) return g.slice(0, 5).map(([a, b]) => [Number(a), Number(b)]);
  if (m.team1_score == null || m.team2_score == null) return [];
  return [[Number(m.team1_score), Number(m.team2_score)]];
}

// Every scored match of the club in [from, to]: club matches, matches inside its events,
// tournament matches (pairs) and team-league sub-matches.
async function clubMatches(club, from, to, includeExported) {
  const members = new Map();
  const memberIds = new Set();
  const out = [];
  const end = `${to}T23:59:59+07:00`;
  const start = `${from}T00:00:00+07:00`;

  // 1. Club matches and event matches.
  const { data: evs } = await supabase.from('events').select('id, title, location, event_date').eq('club_id', club.id).gte('event_date', from).lte('event_date', to);
  const evById = new Map((evs || []).map((e) => [e.id, e]));
  const ors = [`club_id.eq.${club.id}`];
  if (evById.size) ors.push(`event_id.in.(${[...evById.keys()].join(',')})`);
  let q = supabase.from('matches').select('id, club_id, event_id, match_type, played_at, created_at, team1_score, team2_score, games, dupr_exported_at').or(ors.join(','));
  const { data: ms, error } = await q.limit(5000);
  if (error) throw error;
  const inRange = (ms || []).filter((m) => {
    const day = m.event_id && evById.get(m.event_id) ? evById.get(m.event_id).event_date : ymdOf(m.played_at || m.created_at);
    return day && day >= from && day <= to && (includeExported || !m.dupr_exported_at);
  });
  const { data: mps } = inRange.length ? await supabase.from('match_players').select('match_id, team, club_member_id, event_participant_id').in('match_id', inRange.map((m) => m.id)) : { data: [] };
  const partIds = [...new Set((mps || []).map((p) => p.event_participant_id).filter(Boolean))];
  const { data: parts } = partIds.length ? await supabase.from('event_participants').select('id, full_name, user_id, source_club_member_id, guest_member_id').in('id', partIds) : { data: [] };
  const partById = new Map((parts || []).map((p) => [p.id, p]));
  for (const m of inRange) {
    const ev = m.event_id ? evById.get(m.event_id) : null;
    const team = (n) =>
      (mps || [])
        .filter((p) => p.match_id === m.id && p.team === n)
        .map((p) => {
          if (p.club_member_id) {
            memberIds.add(p.club_member_id);
            return { member_id: p.club_member_id };
          }
          const part = partById.get(p.event_participant_id);
          const mid = part?.source_club_member_id || part?.guest_member_id || null;
          if (mid) memberIds.add(mid);
          return { member_id: mid, name: part?.full_name || '?', user_id: part?.user_id || null };
        });
    out.push({ kind: 'match', id: m.id, date: ev?.event_date || ymdOf(m.played_at), event: ev?.title || null, location: ev?.location || null, a: team(1), b: team(2), games: gamesOf(m), exported_at: m.dupr_exported_at });
  }

  // 2. Tournaments of the club.
  const { data: tours } = await supabase.from('tournaments').select('id, name, kind, event_date, location').eq('club_id', club.id);
  const tourIds = (tours || []).map((t) => t.id);
  if (tourIds.length) {
    const tourById = new Map(tours.map((t) => [t.id, t]));
    const { data: tms } = await supabase.from('tournament_matches').select('id, tournament_id, team1_id, team2_id, team1_score, team2_score, games, played_at, is_bye, dupr_exported_at').in('tournament_id', tourIds).limit(5000);
    const { data: teams } = await supabase.from('tournament_teams').select('id, player1_id, player2_id').in('tournament_id', tourIds);
    const teamById = new Map((teams || []).map((t) => [t.id, t]));
    const { data: lives } = await supabase.from('tournament_live').select('match_id, sub_match_id, config').in('tournament_id', tourIds);
    const scoringOf = (matchId, subId) => (lives || []).find((l) => (subId ? l.sub_match_id === subId : l.match_id === matchId && !l.sub_match_id))?.config?.scoring || null;
    const dayOfT = (t, played) => t.event_date || ymdOf(played);
    const pl = (...ids) => ids.filter(Boolean).map((id) => (memberIds.add(id), { member_id: id }));
    for (const m of tms || []) {
      const t = tourById.get(m.tournament_id);
      if (t.kind === 'team' || m.is_bye || !m.team1_id || !m.team2_id) continue;
      const day = dayOfT(t, m.played_at);
      if (!day || day < from || day > to || (!includeExported && m.dupr_exported_at)) continue;
      const t1 = teamById.get(m.team1_id) || {};
      const t2 = teamById.get(m.team2_id) || {};
      out.push({ kind: 'tournament', id: m.id, date: day, event: t.name, location: t.location, a: pl(t1.player1_id, t1.player2_id), b: pl(t2.player1_id, t2.player2_id), games: gamesOf(m), scoring: scoringOf(m.id, null), exported_at: m.dupr_exported_at });
    }
    const leagueFixtures = (tms || []).filter((m) => tourById.get(m.tournament_id)?.kind === 'team');
    if (leagueFixtures.length) {
      const fixById = new Map(leagueFixtures.map((f) => [f.id, f]));
      const { data: subs } = await supabase.from('tournament_sub_matches').select('id, fixture_id, team1_p1, team1_p2, team2_p1, team2_p2, team1_score, team2_score, games, played_at, dupr_exported_at').in('fixture_id', [...fixById.keys()]);
      for (const s of subs || []) {
        const f = fixById.get(s.fixture_id);
        const t = tourById.get(f.tournament_id);
        const day = dayOfT(t, s.played_at || f.played_at);
        if (!day || day < from || day > to || (!includeExported && s.dupr_exported_at)) continue;
        out.push({ kind: 'sub', id: s.id, date: day, event: t.name, location: t.location, a: pl(s.team1_p1, s.team1_p2), b: pl(s.team2_p1, s.team2_p2), games: gamesOf(s), scoring: scoringOf(f.id, s.id), exported_at: s.dupr_exported_at });
      }
    }
  }

  // Names and DUPR IDs of everyone involved.
  const { data: mem } = memberIds.size ? await supabase.from('club_members').select('id, full_name, user_id, dupr_id, dupr_name').in('id', [...memberIds]) : { data: [] };
  for (const m of mem || []) members.set(m.id, m);
  const users = [...new Set([...(mem || []).map((m) => m.user_id), ...out.flatMap((x) => [...x.a, ...x.b]).map((p) => p.user_id)].filter(Boolean))];
  const { data: profs } = users.length ? await supabase.from('player_profiles').select('user_id, dupr_id').in('user_id', users) : { data: [] };
  const profId = new Map((profs || []).map((p) => [p.user_id, p.dupr_id]));
  const resolve = (p) => {
    const m = p.member_id ? members.get(p.member_id) : null;
    return {
      member_id: p.member_id || null,
      name: m?.full_name || p.name || '?',
      dupr_id: m?.dupr_id || profId.get(m?.user_id || p.user_id) || null,
    };
  };
  return out
    .filter((x) => x.a.length && x.a.length === x.b.length && x.a.length <= 2)
    .map((x) => {
      const a = x.a.map(resolve);
      const b = x.b.map(resolve);
      const missing = [...a, ...b].filter((p) => !p.dupr_id).map((p) => p.name);
      return {
        kind: x.kind,
        id: x.id,
        date: x.date,
        event: x.event,
        location: x.location,
        type: a.length === 1 ? 'S' : 'D',
        a,
        b,
        games: x.games,
        scoring: x.scoring,
        exported_at: x.exported_at || null,
        ready: !missing.length && x.games.length > 0,
        missing,
        no_score: !x.games.length,
      };
    })
    .sort((p, q) => String(q.date).localeCompare(String(p.date)));
}

// One CSV line per ready match, in DUPR's template. scoreType: the live scorer's setting
// when there was one, else the Host's choice (SIDEOUT / RALLY).
function matchesCsv(club, list, defaultScoring = 'SIDEOUT') {
  const rows = [TEMPLATE];
  for (const m of list.filter((x) => x.ready)) {
    const p = (team, i) => team[i] || { name: '', dupr_id: '', member_id: '' };
    const games = [...m.games, ...Array(5).fill(['', ''])].slice(0, 5);
    const scoring = m.scoring ? (m.scoring === 'rally' ? 'RALLY' : 'SIDEOUT') : defaultScoring;
    rows.push([
      m.type,
      m.event || club.name,
      m.date,
      ...[p(m.a, 0), p(m.a, 1), p(m.b, 0), p(m.b, 1)].flatMap((x) => (m.type === 'S' && x.name === '' ? ['', '', ''] : [x.name, x.dupr_id || '', x.member_id || ''])),
      ...games.flat(),
      m.location || club.address || '',
      scoring,
    ]);
  }
  return toCsv(rows);
}

const TABLE = { match: 'matches', tournament: 'tournament_matches', sub: 'tournament_sub_matches' };
async function markExported(club, items, exported) {
  const list = await clubMatches(club, '2000-01-01', '2999-12-31', true);
  const allowed = new Set(list.map((m) => `${m.kind}:${m.id}`));
  let n = 0;
  for (const kind of Object.keys(TABLE)) {
    const ids = (items || []).filter((i) => i?.kind === kind && allowed.has(`${kind}:${i.id}`)).map((i) => i.id);
    if (!ids.length) continue;
    const { error } = await supabase.from(TABLE[kind]).update({ dupr_exported_at: exported ? new Date().toISOString() : null }).in('id', ids);
    if (error) throw error;
    n += ids.length;
  }
  return { updated: n };
}

module.exports = { MIGRATION, ready, cleanId, parseCsv, parseMembersCsv, nameFits, preview, apply, setMemberId, clubMatches, matchesCsv, markExported, TEMPLATE };
