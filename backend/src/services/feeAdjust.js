// Tiền thực tế & hoàn phí của từng người trong kèo. Bốn con số, theo dõi riêng:
//   base     — tiền theo bảng giá (giá nhóm giờ / giá kèo), không đổi khi Host điều chỉnh;
//   paid     — khách đã thanh toán: khoản ban đầu (paid_amount, ghi lúc xác nhận) + thu thêm − hoàn phí;
//   actual   — tiền thực tế phải trả (Host nhập bất kỳ lúc nào; trống = theo bảng giá);
//   diff     — actual − paid: > 0 cần thu thêm (hoặc chưa thanh toán), < 0 cần hoàn lại.
// Lịch sử thanh toán ban đầu không bị ghi đè: mỗi điều chỉnh / thu thêm / hoàn phí là một
// dòng participant_fee_changes, khoản tiền có thêm một dòng thu / chi trong sổ quỹ.
const { supabase } = require('../supabase');
const { schemaStatus } = require('./schemaCheck');

const MIGRATION = '20270108090000_fee_adjustments.sql';
async function ready() {
  const s = await schemaStatus();
  return !s.missing_migrations.includes(MIGRATION);
}
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });
const nowIso = () => new Date().toISOString();

const baseFee = (event, p) => Number(p?.fee_amount ?? event.fee_amount ?? 0);
const actualFee = (event, p) => (p?.actual_fee != null ? Number(p.actual_fee) : baseFee(event, p));
// What the first payment brought in (before the columns existed: the price-list fee).
const firstPaid = (event, p) => (p?.fee_paid ? Number(p.paid_amount ?? baseFee(event, p)) : 0);

// The money line of one player from their row and their change history.
function lineFor(event, p, changes = []) {
  const live = changes.filter((c) => c.participant_id === p.id && !c.undone_at);
  const sum = (k) => live.filter((c) => c.kind === k).reduce((s, c) => s + Number(c.amount || 0), 0);
  const collected = sum('collect');
  const refunded = sum('refund');
  const base = baseFee(event, p);
  const actual = actualFee(event, p);
  const first = firstPaid(event, p);
  const paid = first + collected - refunded;
  const diff = actual - paid;
  const last = live.filter((c) => c.kind !== 'adjust').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  // to_collect / to_refund / unpaid = chưa xử lý; collected / refunded = đã xử lý; ok = khớp.
  const state = diff > 0 ? (paid > 0 ? 'to_collect' : 'unpaid') : diff < 0 ? 'to_refund' : last?.kind === 'refund' ? 'refunded' : last?.kind === 'collect' ? 'collected' : 'ok';
  return { participant_id: p.id, base, actual, adjusted: p.actual_fee != null, first_paid: first, collected, refunded, paid, diff, state };
}

async function changesFor(eventId) {
  if (!(await ready())) return [];
  const { data, error } = await supabase.from('participant_fee_changes').select('*').eq('event_id', eventId).order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Every player still on the kèo (not cancelled), with their money line and history.
async function summary(event) {
  if (!(await ready())) return { ready: false, rows: [], changes: [] };
  const { data: parts, error } = await supabase.from('event_participants').select('*').eq('event_id', event.id).neq('status', 'cancelled');
  if (error) throw error;
  const changes = await changesFor(event.id);
  const names = new Map((parts || []).map((p) => [p.id, p.full_name]));
  return {
    ready: true,
    rows: (parts || []).map((p) => ({ ...lineFor(event, p, changes), full_name: p.full_name, status: p.status, fee_paid: !!p.fee_paid })),
    changes: changes.map((c) => ({ ...c, full_name: names.get(c.participant_id) || null })),
  };
}

const money = (v, { allowNull = false } = {}) => {
  if (allowNull && (v === null || v === '')) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 100000000) throw fail('Số tiền phải là số đồng từ 0.', 400, 'bad_amount');
  return n;
};
const cleanNote = (v) => String(v || '').trim().slice(0, 300) || null;

async function guard(p) {
  if (!(await ready())) throw Object.assign(fail('Run the database update first.', 503, 'migration_missing'), { migration: MIGRATION });
  if (p.status === 'cancelled') throw fail('Người đã huỷ: dùng Hoàn tiền ở danh sách huỷ.', 409, 'cancelled');
}

