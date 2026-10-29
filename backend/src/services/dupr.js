// DUPR without the partner API (pickleball clubs):
//  - players give their DUPR ID (DUPR app → share button → "Copy DUPR ID");
//  - the Host exports the DUPR Club's member list (CSV) and imports it here: the list is kept
//    per club, and members are linked automatically by DUPR ID (never by name), ratings copied
//    in and kept as history;
//  - matches of an event / tournament are exported in DUPR's "Import Matches via CSV"
//    template, and marked as exported so they are not sent twice.
const { supabase } = require('../supabase');

const MIGRATION = '20261119090000_dupr_link.sql + 20261120090000_dupr_auto.sql';
const ID_RE = /^[A-Z0-9]{4,10}$/;

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

let readyCache = null;
async function ready() {
  if (readyCache && Date.now() - readyCache.at < 60000) return readyCache.ok;
  const { error } = await supabase.from('club_members').select('dupr_id').limit(1);
  const { error: e2 } = error ? { error } : await supabase.from('club_dupr_roster').select('dupr_id').limit(1);
  readyCache = { ok: !error && !e2, at: Date.now() };
  return readyCache.ok;
}

// "yn9n0g " -> "YN9N0G"; '' -> null; anything else that is not an ID -> error.
function cleanId(raw) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) return null;
  if (!ID_RE.test(v)) throw httpError('A DUPR ID is 4-10 letters or digits.', 400, 'bad_dupr_id');
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
  let duplicates = 0;
  for (const r of rows.slice(1)) {
    const id = String(r[at.id] || '').trim().toUpperCase();
    if (!ID_RE.test(id)) continue;
    if (seen.has(id)) {
      duplicates++; // the same person twice in the file: counted once
      continue;
    }
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
  out.duplicates = duplicates;
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

// ---- members ----------------------------------------------------------------------------
async function clubMembers(club) {
  const { data, error } = await supabase
    .from('club_members')
    .select('id, full_name, member_type, is_active, user_id, dupr_level, dupr_id, dupr_name, dupr_doubles, dupr_doubles_rel, dupr_singles, dupr_singles_rel, dupr_synced_at, dupr_verified_at')
    .eq('club_id', club.id);
  if (error) throw error;
  const userIds = [...new Set((data || []).map((m) => m.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length ? await supabase.from('player_profiles').select('user_id, dupr_id').in('user_id', userIds) : { data: [] };
  const byUser = new Map((profiles || []).map((p) => [p.user_id, p.dupr_id]));
  // The ID the member uses: the one on the club record, else the one in their own profile.
  return (data || []).map((m) => ({ ...m, claimed: m.dupr_id || byUser.get(m.user_id) || null }));
}

const num = (v) => (v == null ? null : Number(v));
const newer = (a, b) => !!a && (!b || new Date(a).getTime() > new Date(b).getTime());

// Copy a DUPR Club row onto a member: ID, name on DUPR, ratings; the doubles rating becomes the
// member's level (the level used everywhere in the app). A changed rating goes to the history.
// Returns 'new' (first link), 'changed', or 'same'.
async function linkRow(club, m, row, now) {
  const first = !(m.dupr_id === row.dupr_id && m.dupr_synced_at);
  const changed = first || num(m.dupr_doubles) !== row.doubles || num(m.dupr_singles) !== row.singles;
  const patch = {
    dupr_id: row.dupr_id,
    dupr_name: row.name || null,
    dupr_doubles: row.doubles,
    dupr_doubles_rel: row.doubles_rel,
    dupr_singles: row.singles,
    dupr_singles_rel: row.singles_rel,
    dupr_synced_at: now,
    dupr_verified_at: !first && m.dupr_verified_at ? m.dupr_verified_at : now,
  };
  if (row.doubles != null) patch.dupr_level = Math.round(row.doubles * 100) / 100;
  const { error } = await supabase.from('club_members').update(patch).eq('id', m.id);
  if (error) throw error;
  if (changed) {
    const { error: hErr } = await supabase.from('dupr_rating_history').insert({ club_id: club.id, club_member_id: m.id, dupr_id: row.dupr_id, doubles: row.doubles, singles: row.singles, recorded_at: now });
    if (hErr) throw hErr;
  }
  return first ? 'new' : changed ? 'changed' : 'same';
}

// The newest rating DUPR gave each ID, from any club or community's DUPR file (a DUPR rating is
// the player's own, the same everywhere). Where it came from is never returned.
// Map dupr_id -> { name, doubles, doubles_rel, singles, singles_rel, at }.
async function latestRatings(ids) {
  const out = new Map();
  const list = [...new Set((ids || []).filter((x) => ID_RE.test(String(x || ''))))];
  const take = (id, r) => {
    if (r.doubles == null && r.singles == null) return;
    const cur = out.get(id);
    if (!cur || newer(r.at, cur.at)) out.set(id, r);
  };
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200);
    const [{ data: ms }, { data: rs }] = await Promise.all([
      supabase.from('club_members').select('dupr_id, dupr_name, dupr_doubles, dupr_doubles_rel, dupr_singles, dupr_singles_rel, dupr_synced_at').in('dupr_id', chunk).not('dupr_synced_at', 'is', null),
      supabase.from('club_dupr_roster').select('dupr_id, name, doubles, doubles_rel, singles, singles_rel, last_seen_at').in('dupr_id', chunk),
    ]);
    for (const m of ms || []) take(m.dupr_id, { name: m.dupr_name, doubles: num(m.dupr_doubles), doubles_rel: m.dupr_doubles_rel, singles: num(m.dupr_singles), singles_rel: m.dupr_singles_rel, at: m.dupr_synced_at });
    for (const r of rs || []) take(r.dupr_id, { name: r.name, doubles: num(r.doubles), doubles_rel: r.doubles_rel, singles: num(r.singles), singles_rel: r.singles_rel, at: r.last_seen_at });
  }
  return out;
}

// A club just imported fresh ratings: every other club / community where someone uses the same
// DUPR ID gets them too (their DUPR list and their member), so the Host of community B sees the
// rating community A's file brought in — dated, without saying which community it came from.
async function shareRatings(club, rows, now) {
  const byId = new Map(rows.filter((r) => r.doubles != null || r.singles != null).map((r) => [r.dupr_id, r]));
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: rs } = await supabase.from('club_dupr_roster').select('club_id, dupr_id').in('dupr_id', chunk).neq('club_id', club.id);
    if (rs?.length) {
      const { error } = await supabase.from('club_dupr_roster').upsert(
        rs.map((x) => {
          const r = byId.get(x.dupr_id);
          return { club_id: x.club_id, dupr_id: x.dupr_id, doubles: r.doubles, doubles_rel: r.doubles_rel, singles: r.singles, singles_rel: r.singles_rel };
        }),
        { onConflict: 'club_id,dupr_id' }
      );
      if (error) throw error;
    }
    // Members with the ID on their record, and members whose own profile carries it.
    const { data: withId } = await supabase.from('club_members').select('id, club_id, dupr_id, dupr_synced_at, dupr_verified_at, dupr_doubles, dupr_singles').in('dupr_id', chunk).neq('club_id', club.id);
    const { data: profs } = await supabase.from('player_profiles').select('user_id, dupr_id').in('dupr_id', chunk);
    const idOfUser = new Map((profs || []).map((p) => [p.user_id, p.dupr_id]));
    const { data: byProfile } = idOfUser.size
      ? await supabase.from('club_members').select('id, club_id, user_id, dupr_id, dupr_synced_at, dupr_verified_at, dupr_doubles, dupr_singles, clubs(sport)').in('user_id', [...idOfUser.keys()]).is('dupr_id', null).neq('club_id', club.id)
      : { data: [] };
    const taken = new Set((withId || []).map((m) => `${m.club_id}:${m.dupr_id}`));
    const fromProfile = (byProfile || [])
      .filter((m) => (m.clubs?.sport || 'pickleball') === 'pickleball')
      .map((m) => ({ ...m, dupr_id: idOfUser.get(m.user_id) }))
      .filter((m) => !taken.has(`${m.club_id}:${m.dupr_id}`));
    const perClub = new Map();
    for (const m of fromProfile) perClub.set(`${m.club_id}:${m.dupr_id}`, (perClub.get(`${m.club_id}:${m.dupr_id}`) || 0) + 1);
    for (const m of [...(withId || []), ...fromProfile.filter((x) => perClub.get(`${x.club_id}:${x.dupr_id}`) === 1)]) {
      if (m.dupr_synced_at && !newer(now, m.dupr_synced_at)) continue;
      await linkRow({ id: m.club_id }, m, byId.get(m.dupr_id), now);
    }
  }
}

