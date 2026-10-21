// Kèo with several time groups (VD thứ 7: 17h–20h 120k/slot on sân 3, 18h–20h 100k/slot on
// sân 2): each group has its own hours, fee, places and courts; a player picks one when
// signing up. Court numbers ("sân số") and the Host's court assignment per player.
const { supabase } = require('../supabase');
const { HOLDS_PLACE } = require('./fees');

const MIGRATION = '20261211090000_event_groups_courts.sql';
const MAX_GROUPS = 12; // one group per court at most (courtList keeps 12)

async function ready() {
  const s = await require('./schemaCheck').schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

// "3" / "2, 3" / "Sân 2 - 3": the court numbers, one label each (at most 12).
function courtList(raw) {
  return [...new Set(String(raw || '').split(/[,;/\s-]+/).map((x) => x.replace(/^sân/i, '').trim()).filter(Boolean))]
    .map((x) => x.slice(0, 20))
    .slice(0, 12);
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const hm = (v) => String(v || '').slice(0, 5);

// The groups as saved on the event (empty = one group, the event itself).
function groupsOf(event) {
  return Array.isArray(event?.groups) ? event.groups.filter((g) => g && g.id) : [];
}
function groupOf(event, id) {
  return groupsOf(event).find((g) => g.id === id) || null;
}
// The event as one group sees it: its hours, fee, places and courts.
function forGroup(event, group) {
  if (!group) return event;
  return { ...event, start_time: group.start_time, end_time: group.end_time, fee_amount: group.fee_amount, slots: group.slots, court_labels: group.courts || null };
}

// Check the groups the Host typed; returns { groups, derived } or { error }.
// derived = what the event row carries for everything else: total places, the earliest
// start, the latest end, the lowest fee, every court.
function cleanGroups(raw) {
  if (raw == null || (Array.isArray(raw) && raw.length === 0)) return { groups: null, derived: {} };
  if (!Array.isArray(raw)) return { error: 'groups must be a list.' };
  if (raw.length < 2) return { groups: null, derived: {} }; // one group = the event itself
  if (raw.length > MAX_GROUPS) return { error: `At most ${MAX_GROUPS} groups.` };
  const used = new Set();
  const groups = [];
  for (const [i, g] of raw.entries()) {
    const start = hm(g?.start_time);
    const end = hm(g?.end_time);
    if (!HM.test(start) || !HM.test(end) || end <= start) return { error: `Group ${i + 1}: start and end time (end after start).` };
    const fee = Number(g?.fee_amount ?? 0);
    if (!(Number.isFinite(fee) && fee >= 0 && fee <= 100000000)) return { error: `Group ${i + 1}: fee must be 0 or more.` };
    const slots = Number(g?.slots);
    if (!(Number.isInteger(slots) && slots >= 1 && slots <= 500)) return { error: `Group ${i + 1}: places must be 1-500.` };
    let id = String(g?.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || `g${i + 1}`;
    while (used.has(id)) id = `${id}x`.slice(-20);
    used.add(id);
    // What the court plays (Full nam / Full nữ / Mix), shown to players; null = not said.
    const play_format = ['men', 'women', 'mixed'].includes(g?.play_format) ? g.play_format : null;
    groups.push({ id, start_time: start, end_time: end, fee_amount: Math.round(fee), slots, courts: courtList(g?.courts).join(', ') || null, play_format });
  }
  const courts = [...new Set(groups.flatMap((g) => courtList(g.courts)))];
  return {
    groups,
    derived: {
      slots: groups.reduce((n, g) => n + g.slots, 0),
      start_time: groups.map((g) => g.start_time).sort()[0],
      end_time: groups.map((g) => g.end_time).sort().reverse()[0],
      fee_amount: Math.min(...groups.map((g) => g.fee_amount)),
      ...(courts.length ? { court_labels: courts.join(', '), courts: courts.length } : {}),
    },
  };
}

// Places taken per group (main list: registered, checked in, payment being checked).
async function takenByGroup(event) {
  const { data, error } = await supabase.from('event_participants').select('group_id').eq('event_id', event.id).in('status', HOLDS_PLACE);
  if (error) throw error;
  const out = {};
  for (const r of data || []) out[r.group_id || ''] = (out[r.group_id || ''] || 0) + 1;
  return out;
}

// What a player sees for each group: hours, fee, places left.
async function publicGroups(event) {
  const groups = groupsOf(event);
  if (!groups.length) return null;
  const taken = await takenByGroup(event);
  return groups.map((g) => ({ ...g, taken: taken[g.id] || 0, left: Math.max(g.slots - (taken[g.id] || 0), 0) }));
}

// A sign-up on an event with groups must name one of them.
function pickGroup(event, groupId) {
  const groups = groupsOf(event);
  if (!groups.length) return null;
  const g = groupOf(event, groupId);
  if (!g) throw Object.assign(new Error('Pick the time group you want to play in.'), { status: 400, code: 'group_required' });
  return g;
}

module.exports = { MIGRATION, ready, courtList, groupsOf, groupOf, forGroup, cleanGroups, takenByGroup, publicGroups, pickGroup };
