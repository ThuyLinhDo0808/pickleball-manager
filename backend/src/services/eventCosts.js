// What one session costs the Host (court hire, water, balls…). Set on the event form
// ("Chi phí mỗi buổi"); each item becomes an expense in the ledger dated on the session
// day, and is re-written whenever the costs change.
const { supabase } = require('../supabase');

// (Balls are bought in the ball store, which books them itself.)
const COST_CATEGORIES = ['court', 'water', 'coach', 'other'];
const MAX_ITEMS = 10;

// Body value -> clean list, or an error message.
function cleanCostItems(v) {
  if (v == null || v === '') return { items: [] };
  if (!Array.isArray(v) || v.length > MAX_ITEMS) return { error: `cost_items must be a list of at most ${MAX_ITEMS} items.` };
  const items = [];
  for (const it of v) {
    const amount = Math.round(Number(it?.amount));
    if (!(Number.isFinite(amount) && amount >= 0 && amount <= 1e10)) return { error: 'cost amount must be 0 or more.' };
    if (amount === 0) continue;
    const category = COST_CATEGORIES.includes(it?.category) ? it.category : 'other';
    const note = it?.note ? String(it.note).trim().slice(0, 120) : null;
    if (category === 'other' && !note) return { error: 'Write what an "other" cost is for.', code: 'cost_note_required' };
    items.push({ category, amount, note });
  }
  return { items };
}

const sameItems = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

// Make the event's ledger match its cost list: void the old cost entries, book the new.
async function syncEventCosts(event) {
  const { data: old, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('event_id', event.id)
    .eq('event_cost', true)
    .eq('is_voided', false);
  if (error) throw error;
  if (old.length) {
    const { error: vErr } = await supabase
      .from('transactions')
      .update({ is_voided: true, voided_at: new Date().toISOString(), void_reason: 'session costs changed' })
      .in('id', old.map((t) => t.id));
    if (vErr) throw vErr;
  }
  const items = Array.isArray(event.cost_items) ? event.cost_items : [];
  if (!items.length) return;
  const { error: iErr } = await supabase.from('transactions').insert(
    items.map((it) => ({
      host_id: event.host_id,
      owner_type: 'event',
      event_id: event.id,
      type: 'expense',
      category: it.category,
      amount: it.amount,
      note: it.note || null,
      occurred_on: event.event_date,
      event_cost: true,
    }))
  );
  if (iErr) throw iErr;
}

module.exports = { COST_CATEGORIES, cleanCostItems, sameItems, syncEventCosts };
