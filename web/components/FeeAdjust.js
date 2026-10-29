'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import Hint from '@/components/ui/Hint';

// Tiền thực tế & hoàn phí (backend services/feeAdjust.js). Four numbers kept apart: the
// price-list fee, what the player paid, the real amount the Host sets, and the difference
// to collect or give back. The first payment is never changed: each change, extra and
// refund is its own line in the history (and in the ledger).
const STATE_TONE = {
  unpaid: 'text-amber-200 border-amber-300/50',
  to_collect: 'text-amber-200 border-amber-300/50',
  to_refund: 'text-sky-200 border-sky-300/50',
  collected: 'text-lime-300 border-lime-400/40',
  refunded: 'text-lime-300 border-lime-400/40',
  ok: 'text-gray-300 border-navy-500',
};
const hm = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const digits = (v) => String(v ?? '').replace(/\D/g, '');

export function StateChip({ line }) {
  const { t } = useI18n();
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${STATE_TONE[line.state] || ''}`}>{t(`feeadj.st_${line.state}`, { amount: formatVnd(Math.abs(line.diff)) })}</span>;
}

function History({ changes, busy, onUndo }) {
  const { t } = useI18n();
  if (!changes.length) return null;
  return (
    <ul className="mt-3 border-t border-navy-700 pt-2 grid gap-1.5">
      {[...changes].reverse().map((c) => (
        <li key={c.id} className={`flex flex-wrap items-baseline gap-x-2 text-sm ${c.undone_at ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
          <span className="text-gray-500 text-xs tabular-nums">{hm(c.created_at)}</span>
          <span className="flex-1 min-w-[10rem] break-words">
            {c.kind === 'adjust'
              ? t(c.amount == null ? 'feeadj.h_reset' : 'feeadj.h_adjust', { from: formatVnd(c.old_amount), to: formatVnd(c.amount) })
              : t(`feeadj.h_${c.kind}`, { amount: formatVnd(c.amount) })}
            {c.note && <span className="text-gray-400"> · {c.note}</span>}
          </span>
          {c.kind !== 'adjust' && !c.undone_at && (
            <button type="button" disabled={busy} className="text-gray-400 hover:text-white text-xs px-2 min-h-[44px] sm:min-h-0 sm:py-1" onClick={() => onUndo(c)}>↺ {t('feeadj.undo')}</button>
          )}
        </li>
      ))}
    </ul>
  );
}