// The Host imports the DUPR Club member export. Everything is automatic and by DUPR ID only:
//  - repeated IDs in the file count once;
//  - the club's DUPR list is kept (club_dupr_roster): IDs seen before are refreshed, new IDs
//    are added — so a file of 150 after one of 80 adds 70 new IDs;
//  - members whose ID (typed by the Host or by the player in their profile) is in the file are
//    linked (new IDs) or get their ratings refreshed (IDs already linked);
//  - an ID claimed by two members of the club links nobody until the Host fixes it.
async function importRoster(club, text, userId) {
  const rows = parseMembersCsv(text);
  const now = new Date().toISOString();
  const { data: known, error: kErr } = await supabase.from('club_dupr_roster').select('dupr_id').eq('club_id', club.id);
  if (kErr) throw kErr;
  const knownIds = new Set((known || []).map((r) => r.dupr_id));
  const fresh = rows.filter((r) => !knownIds.has(r.dupr_id));
  const payload = (r) => ({ club_id: club.id, dupr_id: r.dupr_id, name: r.name || null, doubles: r.doubles, doubles_rel: r.doubles_rel, singles: r.singles, singles_rel: r.singles_rel, last_seen_at: now });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('club_dupr_roster').upsert(rows.slice(i, i + 500).map(payload), { onConflict: 'club_id,dupr_id' });
    if (error) throw error;
  }

  const byId = new Map(rows.map((r) => [r.dupr_id, r]));
  const members = await clubMembers(club);
  const claims = new Map();
  for (const m of members) if (m.claimed) claims.set(m.claimed, [...(claims.get(m.claimed) || []), m]);
  const out = { rows: rows.length, duplicates: rows.duplicates || 0, new_ids: fresh.length, known_ids: rows.length - fresh.length, linked_new: [], updated: 0, unchanged: 0, conflicts: [], not_in_club: [] };
  for (const [id, ms] of claims) {
    if (ms.length > 1) {
      out.conflicts.push({ dupr_id: id, names: ms.map((m) => m.full_name) });
      continue;
    }
    const m = ms[0];
    const row = byId.get(id);
    if (!row) {
      out.not_in_club.push({ member_id: m.id, full_name: m.full_name, dupr_id: id });
      continue;
    }
    const r = await linkRow(club, m, row, now);
    if (r === 'new') out.linked_new.push({ member_id: m.id, full_name: m.full_name, dupr_id: id, dupr_name: row.name, name_fits: nameFits(row.name, m.full_name) });
    else if (r === 'changed') out.updated++;
    else out.unchanged++;
  }
  out.unclaimed = [...new Set([...knownIds, ...byId.keys()])].filter((id) => !claims.has(id)).length;
  await shareRatings(club, rows, now);
  await supabase.from('club_dupr_imports').insert({ club_id: club.id, rows_total: out.rows, duplicates: out.duplicates, new_ids: out.new_ids, linked_new: out.linked_new.length, updated: out.updated, created_by: userId || null, created_at: now });
  return out;
}

// A member got a DUPR ID (from the Host, or from the player's profile): when the club's DUPR
// list already has it, link right away — no waiting for the next file.
async function attachFromRoster(club, memberId) {
  const { data: m } = await supabase.from('club_members').select('id, dupr_id, dupr_synced_at, dupr_verified_at, dupr_doubles, dupr_singles').eq('id', memberId).maybeSingle();
  if (!m?.dupr_id) return null;
  // The newest rating for this ID (this club's DUPR list or another's), dated when DUPR gave it.
  const best = (await latestRatings([m.dupr_id])).get(m.dupr_id);
  if (!best) return null;
  return linkRow(club, m, { dupr_id: m.dupr_id, ...best }, best.at || new Date().toISOString());
}

