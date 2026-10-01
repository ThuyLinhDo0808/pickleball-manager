// Database errors: data problems (constraint / bad value / trigger rule) are shown so the
// user can fix them; anything else (schema, permissions, network) stays in the server log
// and the client gets a generic message + request id. Outside production, full details.
const USER_FACING = /^(22|23|P0001)/; // data exceptions, integrity violations, raise exception
function dbError(res, error, fallback = 'Database error') {
  const rid = res.req?.id;
  console.error(rid ? `[${rid}]` : '', error);
  if (process.env.NODE_ENV !== 'production' || USER_FACING.test(String(error?.code || ''))) {
    return res.status(400).json({ error: error?.message || fallback });
  }
  return res.status(500).json({ error: `${fallback}. Please try again.`, request_id: rid });
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
