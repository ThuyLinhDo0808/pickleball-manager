const { supabaseAdmin } = require('../config/supabase');

/**
 * Plan capacity = active club members (all of the host's clubs)
 *               + participants (registered / waitlist / checked-in) of the host's
 *                 UPCOMING events (draft/open/closed, not completed/cancelled).
 * The counting lives in the v_host_capacity_usage view so it's defined once.
 */
async function getUsage(hostId) {
  const { data, error } = await supabaseAdmin
    .from('v_host_capacity_usage')
    .select('tier, max_capacity, current_usage')
    .eq('host_id', hostId)
    .maybeSingle();
  if (error) throw error;
  return data || { tier: 'free', max_capacity: 30, current_usage: 0 };
}

function limitBody(usage) {
  return {
    error: 'CAPACITY_LIMIT_REACHED',
    message: `Your ${usage.tier} plan allows up to ${usage.max_capacity} active members/participants and you're at ${usage.current_usage}. Upgrade your plan to add more.`,
    tier: usage.tier,
    max_capacity: usage.max_capacity,
    current_usage: usage.current_usage,
  };
}

/** Middleware: blocks the request with 403 when the host is at their limit. */
async function checkCapacity(req, res, next) {
  let usage;
  try {
    usage = await getUsage(req.user.id);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to verify plan capacity.', details: e.message });
  }

  if (usage.current_usage >= usage.max_capacity) {
    return res.status(403).json(limitBody(usage));
  }

  req.capacity = usage;
  next();
}

module.exports = { checkCapacity, getUsage, limitBody };
