// The owner's banner (set in /owner/announcements), readable without login. Only what
// is running now; ?public=1 = only those also meant for public pages.
const { supabase } = require('../supabase');

const TTL_MS = 30 * 1000;
let cache = null;

async function current(req, res) {
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('announcements')
        .select('id, message, level, starts_at, ends_at, show_public')
        .eq('active', true)
        .lte('starts_at', now)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order('starts_at', { ascending: false })
        .limit(5);
      cache = { at: Date.now(), rows: error ? [] : data || [] };
    }
    const rows = req.query.public === '1' ? cache.rows.filter((a) => a.show_public) : cache.rows;
    res.set('Cache-Control', 'public, max-age=30').json(rows);
  } catch {
    res.json([]);
  }
}

const forget = () => { cache = null; };

module.exports = { current, forget };
