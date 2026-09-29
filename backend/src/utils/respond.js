const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

function dbError(res, error, status = 400) {
  return res.status(status).json({ error: error.message || 'Database error', details: error });
}

function notFound(res, what = 'Resource') {
  return res.status(404).json({ error: `${what} not found.` });
}

// Copy only the listed keys that are actually present (undefined is skipped,
// null is kept so a field can be cleared on purpose).
function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

module.exports = { dbError, notFound, isUuid, pick };