const CLEARED = { dupr_name: null, dupr_doubles: null, dupr_doubles_rel: null, dupr_singles: null, dupr_singles_rel: null, dupr_synced_at: null, dupr_verified_at: null };

// Host types a member's DUPR rating by hand (a player not in the club on DUPR: the Host reads it
// in the DUPR app). It becomes the member's level, like an imported one. The next DUPR file
// import that has this member replaces it. Empty = clear.
async function setMemberScore(club, memberId, body = {}) {
  const rating = (v, name) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1 || n > 8) throw httpError(`${name} must be 1.000–8.000.`, 400, 'bad_rating');
    return Math.round(n * 1000) / 1000;
  };
  const doubles = rating(body.doubles, 'Doubles');
  const singles = rating(body.singles, 'Singles');
  let rel = body.doubles_rel === '' || body.doubles_rel == null ? null : Number(body.doubles_rel);
  if (rel != null && !(Number.isInteger(rel) && rel >= 0 && rel <= 100)) throw httpError('Reliability must be 0–100.', 400, 'bad_rel');
  if (doubles == null) rel = null;
  const { data: cur } = await supabase.from('club_members').select('id, dupr_synced_at').eq('id', memberId).eq('club_id', club.id).maybeSingle();
  if (!cur) throw httpError('Member not found.', 404, 'not_found');
  if (cur.dupr_synced_at) throw httpError('This member is linked to the club DUPR list: the rating comes from the DUPR file.', 409, 'linked');
  const patch = { dupr_doubles: doubles, dupr_doubles_rel: rel, dupr_singles: singles, ...(doubles != null ? { dupr_level: Math.min(8, Math.round(doubles * 100) / 100) } : {}) };
  const { error } = await supabase.from('club_members').update(patch).eq('id', memberId);
  if (error) throw error;
  const { data } = await supabase.from('club_members').select('*').eq('id', memberId).single();
  return data;
}

// Host sets / clears a member's DUPR ID by hand.
async function setMemberId(club, memberId, raw) {
  const id = cleanId(raw);
  if (id) {
    const { data: other } = await supabase.from('club_members').select('id, full_name').eq('club_id', club.id).eq('dupr_id', id).neq('id', memberId).maybeSingle();
    if (other) throw httpError(`DUPR ID ${id} already belongs to ${other.full_name}.`, 409, 'taken');
  }
  const { data: cur } = await supabase.from('club_members').select('dupr_id').eq('id', memberId).eq('club_id', club.id).maybeSingle();
  if (!cur) throw httpError('Member not found.', 404, 'not_found');
  const patch = id ? (cur.dupr_id === id ? { dupr_id: id } : { dupr_id: id, ...CLEARED }) : { dupr_id: null, ...CLEARED };
  const { error } = await supabase.from('club_members').update(patch).eq('id', memberId);
  if (error) throw error;
  if (id) await attachFromRoster(club, memberId);
  const { data } = await supabase.from('club_members').select('*').eq('id', memberId).single();
  return data;
}

// The player saved a DUPR ID in their profile: put it on their pickleball club records that have
// none (or still carry the old one from the profile) and link where the club's DUPR list has it.
// An ID already used by someone else in a club is left alone there (`skipped`).
async function applyProfileId(userId, oldId, newId) {
  const { data: mine } = await supabase.from('club_members').select('id, club_id, dupr_id, clubs(id, sport)').eq('user_id', userId);
  const skipped = [];
  for (const m of mine || []) {
    const club = m.clubs;
    if (!club || (club.sport || 'pickleball') !== 'pickleball') continue;
    if (m.dupr_id && m.dupr_id !== oldId) continue; // the Host's own entry wins
    if (m.dupr_id === newId) {
      if (newId) await attachFromRoster(club, m.id);
      continue;
    }
    if (newId) {
      const { data: other } = await supabase.from('club_members').select('id').eq('club_id', club.id).eq('dupr_id', newId).neq('id', m.id).maybeSingle();
      if (other) {
        skipped.push(club.id);
        continue;
      }
    }
    const { error } = await supabase.from('club_members').update(newId ? { dupr_id: newId, ...CLEARED } : { dupr_id: null, ...CLEARED }).eq('id', m.id);
    if (error) throw error;
    if (newId) await attachFromRoster(club, m.id);
  }
  return { skipped };
}

