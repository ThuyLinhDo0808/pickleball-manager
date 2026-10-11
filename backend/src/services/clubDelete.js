// Deleting a club / community with everything in it — used by the Host ("CLB của tôi")
// and by the app owner (/owner/hosts/<id>).
const { supabase } = require('../supabase');

// What goes with it: members, sessions / kèo, tournaments, money entries.
async function preview(club) {
  const count = (table) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('club_id', club.id).then((r) => {
    if (r.error) throw r.error;
    return r.count || 0;
  });
  const [members, events, tournaments, transactions] = await Promise.all([count('club_members'), count('events'), count('tournaments'), count('transactions')]);
  return { name: club.name, kind: club.kind || 'club', members, events, tournaments, transactions };
}

// Tournaments go first (their team line-ups point at members, which would otherwise
// clash while cascading), then the sessions (they would otherwise survive as club-less
// "Xé Vé" events), then the club itself.
async function remove(club) {
  for (const table of ['tournaments', 'events']) {
    const { error } = await supabase.from(table).delete().eq('club_id', club.id);
    if (error) throw error;
  }
  const { error } = await supabase.from('clubs').delete().eq('id', club.id);
  if (error) throw error;
}

module.exports = { preview, remove };