// Host: the real amount this player should pay (null = back to the price list).
async function setActual(event, p, body, userId) {
  await guard(p);
  const amount = money(body?.amount, { allowNull: true });
  const old = p.actual_fee != null ? Number(p.actual_fee) : null;
  if (amount === old) return { participant: p, line: lineFor(event, p, await changesFor(event.id)) };
  const { data, error } = await supabase.from('event_participants').update({ actual_fee: amount }).eq('id', p.id).select().single();
  if (error) throw error;
  const { error: hErr } = await supabase.from('participant_fee_changes').insert({ event_id: event.id, participant_id: p.id, kind: 'adjust', amount, old_amount: old ?? baseFee(event, p), note: cleanNote(body?.note), created_by: userId || null });
  if (hErr) throw hErr;
  return { participant: data, line: lineFor(event, data, await changesFor(event.id)) };
}

// Host: collected the extra / gave money back. Default amount = what the difference says.
async function settle(event, p, body, userId) {
  await guard(p);
  const kind = body?.kind;
  if (!['collect', 'refund'].includes(kind)) throw fail('kind: collect | refund.', 400, 'bad_kind');
  const line = lineFor(event, p, await changesFor(event.id));
  const amount = body?.amount != null && body.amount !== '' ? money(body.amount) : Math.abs(line.diff);
  if (!(amount > 0)) throw fail('Không có chênh lệch để xử lý.', 409, 'nothing_to_settle');
  if (kind === 'refund' && amount > line.paid) throw fail('Hoàn nhiều hơn số khách đã thanh toán.', 409, 'refund_too_much');
  // Nothing paid yet: the first payment is "Đã thu" (fee), not an extra.
  if (kind === 'collect' && !p.fee_paid) throw fail('Khách chưa thanh toán: bấm Đã thu.', 409, 'not_paid_yet');
  const txn = kind === 'collect'
    ? { type: 'income', category: 'event_fee', note: `Extra fee from ${p.full_name}` }
    : { type: 'expense', category: 'refund', note: `Fee refund to ${p.full_name}` };
  const { data: t, error: tErr } = await supabase.from('transactions').insert({ host_id: event.host_id, owner_type: 'event', event_id: event.id, amount, ...txn }).select('id').single();
  if (tErr) throw tErr;
  const { error } = await supabase.from('participant_fee_changes').insert({ event_id: event.id, participant_id: p.id, kind, amount, note: cleanNote(body?.note), txn_id: t.id, created_by: userId || null });
  if (error) throw error;
  return { participant: p, line: lineFor(event, p, await changesFor(event.id)) };
}

// Host: take a "thu thêm" / "hoàn phí" back (marked mistakenly). The history row stays,
// marked undone; its ledger line is voided.
async function undo(event, changeId, userId) {
  if (!(await ready())) throw fail('Run the database update first.', 503, 'migration_missing');
  const { data: c } = await supabase.from('participant_fee_changes').select('*').eq('id', changeId).eq('event_id', event.id).maybeSingle();
  if (!c) throw fail('Change not found.', 404, 'not_found');
  if (c.kind === 'adjust') throw fail('Nhập lại tiền thực tế để đổi.', 409, 'adjust_not_undoable');
  if (c.undone_at) throw fail('Đã hoàn tác.', 409, 'already_undone');
  if (c.txn_id) await supabase.from('transactions').update({ is_voided: true, voided_at: nowIso(), void_reason: 'fee settlement taken back' }).eq('id', c.txn_id);
  const { error } = await supabase.from('participant_fee_changes').update({ undone_at: nowIso(), undone_by: userId || null }).eq('id', c.id);
  if (error) throw error;
  return { ok: true };
}

// Amount still owed by players (for debts): actual − paid when > 0, by participant id.
async function owedMap(rows) {
  const out = new Map();
  if (!rows.length) return out;
  const ok = await ready();
  const ids = rows.map((r) => r.id);
  const changes = [];
  if (ok) {
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('participant_fee_changes').select('participant_id, kind, amount, undone_at, created_at').in('participant_id', ids.slice(i, i + 200));
      changes.push(...(data || []));
    }
  }
  for (const r of rows) out.set(r.id, lineFor(r.event || {}, r, changes));
  return out;
}

module.exports = { MIGRATION, ready, baseFee, actualFee, firstPaid, lineFor, summary, setActual, settle, undo, owedMap, changesFor };