// The DUPR tab of the members page: every member with their ID, ratings, last change and status,
// plus the DUPR Club members nobody in the club has claimed yet.
async function memberBoard(club) {
  let members = await clubMembers(club);
  // Someone whose ID is on the club's DUPR list but not linked yet (e.g. joined the club after
  // typing the ID in their profile): link now.
  const { data: roster0 } = await supabase.from('club_dupr_roster').select('dupr_id, name, doubles, doubles_rel, singles, singles_rel').eq('club_id', club.id);
  const rosterById = new Map((roster0 || []).map((r) => [r.dupr_id, { ...r, doubles: num(r.doubles), singles: num(r.singles) }]));
  const claimCount = new Map();
  for (const m of members) if (m.claimed) claimCount.set(m.claimed, (claimCount.get(m.claimed) || 0) + 1);
  // Also anyone whose ID got a rating in another club / community's DUPR file.
  const shared = await latestRatings(members.filter((m) => m.claimed && claimCount.get(m.claimed) === 1).map((m) => m.claimed));
  const heal = members.filter((m) => m.claimed && claimCount.get(m.claimed) === 1 && (rosterById.has(m.claimed) || shared.has(m.claimed)) && (!m.dupr_synced_at || newer(shared.get(m.claimed)?.at, m.dupr_synced_at)));
  if (heal.length) {
    const now = new Date().toISOString();
    for (const m of heal) {
      const best = shared.get(m.claimed);
      await linkRow(club, m, best ? { dupr_id: m.claimed, ...best } : rosterById.get(m.claimed), best?.at || now);
    }
    members = await clubMembers(club);
  }
  const ids = members.map((m) => m.id);
  const { data: hist } = ids.length ? await supabase.from('dupr_rating_history').select('club_member_id, doubles, singles, recorded_at').in('club_member_id', ids).order('recorded_at', { ascending: true }) : { data: [] };
  const byMember = new Map();
  for (const h of hist || []) byMember.set(h.club_member_id, [...(byMember.get(h.club_member_id) || []), h]);
  const { data: roster } = await supabase.from('club_dupr_roster').select('dupr_id, name, doubles, singles, first_seen_at').eq('club_id', club.id);
  const rosterIds = new Set((roster || []).map((r) => r.dupr_id));
  const claimed = new Set(members.map((m) => m.claimed).filter(Boolean));
  const counts = new Map();
  for (const m of members) if (m.claimed) counts.set(m.claimed, (counts.get(m.claimed) || 0) + 1);
  const list = members.map((m) => {
    const h = byMember.get(m.id) || [];
    const prev = h.length > 1 ? h[h.length - 2] : null;
    const linked = !!(m.dupr_id && m.dupr_synced_at);
    // 'manual': not on the club's DUPR list, the Host typed the rating (seen in the DUPR app).
    const manual = !linked && m.dupr_doubles != null;
    const status = m.claimed && counts.get(m.claimed) > 1 ? 'conflict' : linked ? 'linked' : manual ? 'manual' : !m.claimed ? 'none' : 'not_in_club';
    return {
      id: m.id,
      full_name: m.full_name,
      member_type: m.member_type,
      is_active: m.is_active,
      dupr_id: m.claimed,
      from_profile: !m.dupr_id && !!m.claimed,
      dupr_name: m.dupr_name,
      name_fits: m.dupr_name ? nameFits(m.dupr_name, m.full_name) : null,
      doubles: num(m.dupr_doubles),
      doubles_rel: m.dupr_doubles_rel,
      singles: num(m.dupr_singles),
      singles_rel: m.dupr_singles_rel,
      synced_at: m.dupr_synced_at,
      self_level: m.dupr_level == null ? null : Number(m.dupr_level), // level on the member / player profile (self-rated)
      change: prev && m.dupr_doubles != null && prev.doubles != null ? Math.round((Number(m.dupr_doubles) - Number(prev.doubles)) * 1000) / 1000 : null,
      status,
    };
  });
  const { data: last } = await supabase.from('club_dupr_imports').select('rows_total, duplicates, new_ids, linked_new, updated, created_at').eq('club_id', club.id).order('created_at', { ascending: false }).limit(1);
  return {
    members: list,
    quick: await quickPlayers(club).catch(() => []),
    unclaimed: (roster || []).filter((r) => !claimed.has(r.dupr_id)).map((r) => ({ dupr_id: r.dupr_id, name: r.name, doubles: num(r.doubles), singles: num(r.singles), first_seen_at: r.first_seen_at })).sort((a, b) => String(b.first_seen_at).localeCompare(String(a.first_seen_at)) || String(a.name).localeCompare(String(b.name))),
    roster_size: (roster || []).length,
    last_import: last?.[0] || null,
  };
}

// Players of the club's kèo without an account and not on the member list (đặt nhanh /
// Host thêm): one row per name + DUPR ID, with the rating that DUPR ID has anywhere.
async function quickPlayers(club) {
  const groups = await require('./memberLink').guestCandidates(club);
  const rated = await latestRatings(groups.map((g) => g.dupr_id));
  return groups.map((g) => {
    const r = g.dupr_id ? rated.get(g.dupr_id) : null;
    return {
      key: g.key,
      ids: g.ids,
      full_name: g.full_name,
      gender: g.gender,
      count: g.count,
      last_date: g.last_date,
      dupr_id: g.dupr_id,
      dupr_name: r?.name || null,
      doubles: r?.doubles ?? null,
      doubles_rel: r?.doubles_rel ?? null,
      singles: r?.singles ?? null,
      synced_at: r?.at || null,
    };
  });
}

