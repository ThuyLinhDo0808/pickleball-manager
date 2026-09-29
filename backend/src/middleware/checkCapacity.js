const { supabase } = require('../supabase');

async function getUsage(hostId) {
  const { data, error } = await supabase
    .from('v_host_capacity_usage')
    .select('*')
    .eq('host_id', hostId)
    .maybeSingle();
  if (error) throw error;
  return data || { host_id: hostId, tier: 'free', capacity_limit: 30, used: 0, remaining: 30 };
}

// Middleware form: blocks the request outright if the host is already at capacity.
function checkCapacity() {
  return async (req, res, next) => {
    try {
      const usage = await getUsage(req.hostId);
      if (usage.remaining <= 0) {
        return res.status(403).json({
          error: `Capacity limit reached (${usage.used}/${usage.capacity_limit} on the ${usage.tier} plan). Upgrade to add more people.`,
          usage,
        });
      }
      req.capacityUsage = usage;
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not verify capacity.' });
    }
  };
}

// Mid-handler form: how many new bodies (e.g. bulk import) can actually fit.
async function limitBody(hostId, requestedCount) {
  const usage = await getUsage(hostId);
  const allowed = Math.max(usage.remaining, 0);
  return { usage, allowed, willExceed: requestedCount > allowed };
}

module.exports = { checkCapacity, getUsage, limitBody };
