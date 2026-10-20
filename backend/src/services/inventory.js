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

// The ball table, one row per session (a date with balls taken out, broken or played):
//   new      — new balls taken out of the box for this session
//   old      — old balls (from earlier sessions) played with; what the Host entered, or
//              (older entries) every ball still playable
//   broken_now — balls that broke this session
//   played   — balls on court this session (old + new)
//   playable — balls out of the box still playable after the session
//   broken / used / bought — so far; left — balls still in the box
// `sessions`: dates of the club's / organiser's sessions — from the first ball logged on, a
// session with nothing logged still gets a row (it played with the old balls).
function ballLog(moves, sessions = []) {
  const sorted = [...moves].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const logged = sorted.filter((m) => m.kind === 'use' || m.kind === 'broken' || m.kind === 'play').map((m) => m.occurred_on);
  const first = logged.length ? logged.reduce((a, d) => (d < a ? d : a)) : null;
  const days = [...new Set([...logged, ...(first ? sessions.filter((d) => d >= first) : [])])].sort();
  const rows = [];
  let pool = 0;
  let brokenSoFar = 0;
  let usedSoFar = 0;
  for (const day of days) {
    const today = sorted.filter((m) => m.occurred_on === day);
    const n = today.filter((m) => m.kind === 'use').reduce((t, m) => t + Number(m.quantity), 0);
    const b = today.filter((m) => m.kind === 'broken').reduce((t, m) => t + Number(m.quantity), 0);
    const play = today.find((m) => m.kind === 'play');
    const upTo = sorted.filter((m) => m.occurred_on <= day);
    const old = play ? Number(play.quantity) : pool;
    brokenSoFar += b;
    usedSoFar += n;
    pool = Math.max(0, pool + n - b);
    rows.push({
      date: day,
      event_id: today.find((m) => m.event_id)?.event_id || null,
      new: n,
      new_out: n,
      old,
      old_entered: !!play,
      broken_now: b,
      played: old + n,
      playable: pool,
      broken: brokenSoFar,
      used: usedSoFar,
      bought: upTo.filter((m) => m.kind === 'purchase').reduce((t, m) => t + Number(m.quantity), 0),
      left: upTo.reduce((t, m) => t + stockEffect(m), 0),
    });
  }
  return rows;
}

// Độ bền bóng from the ball table: every ball on court in a session is one "ball-session";
// ball-sessions / balls broken = how many sessions a ball lasts on average. With the average
// price: what the balls broken cost per session.
function playStats(log, avgCost) {
  const sessions = log.length;
  const ballSessions = log.reduce((t, r) => t + r.played, 0);
  const broken = log.reduce((t, r) => t + r.broken_now, 0);
  return {
    sessions_logged: sessions,
    ball_sessions: ballSessions,
    avg_played: sessions ? round(ballSessions / sessions, 1) : null,
    play_durability: broken ? round(ballSessions / broken, 1) : null,
    ball_cost_per_session: avgCost != null && sessions && broken ? round((avgCost * broken) / sessions) : null,
  };
}

module.exports = { itemMetrics, ballLog, playStats };