// The Host types the DUPR ID of a quick-booking player: it goes on all their kèo rows, so
// their matches can be sent to DUPR and the rating that ID has shows up.
async function setQuickId(club, ids, raw) {
  const id = cleanId(raw);
  const list = (Array.isArray(ids) ? ids : []).filter((x) => /^[0-9a-f-]{36}$/i.test(String(x))).slice(0, 500);
  if (!list.length) throw httpError('Pick the player.', 400, 'target_required');
  const { data: rows, error } = await supabase.from('event_participants').select('id, events!inner(club_id)').in('id', list).eq('events.club_id', club.id).is('user_id', null);
  if (error) throw error;
  if (!rows?.length) throw httpError('Player not found.', 404, 'not_found');
  const { error: uErr } = await supabase.from('event_participants').update({ dupr_id: id }).in('id', rows.map((r) => r.id));
  if (uErr) throw uErr;
  return { updated: rows.length, dupr_id: id };
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

// Every match of the club (scored or not): club matches, matches inside its events (kèo,
// sessions, meetings), tournament matches (pairs) and team-league sub-matches.
// opts: { from, to } dates, { event } one event only, { tournament } one tournament only,
// { clubOnly } the club's own matches (outside events and tournaments), { all } include
// matches already sent to DUPR.
async function clubMatches(club, opts = {}) {
  const from = opts.from || '2000-01-01';
  const to = opts.to || '2999-12-31';
  const includeExported = !!opts.all;
  const members = new Map();
  const memberIds = new Set();
  const out = [];

  // 1. Club matches and event matches.
  let ms = [];
  let evById = new Map();
  if (!opts.tournament) {
    let eq = supabase.from('events').select('id, title, location, event_date').eq('club_id', club.id);
    eq = opts.event ? eq.eq('id', opts.event) : eq.gte('event_date', from).lte('event_date', to);
    const { data: evs } = opts.clubOnly ? { data: [] } : await eq;
    evById = new Map((evs || []).map((e) => [e.id, e]));
    if (opts.event && !evById.size) throw httpError('Event not found.', 404, 'not_found');
    const ors = opts.event ? [] : [`club_id.eq.${club.id}`];
    if (evById.size) ors.push(`event_id.in.(${[...evById.keys()].join(',')})`);
    const { data, error } = await supabase.from('matches').select('id, club_id, event_id, match_type, played_at, created_at, team1_score, team2_score, games, dupr_exported_at').or(ors.join(',')).limit(5000);
    if (error) throw error;
    ms = data || [];
  }
  const inRange = ms.filter((m) => {
    const day = m.event_id && evById.get(m.event_id) ? evById.get(m.event_id).event_date : ymdOf(m.played_at || m.created_at);
    return day && day >= from && day <= to && (includeExported || !m.dupr_exported_at);
  });
  const { data: mps } = inRange.length ? await supabase.from('match_players').select('match_id, team, club_member_id, event_participant_id').in('match_id', inRange.map((m) => m.id)) : { data: [] };
  const partIds = [...new Set((mps || []).map((p) => p.event_participant_id).filter(Boolean))];
  let { data: parts, error: partErr } = partIds.length ? await supabase.from('event_participants').select('id, full_name, user_id, source_club_member_id, guest_member_id, dupr_id').in('id', partIds) : { data: [] };
  if (partErr) ({ data: parts } = await supabase.from('event_participants').select('id, full_name, user_id, source_club_member_id, guest_member_id').in('id', partIds)); // before 20261130090000_dupr_shared.sql
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
          // A quick booking (no account) may carry the DUPR ID the player typed.
          return { member_id: mid, part_id: mid || part?.user_id ? null : p.event_participant_id, name: part?.full_name || '?', user_id: part?.user_id || null, dupr_id: part?.dupr_id || null };
        });
    out.push({ kind: 'match', source: ev ? 'event' : 'club', id: m.id, date: ev?.event_date || ymdOf(m.played_at), event: ev?.title || null, location: ev?.location || null, a: team(1), b: team(2), games: gamesOf(m), exported_at: m.dupr_exported_at });
  }

  // 2. Tournaments of the club.
  let tq = supabase.from('tournaments').select('id, name, kind, event_date, location').eq('club_id', club.id);
  if (opts.tournament) tq = tq.eq('id', opts.tournament);
  const { data: tours } = opts.event || opts.clubOnly ? { data: [] } : await tq;
  if (opts.tournament && !(tours || []).length) throw httpError('Tournament not found.', 404, 'not_found');
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
      out.push({ kind: 'tournament', source: 'tournament', id: m.id, date: day, event: t.name, location: t.location, a: pl(t1.player1_id, t1.player2_id), b: pl(t2.player1_id, t2.player2_id), games: gamesOf(m), scoring: scoringOf(m.id, null), exported_at: m.dupr_exported_at });
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
        out.push({ kind: 'sub', source: 'tournament', id: s.id, date: day, event: t.name, location: t.location, a: pl(s.team1_p1, s.team1_p2), b: pl(s.team2_p1, s.team2_p2), games: gamesOf(s), scoring: scoringOf(f.id, s.id), exported_at: s.dupr_exported_at });
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
      part_id: p.part_id || null, // a quick-booking row (no account, no member): its DUPR ID is set on the row
      name: m?.full_name || p.name || '?',
      dupr_id: m?.dupr_id || profId.get(m?.user_id || p.user_id) || p.dupr_id || null,
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
        source: x.source,
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
// allowMissing: also scored matches where someone has no DUPR ID (their ID cell stays
// empty) — the Host chose to download anyway.
function matchesCsv(club, list, defaultScoring = 'SIDEOUT', allowMissing = false) {
  const rows = [TEMPLATE];
  for (const m of list.filter((x) => x.ready || (allowMissing && !x.no_score))) {
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

// Members the Host can put in someone's place (name + DUPR ID only).
async function replaceCandidates(club) {
  const list = await clubMembers(club);
  return list
    .filter((m) => m.is_active !== false)
    .map((m) => ({ id: m.id, full_name: m.full_name, dupr_id: m.claimed }))
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'vi'));
}

