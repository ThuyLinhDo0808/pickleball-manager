// Personal data: consent to the Terms / Privacy Policy, "download my data", and how long
// things are kept (retention). See /privacy and /terms on the web.
const { supabase } = require('../supabase');

// Bump when the Terms or the Privacy Policy change in a way people must accept again
// (same value as web/lib/legal.js LEGAL_VERSION).
const LEGAL_VERSION = '2026-10-12';
const PROOF_DAYS = () => Math.max(7, Number(process.env.PROOF_RETENTION_DAYS || 90));
const DEVICE_DAYS = 365;

async function consentOf(userId) {
  const { data, error } = await supabase.from('users').select('terms_version, terms_accepted_at').eq('id', userId).maybeSingle();
  if (error) return { ready: false, current: LEGAL_VERSION, needs: false };
  return {
    ready: true,
    current: LEGAL_VERSION,
    accepted_version: data?.terms_version || null,
    accepted_at: data?.terms_accepted_at || null,
    needs: (data?.terms_version || '') !== LEGAL_VERSION,
  };
}

async function accept(userId) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('users').update({ terms_version: LEGAL_VERSION, terms_accepted_at: now }).eq('id', userId);
  if (error) throw error;
  return { accepted_version: LEGAL_VERSION, accepted_at: now };
}

// Everything the app keeps about this person, as one JSON document (Personal data
// protection: the right to see / get a copy of your data). Secrets (two-step key,
// recovery codes, password) are never included; screenshots are listed, not embedded.
async function exportMyData(userId) {
  // A part that fails (e.g. an older database) is left empty, but logged.
  const q = async (p) => {
    const { data, error } = await p;
    if (error) console.warn('export:', error.message);
    return data || [];
  };
  const [user] = await q(
    supabase.from('users').select('id, email, username, birth_date, gender, region, sports, account_role, onboarded_at, created_at, terms_version, terms_accepted_at').eq('id', userId)
  );
  const [profile] = await q(supabase.from('player_profiles').select('full_name, phone, dupr_level, badminton_level, gender, birth_year, birth_date, email_notices, updated_at').eq('user_id', userId));
  const memberRows = await q(
    supabase
      .from('club_members')
      .select('id, full_name, phone, gender, birth_year, birth_date, member_type, tier, is_active, joined_on, created_at, clubs(name)')
      .eq('user_id', userId)
  );
  const memberIds = memberRows.map((m) => m.id);
  const memberships = memberIds.length
    ? await q(supabase.from('memberships').select('club_member_id, period_label, starts_on, ends_on, status, amount, created_at').in('club_member_id', memberIds))
    : [];
  const signups = await q(
    supabase
      .from('event_participants')
      .select('id, full_name, phone, status, kind, fee_amount, fee_paid, payment_status, payment_submitted_at, payment_proof, proof_purged_at, late_cancel, joined_at, checked_in_at, cancelled_at, refunded_at, refund_amount, events(title, event_date, start_time, location)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })
      .limit(2000)
  );
  const surveys = signups.length
    ? await q(supabase.from('event_surveys').select('*').in('participant_id', signups.map((p) => p.id)))
    : [];
  const feedback = await q(supabase.from('feedback').select('*').eq('host_id', userId));
  const devices = await q(supabase.from('login_devices').select('user_agent, ip_hint, first_seen, last_seen').eq('user_id', userId));
  const clubsOwned = await q(supabase.from('clubs').select('name, kind, created_at').eq('host_id', userId));
  const [mfa] = await q(supabase.from('user_mfa').select('enabled_at').eq('user_id', userId));
  return {
    exported_at: new Date().toISOString(),
    about: 'NexusZone — dữ liệu cá nhân của bạn / your personal data',
    account: user || null,
    two_step_sign_in: { enabled: !!mfa?.enabled_at, enabled_at: mfa?.enabled_at || null },
    player_profile: profile || null,
    club_memberships: memberRows.map(({ clubs, ...m }) => ({ ...m, club: clubs?.name || null })),
    membership_plans: memberships,
    event_signups: signups.map(({ events, payment_proof, ...p }) => ({
      ...p,
      event: events || null,
      transfer_screenshot: payment_proof ? 'kept (shown to the Host only)' : p.proof_purged_at ? 'deleted (retention)' : null,
    })),
    session_reviews: surveys,
    feedback,
    sign_in_devices: devices,
    clubs_you_manage: clubsOwned,
    note: 'Dữ liệu CLB bạn quản lý (thành viên, thu chi…) tải ở Tài khoản → Sao lưu. Club data you manage: Account → Backup.',
  };
}

// ---- retention ---------------------------------------------------------------------
const ymd = (d) => d.toISOString().slice(0, 10);

// Transfer screenshots of sessions that ended more than PROOF_RETENTION_DAYS ago.
async function purgeOldProofs(today = new Date()) {
  const cutoff = ymd(new Date(today.getTime() - PROOF_DAYS() * 86400_000));
  let purged = 0;
  for (let round = 0; round < 50; round++) {
    const { data: rows, error } = await supabase
      .from('event_participants')
      .select('id, events!inner(event_date)')
      .not('payment_proof', 'is', null)
      .lt('events.event_date', cutoff)
      .limit(500);
    if (error) throw error;
    if (!rows?.length) break;
    const { error: uErr } = await supabase
      .from('event_participants')
      .update({ payment_proof: null, proof_purged_at: new Date().toISOString() })
      .in('id', rows.map((r) => r.id));
    if (uErr) throw uErr;
    purged += rows.length;
    if (rows.length < 500) break;
  }
  return purged;
}

// Sign-in devices not seen for a year.
async function purgeOldDevices(today = new Date()) {
  const cutoff = new Date(today.getTime() - DEVICE_DAYS * 86400_000).toISOString();
  const { data, error } = await supabase.from('login_devices').delete().lt('last_seen', cutoff).select('id');
  if (error) throw error;
  return data?.length || 0;
}

async function runRetention() {
  const out = {};
  for (const [k, fn] of [['proofs', purgeOldProofs], ['devices', purgeOldDevices]]) {
    try {
      out[k] = await fn();
    } catch (err) {
      out[k] = `error: ${err.message}`; // e.g. migration not run yet
    }
  }
  return out;
}

function startRetentionSweeper(everyMs = 6 * 3600 * 1000) {
  const tick = () =>
    runRetention()
      .then((r) => {
        if (r.proofs || r.devices) console.log('[retention]', JSON.stringify(r));
      })
      .catch(() => {});
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, everyMs).unref();
}

module.exports = { LEGAL_VERSION, consentOf, accept, exportMyData, purgeOldProofs, purgeOldDevices, runRetention, startRetentionSweeper, PROOF_DAYS };
