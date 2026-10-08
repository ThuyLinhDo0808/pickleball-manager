// Ledger categories, sized for a club: it collects a monthly fund for court + balls +
// water; anything else is "Khác" (with a note) and collected separately.
export const INCOME_CATEGORIES = ['membership', 'event_fee', 'tournament_fee', 'monthly_fund', 'other'];
export const EXPENSE_CATEGORIES = ['court', 'balls', 'water', 'other'];
// What the Host picks by hand (the rest are written by the app: plans, event fees…).
export const MANUAL_INCOME = ['monthly_fund', 'other'];
// 'meeting': a get-together's surplus moved into the fund / a shortfall it paid.
// 'coach', 'prize': older entries keep their label.
const KNOWN = new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, 'meeting', 'coach', 'prize']);

export function categoryLabel(category, t) {
  if (!category) return t('fin.cat_other');
  return KNOWN.has(category) ? t(`fin.cat_${category}`) : category;
}

// Chart colours validated on the dark card surface #16223b (dataviz validator):
// categorical slots 1-2, CVD ΔE 26.8, contrast >= 3:1.
export const INCOME_COLOR = '#3987e5';
export const EXPENSE_COLOR = '#d95926';
