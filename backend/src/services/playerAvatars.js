// Player photos everywhere a player is listed (court boards, participant lists, members,
// rankings). Lists carry only a version per account (`avatar_v`, from the profile's
// updated_at); the picture itself comes from one URL with that version, so a new photo shows
// up on every page at once and an unchanged one is served from the browser cache.
const { supabase } = require('../supabase');

const versionOf = (updatedAt) => (updatedAt ? Date.parse(updatedAt).toString(36) : '1');

// user_id → version, only for accounts that have a photo.
async function versions(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('player_profiles')
      .select('user_id, updated_at')
      .in('user_id', ids.slice(i, i + 200))
      .not('avatar', 'is', null);
    if (error) throw error;
    for (const p of data || []) out.set(p.user_id, versionOf(p.updated_at));
  }
  return out;
}

// Adds `avatar_v` to each row that has a photo; `userOf(row)` gives the row's account.
async function attach(rows, userOf = (r) => r.user_id) {
  if (!rows?.length) return rows;
  const v = await versions(rows.map(userOf)).catch(() => new Map());
  for (const r of rows) {
    const id = userOf(r);
    if (id && v.has(id)) r.avatar_v = v.get(id);
  }
  return rows;
}

// The photo as an image (stored as a small data URL on the profile).
async function image(userId) {
  const { data } = await supabase.from('player_profiles').select('avatar').eq('user_id', userId).maybeSingle();
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(data?.avatar || '');
  if (!m) return null;
  return { type: m[1], body: Buffer.from(m[2], 'base64') };
}

module.exports = { versions, attach, image, versionOf };