// "Thay người": someone cannot get a DUPR account, so the Host puts another member in their
// place in every match of `scope` that is not sent yet and not waiting in a lượt tải — the
// other three players' matches can then go to DUPR. Sent matches are never touched.
// from: { member_id } or { part_id } (a quick-booking row); to: a club member id.
async function replacePlayer(club, from, toMemberId, scope = {}) {
  const fromMember = from?.member_id || null;
  const fromPart = from?.part_id || null;
  if (!fromMember && !fromPart) throw httpError('Chọn người cần thay.', 400, 'bad_from');
  if (fromMember && fromMember === toMemberId) throw httpError('Hai người phải khác nhau.', 400, 'same_person');
  const { data: to } = await supabase.from('club_members').select('id, full_name').eq('club_id', club.id).eq('id', toMemberId).maybeSingle();
  if (!to) throw httpError('Không tìm thấy thành viên này trong CLB.', 404, 'not_found');
  const list = await withBatches(club, await clubMatches(club, scope));
  const hits = (p) => (fromMember ? p.member_id === fromMember : p.part_id === fromPart);
  const todo = list.filter((m) => !m.exported_at && !m.batch && [...m.a, ...m.b].some(hits));
  const name = [...todo.flatMap((m) => [...m.a, ...m.b])].find(hits)?.name || null;
  let replaced = 0;
  const skipped = { already_in: 0, team_sent: 0 };
  // Club / event matches: the match_players rows of that person.
  const ms = todo.filter((m) => m.kind === 'match');
  if (ms.length) {
    const { data: rows } = await supabase.from('match_players').select('id, match_id, club_member_id, event_participant_id').in('match_id', ms.map((m) => m.id));
    const pids = [...new Set((rows || []).map((r) => r.event_participant_id).filter(Boolean))];
    const { data: parts } = pids.length ? await supabase.from('event_participants').select('id, source_club_member_id, guest_member_id').in('id', pids) : { data: [] };
    const memberOfPart = new Map((parts || []).map((p) => [p.id, p.source_club_member_id || p.guest_member_id || null]));
    const who = (r) => r.club_member_id || memberOfPart.get(r.event_participant_id) || null;
    for (const m of ms) {
      const mine = (rows || []).filter((r) => r.match_id === m.id);
      if (mine.some((r) => who(r) === to.id)) {
        skipped.already_in += 1;
        continue;
      }
      const target = mine.filter((r) => (fromMember ? who(r) === fromMember : r.event_participant_id === fromPart));
      for (const r of target) {
        const { error } = await supabase.from('match_players').update({ club_member_id: to.id, event_participant_id: null }).eq('id', r.id);
        if (error) throw error;
      }
      if (target.length) replaced += 1;
    }
  }
  // League sub-matches: the player columns of that row.
  for (const m of todo.filter((x) => x.kind === 'sub')) {
    const ids = [...m.a, ...m.b].map((p) => p.member_id);
    if (ids.includes(to.id)) {
      skipped.already_in += 1;
      continue;
    }
    const { data: s } = await supabase.from('tournament_sub_matches').select('team1_p1, team1_p2, team2_p1, team2_p2').eq('id', m.id).single();
    const patch = {};
    for (const c of ['team1_p1', 'team1_p2', 'team2_p1', 'team2_p2']) if (s && s[c] === fromMember) patch[c] = to.id;
    if (!Object.keys(patch).length) continue;
    const { error } = await supabase.from('tournament_sub_matches').update(patch).eq('id', m.id).is('dupr_exported_at', null);
    if (error) throw error;
    replaced += 1;
  }
  // Tournament pairs: the player sits on a team, which every match of that team shares — the
  // team changes only when none of its matches was sent yet (else history would change).
  const tms = todo.filter((x) => x.kind === 'tournament');
  if (tms.length && fromMember) {
    const { data: tm } = await supabase.from('tournament_matches').select('id, tournament_id, team1_id, team2_id').in('id', tms.map((m) => m.id));
    const teamIds = [...new Set((tm || []).flatMap((x) => [x.team1_id, x.team2_id]).filter(Boolean))];
    const { data: teams } = teamIds.length ? await supabase.from('tournament_teams').select('id, player1_id, player2_id').in('id', teamIds) : { data: [] };
    const done = new Set();
    for (const t of (teams || []).filter((x) => x.player1_id === fromMember || x.player2_id === fromMember)) {
      if (t.player1_id === to.id || t.player2_id === to.id) {
        skipped.already_in += 1;
        continue;
      }
      const { count } = await supabase.from('tournament_matches').select('id', { count: 'exact', head: true }).or(`team1_id.eq.${t.id},team2_id.eq.${t.id}`).not('dupr_exported_at', 'is', null);
      if (count) {
        skipped.team_sent += 1;
        continue;
      }
      const patch = t.player1_id === fromMember ? { player1_id: to.id } : { player2_id: to.id };
      const { error } = await supabase.from('tournament_teams').update(patch).eq('id', t.id);
      if (error) throw error;
      done.add(t.id);
    }
    replaced += (tm || []).filter((x) => done.has(x.team1_id) || done.has(x.team2_id)).length;
  }
  return { replaced, skipped, from_name: name, to_name: to.full_name };
}

const TABLE = { match: 'matches', tournament: 'tournament_matches', sub: 'tournament_sub_matches' };
async function markExported(club, items, exported, { keepBatches = false } = {}) {
  const list = await clubMatches(club, { all: true });
  const allowed = new Set(list.map((m) => `${m.kind}:${m.id}`));
  let n = 0;
  for (const kind of Object.keys(TABLE)) {
    const ids = (items || []).filter((i) => i?.kind === kind && allowed.has(`${kind}:${i.id}`)).map((i) => i.id);
    if (!ids.length) continue;
    const { error } = await supabase.from(TABLE[kind]).update({ dupr_exported_at: exported ? new Date().toISOString() : null }).in('id', ids);
    if (error) throw error;
    n += ids.length;
  }
  // "Hoàn tác trận này": the match leaves its confirmed lượt tải too, so that lượt's count
  // and "Tải lại file" only cover what is still sent (a lượt left empty is cancelled).
  if (!exported && n && !keepBatches && (await batchesReady())) {
    const back = new Set(cleanItems(items).map(itemKey));
    const { data: done } = await supabase.from('dupr_export_batches').select('id, items').eq('club_id', club.id).eq('status', 'confirmed');
    for (const b of done || []) {
      const keep = cleanItems(b.items).filter((i) => !back.has(itemKey(i)));
      if (keep.length === cleanItems(b.items).length) continue;
      const patch = keep.length ? { items: keep, match_count: keep.length } : { items: keep, match_count: 0, status: 'cancelled' };
      const { error } = await supabase.from('dupr_export_batches').update(patch).eq('id', b.id);
      if (error) throw error;
    }
  }
  return { updated: n };
}

// ---- lượt tải: every CSV download kept on the server -----------------------------------
// A download makes a pending lượt tải; the Host then confirms it ("Đã tải lên DUPR": its
// matches become sent) or cancels it (they go back to waiting). Matches in a pending lượt
// tải are not put in a new file, so nothing reaches DUPR twice even after a page reload or
// on another device. Without the migration (20261221090000) downloads work as before.
const BATCH_MIGRATION = '20261221090000_dupr_export_batches.sql';
let batchCache = null;
async function batchesReady() {
  if (batchCache && Date.now() - batchCache.at < 60000) return batchCache.ok;
  const { error } = await supabase.from('dupr_export_batches').select('id').limit(1);
  batchCache = { ok: !error, at: Date.now() };
  return batchCache.ok;
}
const itemKey = (i) => `${i?.kind}:${i?.id}`;
const cleanItems = (items) => (Array.isArray(items) ? items : []).filter((i) => TABLE[i?.kind] && /^[0-9a-f-]{36}$/i.test(String(i?.id || ''))).map((i) => ({ kind: i.kind, id: i.id }));

async function pendingBatches(club) {
  if (!(await batchesReady())) return [];
  const { data, error } = await supabase.from('dupr_export_batches').select('*').eq('club_id', club.id).eq('status', 'pending').order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return data || [];
}

