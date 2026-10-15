// The DUPR range (badminton: level) a community level stands for, from the Host's control
// panel: "manual" levels carry dupr_min / dupr_max; "score" levels go from their lower bound
// up to the next level's. Used to fill a kèo's DUPR limits from the levels it is for.
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export function rangeOfItem(levels, i) {
  const it = levels?.items?.[i];
  if (!it) return null;
  if (levels.mode === 'manual') {
    const min = num(it.dupr_min);
    const max = num(it.dupr_max);
    return min == null && max == null ? null : { min, max };
  }
  if (levels.mode === 'score') return { min: num(it.min), max: num(levels.items[i + 1]?.min) };
  return null;
}

// Range covering every chosen level (null = nothing known). An open end on any chosen level
// keeps that end open.
export function rangeOfKeys(levels, keys) {
  const ranges = (levels?.items || []).map((it, i) => (keys.includes(it.key) ? rangeOfItem(levels, i) : undefined)).filter((r) => r !== undefined);
  if (!ranges.length || ranges.some((r) => r === null)) return null;
  const mins = ranges.map((r) => r.min);
  const maxs = ranges.map((r) => r.max);
  return { min: mins.includes(null) ? null : Math.min(...mins), max: maxs.includes(null) ? null : Math.max(...maxs) };
}
