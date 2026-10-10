// App-wide settings the owner switches from the web (table app_settings). Each key falls
// back to an environment variable, then a default, so the app works before the
// migration and the env var on the server is just the starting value.
const { supabase } = require('../supabase');

const KEYS = {
  // Upgrades switch on at once, without payment (testing only).
  tier_self_serve: { env: 'ALLOW_TIER_SELF_SERVE', fallback: false, type: 'boolean' },
  // New clubs are asked for and created only once the app owner approves them.
  club_approval: { env: 'CLUB_APPROVAL', fallback: true, type: 'boolean' },
};

const TTL_MS = 15 * 1000;
let cache = null;

async function all() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const { data, error } = await supabase.from('app_settings').select('key, value, updated_at, updated_by');
  const rows = error ? [] : data || [];
  const value = {};
  for (const [key, def] of Object.entries(KEYS)) {
    const row = rows.find((r) => r.key === key);
    const env = process.env[def.env];
    const fromEnv = env == null || env === '' ? def.fallback : def.type === 'boolean' ? env === 'true' : env;
    value[key] = {
      value: row ? row.value : fromEnv,
      source: row ? 'app' : env == null || env === '' ? 'default' : 'env',
      updated_at: row?.updated_at || null,
      updated_by: row?.updated_by || null,
    };
  }
  cache = { at: Date.now(), value };
  return value;
}

async function get(key) {
  return (await all())[key]?.value;
}

async function set(key, value, actor) {
  const def = KEYS[key];
  if (!def) throw Object.assign(new Error('Unknown setting.'), { status: 400 });
  if (def.type === 'boolean' && typeof value !== 'boolean') throw Object.assign(new Error(`${key} must be true or false.`), { status: 400 });
  const { error } = await supabase.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString(), updated_by: actor || null }, { onConflict: 'key' });
  if (error) throw error;
  cache = null;
}

const selfServe = async () => (await get('tier_self_serve')) === true;
const clubApproval = async () => (await get('club_approval')) !== false;

module.exports = { KEYS, all, get, set, selfServe, clubApproval };
