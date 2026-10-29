// Coach Manager: who may use it and whose profile a request works on.
//
// A product of its own, beside the club / community manager: not part of any plan, so
// nothing here reads host_subscriptions or planFeatures. It is switched on for everyone by
// the app setting `coach_enabled` (Owner Console → Hệ thống); while that is off, only the
// accounts listed in COACH_BETA_EMAILS (comma-separated) see it — the way a new product
// is tried on production without the other users noticing.
const { supabase } = require('../supabase');
const appSettings = require('./appSettings');
const { schemaStatus } = require('./schemaCheck');

const MIGRATION = '20261230090000_coach_manager.sql';
const fail = (message, status = 400, code) => Object.assign(new Error(message), { status, code });

async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

function betaEmails() {
  return String(process.env.COACH_BETA_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Switched on for this account? Beta testers are matched on their confirmed email only.
async function enabledFor(req) {
  if (await appSettings.get('coach_enabled')) return true;
  const email = String(req.hostEmail || '').toLowerCase();
  return !!email && betaEmails().includes(email);
}

const SELECT = 'id, user_id, slug, display_name, sport, bio, level_text, dupr_id, area, court_name, map_url, price_note, phone, status, public, cancel_hours, deduct_mode, created_at, updated_at';

async function profileOf(userId) {
  if (!(await ready())) return null;
  const { data, error } = await supabase.from('coach_profiles').select(SELECT).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function profileBySlug(slug) {
  if (!(await ready()) || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(String(slug || ''))) return null;
  const { data, error } = await supabase.from('coach_profiles').select(SELECT).eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data || null;
}

// What every coach page starts from: the product is on for this account and the account
// has a profile that is not blocked. Sets req.coach.
async function requireCoach(req, res, next) {
  try {
    if (!(await enabledFor(req))) return res.status(403).json({ error: 'Coach Manager is not available for this account.', code: 'coach_off' });
    if (!(await ready())) return res.status(503).json({ error: 'Coach Manager needs a database update.', code: 'migration_missing', migration: MIGRATION });
    const coach = await profileOf(req.userId);
    if (!coach) return res.status(404).json({ error: 'No coach profile yet.', code: 'no_profile' });
    if (coach.status === 'blocked') return res.status(403).json({ error: 'This coach profile was blocked by the administrators.', code: 'coach_blocked' });
    req.coach = coach;
    return next();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
}

// ---- Profile fields --------------------------------------------------------------------
const SPORTS = ['pickleball', 'badminton'];
// Pages under /coach/… that are not a coach's address.
const RESERVED = ['profile', 'classes', 'students', 'schedule', 'sessions', 'finance', 'new', 'settings', 'me', 'status'];
const DEDUCT = ['present_or_noshow', 'present_only', 'always'];
const text = (v, max) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw fail(`Too long (max ${max} characters).`, 400, 'too_long');
  return s;
};

// Vietnamese letters → a-z for the public address (/coach/<slug>).
function slugify(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function cleanFields(body, { creating = false } = {}) {
  const b = body || {};
  const out = {};
  const has = (k) => k in b;
  if (creating || has('display_name')) {
    const name = text(b.display_name, 80);
    if (!name || name.length < 2) throw fail('Display name is required (2–80 characters).', 400, 'bad_name');
    out.display_name = name;
  }
  if (has('slug')) {
    const s = String(b.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(s) || RESERVED.includes(s)) throw fail('The address may only have a–z, 0–9 and -, 3–40 characters.', 400, 'bad_slug');
    out.slug = s;
  }
  if (has('sport')) {
    if (!SPORTS.includes(b.sport)) throw fail('Unknown sport.', 400, 'bad_sport');
    out.sport = b.sport;
  }
  for (const [k, max] of [['bio', 2000], ['level_text', 80], ['dupr_id', 20], ['area', 120], ['court_name', 160], ['price_note', 300], ['phone', 20]]) {
    if (has(k)) out[k] = text(b[k], max);
  }
  if (has('map_url')) {
    const u = text(b.map_url, 500);
    if (u && !/^https:\/\/\S+$/i.test(u)) throw fail('The map link must be an https link (Google Maps).', 400, 'bad_map_url');
    out.map_url = u;
  }
  if (has('public')) out.public = !!b.public;
  if (has('status')) {
    if (!['active', 'paused'].includes(b.status)) throw fail('status must be active or paused.', 400, 'bad_status');
    out.status = b.status;
  }
  if (has('cancel_hours')) {
    const n = Number(b.cancel_hours);
    if (!Number.isInteger(n) || n < 0 || n > 168) throw fail('cancel_hours must be 0–168.', 400, 'bad_cancel_hours');
    out.cancel_hours = n;
  }
  if (has('deduct_mode')) {
    if (!DEDUCT.includes(b.deduct_mode)) throw fail('Unknown deduct_mode.', 400, 'bad_deduct_mode');
    out.deduct_mode = b.deduct_mode;
  }
  return out;
}

// A free slug for a new profile: from the name, then -2, -3…
async function freeSlug(base) {
  let root = slugify(base);
  if (root.length < 3) root = `coach-${root}`.replace(/-+$/g, '');
  if (root.length < 3 || RESERVED.includes(root)) root = `coach-${root}`.slice(0, 40).replace(/-+$/g, '');
  for (let i = 0; i < 50; i += 1) {
    const slug = i === 0 ? root : `${root.slice(0, 40 - String(i + 1).length - 1)}-${i + 1}`;
    const { data } = await supabase.from('coach_profiles').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
  }
  return `${root.slice(0, 30)}-${Date.now().toString(36)}`;
}

// What anyone may see of a coach: no phone, no settings — only when public (or by link
// when not public: the page still opens, it is just not listed), never when blocked / paused.
function publicView(c) {
  return {
    slug: c.slug,
    display_name: c.display_name,
    sport: c.sport,
    bio: c.bio,
    level_text: c.level_text,
    area: c.area,
    court_name: c.court_name,
    map_url: c.map_url,
    price_note: c.price_note,
    public: c.public,
    status: c.status,
    user_id: c.user_id,
  };
}

module.exports = { MIGRATION, ready, enabledFor, betaEmails, profileOf, profileBySlug, requireCoach, cleanFields, slugify, freeSlug, publicView, SELECT, fail };
