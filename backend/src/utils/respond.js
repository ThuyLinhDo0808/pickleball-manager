function dbError(res, error, fallback = 'Database error') {
  console.error(error);
  return res.status(400).json({ error: error?.message || fallback });
}

function notFound(res, what = 'Resource') {
  return res.status(404).json({ error: `${what} not found.` });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

module.exports = { dbError, notFound, isUuid, pick };
