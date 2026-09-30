// Standard ledger categories. Anything else a Host types is kept as free text.
export const INCOME_CATEGORIES = ['membership', 'event_fee', 'prize', 'other'];
export const EXPENSE_CATEGORIES = ['court', 'balls', 'water', 'coach', 'prize', 'other'];
const KNOWN = new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]);

export function categoryLabel(category, t) {
  if (!category) return t('fin.cat_other');
  return KNOWN.has(category) ? t(`fin.cat_${category}`) : category;
}

// Chart colours validated on the dark card surface #16223b (dataviz validator):
// categorical slots 1-2, CVD ΔE 26.8, contrast >= 3:1.
export const INCOME_COLOR = '#3987e5';
export const EXPENSE_COLOR = '#d95926';
