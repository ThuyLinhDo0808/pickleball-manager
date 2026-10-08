// Inventory maths (pure). Moves: purchase (+qty @ unit_cost), retire (-qty, sessions_lasted),
// use (-qty: new balls / shuttles taken out of the box for a session), broken (balls in
// play that broke — out of play, the box count doesn't change), adjust (±qty, a count fix).

function round(n, d = 0) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function itemMetrics(moves) {
  let purchased = 0;
  let spent = 0;
  let retired = 0;
  let adjusted = 0;
  let used = 0;
  let broken = 0;
  const usedSessions = new Set();
  let lifeQty = 0; // retired balls that have a known lifetime
  let lifeSum = 0; // sum of qty * sessions_lasted
  for (const m of moves) {
    const q = Number(m.quantity);
    if (m.kind === 'purchase') {
      purchased += q;
      spent += q * Number(m.unit_cost || 0);
    } else if (m.kind === 'retire') {
      retired += q;
      if (m.sessions_lasted != null) {
        lifeQty += q;
        lifeSum += q * Number(m.sessions_lasted);
      }
    } else if (m.kind === 'use') {
      used += q;
      if (m.event_id) usedSessions.add(m.event_id);
    } else if (m.kind === 'broken') {
      broken += q;
    } else if (m.kind === 'adjust') {
      adjusted += q;
    }
  }
  const avgCost = purchased ? spent / purchased : null;
  const durability = lifeQty ? lifeSum / lifeQty : null; // sessions per ball
  return {
    stock: purchased - retired - used + adjusted,
    purchased,
    retired,
    used,
    broken,
    // Out of the box and still playable.
    in_play: Math.max(0, used - broken),
    // Shuttles: how many a session uses on average, and what that costs.
    used_per_session: usedSessions.size ? round(used / usedSessions.size, 1) : null,
    cost_per_used_session: avgCost != null && usedSessions.size ? round((avgCost * used) / usedSessions.size) : null,
    total_spent: round(spent),
    avg_unit_cost: avgCost == null ? null : round(avgCost),
    durability: durability == null ? null : round(durability, 1),
    // What one ball costs for each session it is played with — the number to compare ball types on.
    cost_per_session: avgCost != null && durability ? round(avgCost / durability) : null,
  };
}

// What the box holds after a move (broken balls were already out of it).
function stockEffect(m) {
  const q = Number(m.quantity);
  if (m.kind === 'purchase') return q;
  if (m.kind === 'retire' || m.kind === 'use') return -q;
  if (m.kind === 'adjust') return q;
  return 0;
}

// The ball table, one column per session (a date with balls taken out or broken):
//   new    — new balls taken out of the box for this session
//   old    — balls from earlier sessions still played with
//   broken — balls broken so far (all sessions up to this one)
//   used   — balls taken out of the box so far
//   bought — balls bought so far
//   left   — balls still in the box
// so new + old + broken + left = bought (± stock fixes).
// `sessions`: dates of the club's / organiser's sessions — from the first ball taken out
// on, a session with nothing logged still gets a column (it played with the old balls).
function ballLog(moves, sessions = []) {
  const sorted = [...moves].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const logged = sorted.filter((m) => m.kind === 'use' || m.kind === 'broken').map((m) => m.occurred_on);
  const first = logged.length ? logged.reduce((a, d) => (d < a ? d : a)) : null;
  const days = [...new Set([...logged, ...(first ? sessions.filter((d) => d >= first) : [])])].sort();
  const rows = [];
  let inPlay = 0;
  let brokenSoFar = 0;
  let usedSoFar = 0;
  for (const day of days) {
    const today = sorted.filter((m) => m.occurred_on === day);
    const n = today.filter((m) => m.kind === 'use').reduce((t, m) => t + Number(m.quantity), 0);
    const b = today.filter((m) => m.kind === 'broken').reduce((t, m) => t + Number(m.quantity), 0);
    const upTo = sorted.filter((m) => m.occurred_on <= day);
    // Breaks hit the old balls first; the rest are new balls taken out (and broken) today.
    const old = Math.max(0, inPlay - b);
    const fresh = Math.max(0, n - Math.max(0, b - inPlay));
    brokenSoFar += b;
    usedSoFar += n;
    inPlay = old + fresh;
    rows.push({
      date: day,
      event_id: today.find((m) => m.event_id)?.event_id || null,
      new: fresh,
      new_out: n,
      old,
      broken_now: b,
      broken: brokenSoFar,
      used: usedSoFar,
      bought: upTo.filter((m) => m.kind === 'purchase').reduce((t, m) => t + Number(m.quantity), 0),
      left: upTo.reduce((t, m) => t + stockEffect(m), 0),
    });
  }
  return rows;
}

module.exports = { itemMetrics, ballLog };
