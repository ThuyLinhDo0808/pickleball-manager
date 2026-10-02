// Extra member columns (migration 20261014090000): where the member lives (district),
// how long they have played, and the Host's own A-D rank. Also gates matches that are
// set up first and scored later (nullable scores, same migration).
const { schemaStatus } = require('./schemaCheck');

const MIGRATION = '20261014090000_member_area_rank_unscored_matches.sql';
const PLAY_DURATIONS = ['lt6', '6_12', '12_18', 'gt18'];
const RANKS = ['A', 'B', 'C', 'D'];

async function extrasReady() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

// The extra fields present in `body`, cleaned ('' clears a field). Throws 400 on bad values.
function cleanExtras(body = {}) {
  const out = {};
  if ('district' in body) out.district = String(body.district ?? '').trim().slice(0, 80) || null;
  if ('play_duration' in body) {
    const v = body.play_duration || null;
    if (v && !PLAY_DURATIONS.includes(v)) throw badRequest('play_duration must be lt6, 6_12, 12_18 or gt18.');
    out.play_duration = v;
  }
  if ('real_rank' in body) {
    const v = body.real_rank ? String(body.real_rank).toUpperCase() : null;
    if (v && !RANKS.includes(v)) throw badRequest('real_rank must be A, B, C or D.');
    out.real_rank = v;
  }
  return out;
}

module.exports = { MIGRATION, PLAY_DURATIONS, RANKS, extrasReady, cleanExtras };
