// The DUPR range (badminton: level) a community level stands for, from the Host's control
// panel: "manual" levels carry dupr_min / dupr_max; "score" levels go from their lower bound
// up to the next level's. Used to fill a kèo's DUPR limits from the levels it is for.
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

// `women`: the women's range when the levels are split by gender (falls back to the shared one).
export function rangeOfItem(levels, i, women = false) {
  const it = levels?.items?.[i];
  if (!it) return null;
  const f = women && levels.by_gender;
  if (levels.mode === 'manual') {
    const min = num(f ? it.f_min : it.dupr_min);
    const max = num(f ? it.f_max : it.dupr_max);
    return min == null && max == null ? null : { min, max };
  }
  if (levels.mode === 'score') {
    const next = levels.items[i + 1];
    return f ? { min: i === 0 ? null : num(it.f_min ?? it.min), max: next ? num(next.f_min ?? next.min) : null } : { min: num(it.min), max: num(next?.min) };
  }
  return null;
}

// Range covering every chosen level (null = nothing known). An open end on any chosen level
// keeps that end open.
export function rangeOfKeys(levels, keys, women = false) {
  const ranges = (levels?.items || []).map((it, i) => (keys.includes(it.key) ? rangeOfItem(levels, i, women) : undefined)).filter((r) => r !== undefined);
  if (!ranges.length || ranges.some((r) => r === null)) return null;
  const mins = ranges.map((r) => r.min);
  const maxs = ranges.map((r) => r.max);
  return { min: mins.includes(null) ? null : Math.min(...mins), max: maxs.includes(null) ? null : Math.max(...maxs) };
}
