// Ledger categories, sized for a club: a monthly fund for court + water, ball money
// collected on its own when the balls run out; anything else is "Khác" (with a note).
export const INCOME_CATEGORIES = ['membership', 'event_fee', 'tournament_fee', 'monthly_fund', 'ball_fund', 'other'];
export const EXPENSE_CATEGORIES = ['court', 'balls', 'water', 'other'];
// What the Host picks by hand (the rest are written by the app: plans, event fees, ball
// purchases from the ball store…).
export const MANUAL_INCOME = ['monthly_fund', 'ball_fund', 'other'];
export const MANUAL_EXPENSE = ['court', 'water', 'other'];
// Social Manager (community) sells tickets per kèo: money entered by hand is "Tiền xé vé" or
// "Khác". Money out comes from the kèo's own costs (entered when the kèo is created) and the
// ball store, not from this form.
export const COMMUNITY_MANUAL_INCOME = ['ticket', 'other'];
// 'meeting': a get-together's surplus moved into the fund / a shortfall it paid.
// 'coach', 'prize': older entries keep their label.
const KNOWN = new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, 'ticket', 'meeting', 'coach', 'prize']);

export function categoryLabel(category, t) {
  if (!category) return t('fin.cat_other');
  return KNOWN.has(category) ? t(`fin.cat_${category}`) : category;
}

// Chart colours validated on the dark card surface #16223b (dataviz validator):
// categorical slots 1-2, CVD ΔE 26.8, contrast >= 3:1.
// Income carries the data hue, expenses the neutral second series (lib/chartTheme.js).
export { DATA as INCOME_COLOR, DATA_2 as EXPENSE_COLOR } from '@/lib/chartTheme';

// "Buổi 12/10 · Chơi thứ 7" — which session an entry belongs to.
export function sessionLabel(ev, t) {
  if (!ev) return '';
  const d = ev.event_date ? `${ev.event_date.slice(8, 10)}/${ev.event_date.slice(5, 7)}` : '';
  return t('fin.session', { date: d, title: ev.title || '' });
}

// A sentence for one ledger line: who paid what, or what the Host paid for.
export function describeEntry(r, t) {
  const note = (r.note || '').trim();
  if (r.category === 'event_fee' && /^Extra fee from\s+/i.test(note)) return t('fin.d_extraFee', { name: note.replace(/^Extra fee from\s+/i, '') });
  if (r.category === 'refund' && /^Fee refund to\s+/i.test(note)) return t('fin.d_feeRefund', { name: note.replace(/^Fee refund to\s+/i, '') });
  if (r.category === 'refund' && /^Refund to\s+/i.test(note)) return t('fin.d_cancelRefund', { name: note.replace(/^Refund to\s+/i, '') });
  if (r.category === 'event_fee') {
    const name = note.replace(/^Fee from\s+/i, '');
    return name ? t('fin.d_fee', { name }) : categoryLabel(r.category, t);
  }
  // "Khác" with a note: the note says what it was ("Bạn trả Hoa quả").
  if (r.type === 'expense' && r.event_id && (r.category || 'other') === 'other' && note) return t('fin.d_cost', { what: note });
  if (r.event_cost) return note ? t('fin.d_costNote', { what: categoryLabel(r.category, t), note }) : t('fin.d_cost', { what: categoryLabel(r.category, t) });
  if (r.category === 'membership' && note.includes(' · ')) {
    const [name, period] = note.split(' · ');
    return t('fin.d_membership', { name, period });
  }
  if (r.type === 'expense' && r.event_id) return note ? t('fin.d_costNote', { what: categoryLabel(r.category, t), note }) : t('fin.d_cost', { what: categoryLabel(r.category, t) });
  return note;
}

// Income categories the Host can add by hand on a session.
export const EVENT_INCOME = ['other', 'ball_fund'];
export const EVENT_EXPENSE = ['court', 'water', 'coach', 'other'];
// Social Manager kèo: the court is already in the kèo's cost, so the only extra is more
// court time ("Thuê thêm giờ", kept as the court category) or something else.
export const EVENT_EXPENSE_SOCIAL = ['court', 'other'];
