// Player level per sport. Pickleball: DUPR 1.00-8.00. Badminton: steps 1-6 (stored in the
// same level columns), shown by name.
export const BADMINTON_LEVELS = [1, 2, 3, 4, 5, 6];

// "TB+", "Khá"... for a badminton step; the DUPR number as typed for pickleball.
export function levelText(value, sport, t) {
  if (value == null || value === '') return null;
  if (sport === 'badminton') {
    const n = Math.round(Number(value));
    return BADMINTON_LEVELS.includes(n) ? t(`level.b${n}`) : String(value);
  }
  return String(Number(value));
}

// Range shown on an event ("TB → Khá", "3.0 – 3.5").
export function levelRange(min, max, sport, t) {
  const a = levelText(min, sport, t);
  const b = levelText(max, sport, t);
  if (!a && !b) return null;
  if (a && b) return sport === 'badminton' ? `${a} → ${b}` : `${a} – ${b}`;
  return a ? `≥ ${a}` : `≤ ${b}`;
}

// Short tag next to a name: "DUPR 3.5" (pickleball) or "TB+" (badminton).
export function levelTag(value, sport, t) {
  const v = levelText(value, sport, t);
  if (!v) return null;
  return sport === 'badminton' ? v : `DUPR ${v}`;
}
