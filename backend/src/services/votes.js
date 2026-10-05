// Meeting votes (events.kind = 'meeting'): club members say whether they come.
// One vote per member and event; the Host can also mark it for a member.
const { supabase } = require('../supabase');

const CHOICES = ['yes', 'no'];

// Every active member of the event's club with their vote (or null), plus the tally.
async function votesFor(event) {
  const [{ data: members, error: e1 }, { data: votes, error: e2 }] = await Promise.all([
    supabase.from('club_members').select('id, full_name, member_type, is_active').eq('club_id', event.club_id).order('full_name'),
    supabase.from('event_votes').select('club_member_id, choice, by_host, updated_at').eq('event_id', event.id),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const byMember = new Map((votes || []).map((v) => [v.club_member_id, v]));
  const rows = (members || [])
    .filter((m) => m.is_active || byMember.has(m.id))
    .map((m) => ({ club_member_id: m.id, full_name: m.full_name, member_type: m.member_type, choice: byMember.get(m.id)?.choice || null, by_host: !!byMember.get(m.id)?.by_host }));
  return { members: rows, ...tally(rows) };
}

function tally(rows) {
  const yes = rows.filter((r) => r.choice === 'yes').length;
  const no = rows.filter((r) => r.choice === 'no').length;
  return { yes, no, none: rows.length - yes - no };
}

// choice null = take the vote back.
async function castVote(eventId, clubMemberId, choice, byHost) {
  if (choice === null) {
    const { error } = await supabase.from('event_votes').delete().eq('event_id', eventId).eq('club_member_id', clubMemberId);
    if (error) throw error;
    return null;
  }
  const { data, error } = await supabase
    .from('event_votes')
    .upsert({ event_id: eventId, club_member_id: clubMemberId, choice, by_host: byHost, updated_at: new Date().toISOString() }, { onConflict: 'event_id,club_member_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Counts for several events at once (member club page).
async function countsFor(eventIds) {
  if (!eventIds.length) return new Map();
  const { data, error } = await supabase.from('event_votes').select('event_id, club_member_id, choice').in('event_id', eventIds);
  if (error) throw error;
  const out = new Map(eventIds.map((id) => [id, { yes: 0, no: 0, rows: [] }]));
  for (const v of data || []) {
    const c = out.get(v.event_id);
    c[v.choice]++;
    c.rows.push(v);
  }
  return out;
}

module.exports = { CHOICES, votesFor, castVote, countsFor };