// Each match gets `batch` = { id, created_at } of the pending lượt tải it is in (or null).
async function withBatches(club, list) {
  const pending = await pendingBatches(club);
  const where = new Map();
  for (const b of pending) for (const i of b.items || []) where.set(itemKey(i), { id: b.id, created_at: b.created_at });
  return list.map((m) => ({ ...m, batch: m.exported_at ? null : where.get(itemKey(m)) || null }));
}

async function createBatch(club, userId, list, { scoreType = 'SIDEOUT', fileName = null } = {}) {
  if (!(await batchesReady()) || !list.length) return null;
  const { data, error } = await supabase
    .from('dupr_export_batches')
    .insert({
      club_id: club.id,
      created_by: userId || null,
      items: list.map((m) => ({ kind: m.kind, id: m.id })),
      match_count: list.length,
      with_missing: list.filter((m) => !m.ready).length,
      score_type: scoreType === 'RALLY' ? 'RALLY' : 'SIDEOUT',
      file_name: fileName ? String(fileName).slice(0, 120) : null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// The club's lượt tải: every pending one and the latest decided ones.
async function listBatches(club, { limit = 10 } = {}) {
  if (!(await batchesReady())) throw httpError(`Run migration ${BATCH_MIGRATION} first.`, 409, 'migration_required');
  const pending = await pendingBatches(club);
  const { data, error } = await supabase.from('dupr_export_batches').select('*').eq('club_id', club.id).neq('status', 'pending').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return [...pending.reverse(), ...(data || [])].map((b) => ({ id: b.id, status: b.status, created_at: b.created_at, decided_at: b.decided_at, count: b.match_count, with_missing: b.with_missing, score_type: b.score_type, file_name: b.file_name, items: b.items || [] }));
}

async function getBatch(club, id) {
  if (!(await batchesReady())) throw httpError(`Run migration ${BATCH_MIGRATION} first.`, 409, 'migration_required');
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw httpError('Not found.', 404, 'not_found');
  const { data } = await supabase.from('dupr_export_batches').select('*').eq('id', id).eq('club_id', club.id).maybeSingle();
  if (!data) throw httpError('Not found.', 404, 'not_found');
  return data;
}

// The same file again, for any lượt tải (also one already confirmed or cancelled — the Host
// may have lost the file): its matches as they are now.
async function batchCsv(club, id) {
  const b = await getBatch(club, id);
  const want = new Set((b.items || []).map(itemKey));
  const list = (await clubMatches(club, { all: true })).filter((m) => want.has(itemKey(m)) && !m.no_score);
  return { csv: matchesCsv(club, list, b.score_type, true), count: list.length, file_name: b.file_name };
}

// confirm: the file was uploaded to DUPR → its matches are sent. cancel: it was not → they
// wait again.
async function decideBatch(club, id, action, userId) {
  const b = await getBatch(club, id);
  if (b.status !== 'pending') throw httpError('This download was already confirmed or cancelled.', 409, 'batch_closed');
  if (action === 'confirm') await markExported(club, cleanItems(b.items), true);
  const { error } = await supabase
    .from('dupr_export_batches')
    .update({ status: action === 'confirm' ? 'confirmed' : 'cancelled', decided_at: new Date().toISOString(), decided_by: userId || null })
    .eq('id', b.id)
    .eq('status', 'pending');
  if (error) throw error;
  return { id: b.id, status: action === 'confirm' ? 'confirmed' : 'cancelled', count: b.match_count };
}

// Undo a decision made by mistake: the lượt tải goes back to "chờ xác nhận".
// - confirmed, but the file never reached DUPR → its matches are no longer "đã gửi";
// - cancelled, but the file was uploaded after all → its matches wait in it again.
// Refused when one of its matches is now in another pending lượt tải (or, for a cancelled
// one, was sent since) — reopening would let the same match reach DUPR twice.
async function reopenBatch(club, id, userId) {
  const b = await getBatch(club, id);
  if (b.status === 'pending') return { id: b.id, status: 'pending', count: b.match_count };
  const items = cleanItems(b.items);
  const mine = new Set(items.map(itemKey));
  const others = (await pendingBatches(club)).filter((x) => x.id !== b.id);
  const clash = others.flatMap((x) => (x.items || []).map(itemKey)).filter((k) => mine.has(k));
  if (b.status === 'cancelled') {
    const sent = (await clubMatches(club, { all: true })).filter((m) => mine.has(itemKey(m)) && m.exported_at);
    clash.push(...sent.map(itemKey));
  }
  if (clash.length) throw Object.assign(httpError('Some of these matches are in another download or were sent since.', 409, 'batch_conflict'), { count: new Set(clash).size });
  if (b.status === 'confirmed') await markExported(club, items, false, { keepBatches: true });
  const { error } = await supabase
    .from('dupr_export_batches')
    .update({ status: 'pending', decided_at: null, decided_by: userId || null })
    .eq('id', b.id)
    .eq('status', b.status);
  if (error) throw error;
  return { id: b.id, status: 'pending', count: b.match_count, was: b.status };
}

// ---- statistics (the DUPR page under Thống kê) ------------------------------------------
const round3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const monthsAgo = (n) => {
  const d = new Date(Date.now() + 7 * 3600000);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};

// Ratings of linked members over the period (start → now, last change, trend points), and the
// club's matches of the period: sent to DUPR, ready to send, blocked (who lacks an ID), no score.
async function stats(club, { months = 3 } = {}) {
  const from = monthsAgo(months);
  const startIso = `${from}T00:00:00+07:00`;
  const { data: mem, error } = await supabase
    .from('club_members')
    .select('id, full_name, is_active, dupr_id, dupr_doubles, dupr_doubles_rel, dupr_singles, dupr_synced_at')
    .eq('club_id', club.id);
  if (error) throw error;
  const linked = (mem || []).filter((m) => m.dupr_id && m.dupr_synced_at);
  const ids = linked.map((m) => m.id);
  const { data: hist } = ids.length ? await supabase.from('dupr_rating_history').select('club_member_id, doubles, singles, recorded_at').in('club_member_id', ids).order('recorded_at', { ascending: true }) : { data: [] };
  const byMember = new Map();
  for (const h of hist || []) byMember.set(h.club_member_id, [...(byMember.get(h.club_member_id) || []), h]);
  const players = linked.map((m) => {
    const h = byMember.get(m.id) || [];
    const before = h.filter((x) => x.recorded_at < startIso);
    const inside = h.filter((x) => x.recorded_at >= startIso);
    const base = (before.length ? before[before.length - 1] : inside[0]) || null; // rating at the start of the period
    const now = num(m.dupr_doubles);
    const prev = h.length > 1 ? num(h[h.length - 2].doubles) : null;
    return {
      member_id: m.id,
      full_name: m.full_name,
      dupr_id: m.dupr_id,
      doubles: now,
      doubles_rel: m.dupr_doubles_rel,
      singles: num(m.dupr_singles),
      start: base ? num(base.doubles) : null,
      change: base && now != null && base.doubles != null ? round3(now - Number(base.doubles)) : null,
      last_change: prev != null && now != null ? round3(now - prev) : null,
      points: [...(base && before.length ? [base] : []), ...inside].map((x) => ({ date: ymdOf(x.recorded_at), doubles: num(x.doubles), singles: num(x.singles) })),
    };
  });
  const rated = players.filter((p) => p.doubles != null);
  const { data: imports } = await supabase.from('club_dupr_imports').select('rows_total, duplicates, new_ids, linked_new, updated, created_at').eq('club_id', club.id).order('created_at', { ascending: false }).limit(12);

  const list = await clubMatches(club, { from, all: true });
  const scored = list.filter((m) => !m.no_score);
  const block = new Map();
  for (const m of scored) if (!m.exported_at && !m.ready) for (const n of m.missing) block.set(n, (block.get(n) || 0) + 1);
  const bucket = (arr) => ({
    total: arr.length,
    exported: arr.filter((m) => m.exported_at).length,
    ready: arr.filter((m) => !m.exported_at && m.ready).length,
    blocked: arr.filter((m) => !m.exported_at && !m.ready && !m.no_score).length,
    no_score: arr.filter((m) => m.no_score).length,
  });
  const byMonth = {};
  for (const m of list) (byMonth[String(m.date).slice(0, 7)] = byMonth[String(m.date).slice(0, 7)] || []).push(m);
  return {
    months,
    from,
    members: { total: (mem || []).length, linked: linked.length, with_id: (mem || []).filter((m) => m.dupr_id).length },
    ratings: {
      avg_doubles: rated.length ? round3(rated.reduce((s2, p) => s2 + p.doubles, 0) / rated.length) : null,
      up: players.filter((p) => p.change > 0).length,
      down: players.filter((p) => p.change < 0).length,
      same: players.filter((p) => p.change === 0).length,
    },
    players: players.sort((a, b) => (b.change ?? -99) - (a.change ?? -99) || (b.doubles ?? 0) - (a.doubles ?? 0)),
    imports: imports || [],
    matches: {
      ...bucket(list),
      by_source: Object.fromEntries(['event', 'club', 'tournament'].map((k) => [k, bucket(list.filter((m) => m.source === k))])),
      by_month: Object.keys(byMonth).sort().map((k) => ({ month: k, ...bucket(byMonth[k]) })),
      blockers: [...block.entries()].map(([name, n]) => ({ name, matches: n })).sort((a, b) => b.matches - a.matches).slice(0, 10),
    },
  };
}

// ---- the player's own DUPR (player pages) ------------------------------------------------
// The newest ratings any of their clubs imported, and the history across clubs.
async function playerDupr(userId) {
  const { data: prof } = await supabase.from('player_profiles').select('dupr_id').eq('user_id', userId).maybeSingle();
  const { data: mine } = await supabase.from('club_members').select('id, dupr_id, dupr_name, dupr_doubles, dupr_doubles_rel, dupr_singles, dupr_singles_rel, dupr_synced_at').eq('user_id', userId);
  const synced = (mine || []).filter((m) => m.dupr_id && m.dupr_synced_at).sort((a, b) => String(b.dupr_synced_at).localeCompare(String(a.dupr_synced_at)));
  const top = synced[0] || null;
  const dupr_id = prof?.dupr_id || top?.dupr_id || null;
  if (!top) return { dupr_id, linked: false };
  const ids = synced.filter((m) => m.dupr_id === top.dupr_id).map((m) => m.id);
  const { data: hist } = await supabase.from('dupr_rating_history').select('doubles, singles, recorded_at').in('club_member_id', ids).order('recorded_at', { ascending: true }).limit(500);
  const history = [];
  for (const h of hist || []) {
    const pt = { date: ymdOf(h.recorded_at), doubles: num(h.doubles), singles: num(h.singles) };
    const last = history[history.length - 1];
    if (last && last.doubles === pt.doubles && last.singles === pt.singles) continue; // same rating seen by another club
    history.push(pt);
  }
  const prev = history.length > 1 ? history[history.length - 2] : null;
  return {
    dupr_id: top.dupr_id,
    linked: true,
    dupr_name: top.dupr_name,
    doubles: num(top.dupr_doubles),
    doubles_rel: top.dupr_doubles_rel,
    singles: num(top.dupr_singles),
    singles_rel: top.dupr_singles_rel,
    synced_at: top.dupr_synced_at,
    doubles_change: prev && prev.doubles != null && top.dupr_doubles != null ? round3(Number(top.dupr_doubles) - prev.doubles) : null,
    singles_change: prev && prev.singles != null && top.dupr_singles != null ? round3(Number(top.dupr_singles) - prev.singles) : null,
    history: history.slice(-50),
  };
}

module.exports = {
  latestRatings,
  setMemberScore, MIGRATION, ready, cleanId, parseCsv, parseMembersCsv, nameFits, importRoster, attachFromRoster, setMemberId, applyProfileId, memberBoard, quickPlayers, setQuickId, clubMatches, matchesCsv, markExported, replaceCandidates, replacePlayer, stats, batchesReady, withBatches, createBatch, listBatches, batchCsv, decideBatch, reopenBatch, cleanItems, BATCH_MIGRATION, playerDupr, TEMPLATE };
