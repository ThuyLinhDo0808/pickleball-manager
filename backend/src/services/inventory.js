// Inventory maths (pure). Moves: purchase (+qty @ unit_cost), retire (-qty, sessions_lasted),
// adjust (±qty, e.g. a stock count correction).

function round(n, d = 0) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function itemMetrics(moves) {
  let purchased = 0;
  let spent = 0;
  let retired = 0;
  let adjusted = 0;
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
    } else if (m.kind === 'adjust') {
      adjusted += q;
    }
  }
  const avgCost = purchased ? spent / purchased : null;
  const durability = lifeQty ? lifeSum / lifeQty : null; // sessions per ball
  return {
    stock: purchased - retired + adjusted,
    purchased,
    retired,
    total_spent: round(spent),
    avg_unit_cost: avgCost == null ? null : round(avgCost),
    durability: durability == null ? null : round(durability, 1),
    // What one ball costs for each session it is played with — the number to compare ball types on.
    cost_per_session: avgCost != null && durability ? round(avgCost / durability) : null,
  };
}

module.exports = { itemMetrics };