// The block in a player's sheet: price list / paid / real amount / difference + actions.
export function FeeBlock({ event, row, onChanged }) {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get(`/api/events/${event.id}/fee-adjustments`), [event.id, row.id, row.fee_paid, row.actual_fee]);
  const line = data?.rows?.find((r) => r.participant_id === row.id);
  const changes = (data?.changes || []).filter((c) => c.participant_id === row.id);
  const [actual, setActual] = useState(null); // null = not edited
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (error) return <p className="text-red-300 text-sm">{error.message}</p>;
  if (data && !data.ready) return null; // database update not run yet
  if (!line) return <div className="h-24 rounded-xl bg-navy-800/60 animate-pulse" aria-hidden />;

  async function run(fn) {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      setActual(null);
      setAmount(null);
      setNote('');
      reload();
      onChanged?.();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  const shown = actual ?? String(line.actual);
  const dirty = actual != null && digits(actual) !== String(line.actual);
  const save = (reset = false) => run(() => api.post(`/api/events/${event.id}/participants/${row.id}/actual-fee`, { amount: reset ? null : Number(digits(actual)), note: note.trim() || null }));
  const settleAmt = amount ?? String(Math.abs(line.diff));
  const settle = (kind) => run(() => api.post(`/api/events/${event.id}/participants/${row.id}/settle`, { kind, amount: Number(digits(settleAmt)), note: note.trim() || null }));
  const undo = (c) => window.confirm(t('feeadj.undoAsk', { what: t(`feeadj.h_${c.kind}`, { amount: formatVnd(c.amount) }) })) && run(() => api.post(`/api/events/${event.id}/fee-changes/${c.id}/undo`, {}));
  const Row = ({ label, value, sub }) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-gray-400 text-sm whitespace-nowrap">{label}</span>
      <span className="text-right min-w-0">
        <span className="text-white tabular-nums">{value}</span>
        {sub && <span className="block text-gray-500 text-xs tabular-nums">{sub}</span>}
      </span>
    </div>
  );
  const paidSub = line.collected || line.refunded
    ? [formatVnd(line.first_paid), line.collected ? t('feeadj.subPlus', { amount: formatVnd(line.collected) }) : null, line.refunded ? t('feeadj.subMinus', { amount: formatVnd(line.refunded) }) : null].filter(Boolean).join(' ')
    : null;

  return (
    <section className="rounded-xl border border-navy-600 p-3" aria-labelledby={`fee-${row.id}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 id={`fee-${row.id}`} className="text-white font-semibold text-sm inline-flex items-center gap-1">{t('feeadj.title')} <Hint inline text={t('feeadj.hint')} /></h3>
        <StateChip line={line} />
      </div>
      <Row label={t('feeadj.base')} value={formatVnd(line.base)} />
      <Row label={t('feeadj.paid')} value={line.paid ? formatVnd(line.paid) : <span className="text-gray-500">—</span>} sub={paidSub} />
      <div className="flex flex-wrap items-center justify-between gap-2 py-1">
        <label htmlFor={`act-${row.id}`} className="text-gray-400 text-sm whitespace-nowrap">{t('feeadj.actual')}{line.adjusted && <span className="ml-1 text-[11px] rounded border border-navy-500 px-1 text-gray-300">{t('feeadj.adjustedTag')}</span>}</label>
        <span className="inline-flex items-center gap-2">
          <input id={`act-${row.id}`} className="input !w-32 text-right tabular-nums" inputMode="numeric" value={shown ? Number(digits(shown)).toLocaleString('vi-VN') : ''} onChange={(e) => setActual(digits(e.target.value))} aria-label={t('feeadj.actual')} />
          {dirty && <button type="button" disabled={busy || digits(actual) === ''} className="btn-primary text-sm" onClick={() => save()}>{t('feeadj.save')}</button>}
        </span>
      </div>
      {(dirty || (line.diff !== 0 && line.state !== 'unpaid')) && (
        <input className="input mt-1" maxLength={300} placeholder={t('feeadj.notePh')} value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('feeadj.note')} />
      )}
      {line.adjusted && !dirty && (
        <div className="flex justify-end">
          <button type="button" disabled={busy} className="text-gray-400 hover:text-white text-xs px-2 min-h-[44px] sm:min-h-0 sm:py-1" onClick={() => window.confirm(t('feeadj.resetAsk', { amount: formatVnd(line.base) })) && save(true)}>↺ {t('feeadj.reset')}</button>
        </div>
      )}

      {/* The difference and what to do with it. Not paid at all: "Đã thu" below collects the real amount. */}
      {line.diff !== 0 && !dirty && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-900/60 px-3 py-2">
          <span className="text-sm text-gray-200">
            {t(line.diff > 0 ? (line.paid > 0 ? 'feeadj.needCollect' : 'feeadj.needPay') : 'feeadj.needRefund')}{' '}
            <b className="tabular-nums text-white">{formatVnd(Math.abs(line.diff))}</b>
          </span>
          {line.state === 'unpaid' ? (
            <span className="text-gray-400 text-xs">{t('feeadj.payBelow')}</span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <input className="input !w-28 text-right tabular-nums" inputMode="numeric" value={Number(digits(settleAmt) || 0).toLocaleString('vi-VN')} onChange={(e) => setAmount(digits(e.target.value))} aria-label={t('feeadj.amount')} />
              <button type="button" disabled={busy || !Number(digits(settleAmt))} className="btn-primary text-sm whitespace-nowrap" onClick={() => settle(line.diff > 0 ? 'collect' : 'refund')}>
                {t(line.diff > 0 ? 'feeadj.markCollected' : 'feeadj.markRefunded')}
              </button>
            </span>
          )}
        </div>
      )}
      {msg && <p className="text-red-300 text-sm mt-2">{msg}</p>}
      <History changes={changes} busy={busy} onUndo={undo} />
    </section>
  );
}

// Tài chính tab: everyone whose real amount differs from what they paid (and what was done).
export function FeeDiffs({ event, onOpen }) {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get(`/api/events/${event.id}/fee-adjustments`), [event.id]);
  if (error) return null;
  if (!data) return <div className="card mb-4 h-20 animate-pulse" aria-hidden />;
  if (!data.ready) return null;
  // Not paid and never adjusted is the usual "chưa thu" (shown on the players tab), not a difference.
  const rows = data.rows.filter((r) => r.adjusted || r.collected || r.refunded || (r.fee_paid && r.diff !== 0));
  const open = rows.filter((r) => r.diff !== 0 && r.state !== 'unpaid');
  const toCollect = open.filter((r) => r.diff > 0).reduce((s, r) => s + r.diff, 0);
  const toRefund = open.filter((r) => r.diff < 0).reduce((s, r) => s - r.diff, 0);
  return (
    <section className="card !p-0 overflow-hidden mb-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-navy-700">
        <h2 className="text-white font-semibold flex-1 min-w-0 inline-flex items-center gap-1">{t('feeadj.listTitle')} <Hint inline text={t('feeadj.listHint')} /></h2>
        {open.length > 0 && (
          <span className="text-sm text-gray-300 tabular-nums">
            {toCollect > 0 && <span className="mr-3">{t('feeadj.sumCollect')} <b className="text-amber-200">{formatVnd(toCollect)}</b></span>}
            {toRefund > 0 && <span>{t('feeadj.sumRefund')} <b className="text-sky-200">{formatVnd(toRefund)}</b></span>}
          </span>
        )}
        <button type="button" className="text-gray-400 hover:text-white text-xs px-2 min-h-[44px]" onClick={reload}>{t('feeadj.refresh')}</button>
      </div>
      {!rows.length ? (
        <p className="text-gray-500 text-sm px-4 py-3">{t('feeadj.listEmpty')}</p>
      ) : (
        <div className="table-wrap max-sm:!px-4">
          <table className="w-full text-sm grid-table mobile-list !min-w-[36rem]">
            <thead>
              <tr className="text-left">
                <th>{t('feeadj.player')}</th>
                <th className="text-right">{t('feeadj.base')}</th>
                <th className="text-right">{t('feeadj.paid')}</th>
                <th className="text-right">{t('feeadj.actual')}</th>
                <th className="text-right">{t('feeadj.diff')}</th>
                <th>{t('feeadj.state')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.participant_id}>
                  <td className="first !whitespace-normal break-words">
                    {onOpen ? <button type="button" className="text-white hover:text-lime-300 text-left min-h-[44px] sm:min-h-0" onClick={() => onOpen(r.participant_id)}>{r.full_name}</button> : <span className="text-white">{r.full_name}</span>}
                  </td>
                  <td className="text-right tabular-nums text-gray-300" data-label={t('feeadj.base')}>{formatVnd(r.base)}</td>
                  <td className="text-right tabular-nums text-gray-300" data-label={t('feeadj.paid')}>{r.paid ? formatVnd(r.paid) : <span className="text-gray-500">—</span>}</td>
                  <td className="text-right tabular-nums text-white" data-label={t('feeadj.actual')}>{formatVnd(r.actual)}</td>
                  <td className={`key text-right tabular-nums font-semibold ${r.diff > 0 ? '!text-amber-200' : r.diff < 0 ? '!text-sky-200' : '!text-gray-500'}`} data-label={t('feeadj.diff')}>{r.diff === 0 ? '—' : `${r.diff > 0 ? '+' : '−'}${formatVnd(Math.abs(r.diff))}`}</td>
                  <td><StateChip line={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
