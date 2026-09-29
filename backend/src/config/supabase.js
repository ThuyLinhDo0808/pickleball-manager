const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Fail fast and loud — every route depends on this client.
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill it in.'
  );
}

// Server-side client uses the SERVICE ROLE key so the backend can read/write
// across the schema. RLS still protects direct client access (e.g. if the
// mobile app ever talks to Supabase directly); the API layer is the
// trusted boundary that enforces "a host only touches their own data" by
// always scoping queries with the authenticated host_id from the JWT.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = { supabaseAdmin };
