'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { formatVnd } from '@/lib/format';

const fmtDay = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '');
const fmtHours = (h) => (Math.abs(h) >= 10 ? Math.round(h) : Math.round(h * 10) / 10);

// "Hoàn 100% / 50% / Không hoàn" with the amount when the fee is known.
export function RefundText({ percent, fee }) {
  const { t } = useI18n();
  const amount = fee > 0 ? Math.round((fee * percent) / 100) : 0;
  if (percent === 0) return <>{t('cancelx.refund0')}</>;
  return <>{t(percent === 100 ? 'cancelx.refund100' : 'cancelx.refund50')}{amount > 0 ? ` (${formatVnd(amount)})` : ''}</>;
}

// One cancellation / no-show line (player history and the Host's pop-up).
// fee + paid known (player history, Host's list): money back or still owed; otherwise the tier.
export function CancelLine({ item, fee = 0, paid = null }) {
  const { t } = useI18n();
  if (item.status === 'no_show') return <span className="text-red-300">{t('cancelx.noShow')}</span>;
  const parts = [];
  if (item.hours_before != null) parts.push(item.hours_before >= 0 ? t('cancelx.hoursBefore', { h: fmtHours(item.hours_before) }) : t('cancelx.afterStart'));
  return (
    <span>
      {parts.join(' · ')}
      {item.refund_percent != null && (
        <span className={item.refund_percent === 100 ? 'text-lime-300' : item.refund_percent === 50 ? 'text-amber-200' : 'text-orange-300'}>
          {parts.length ? ' · ' : ''}
          {paid === true && fee > 0 ? (
            <RefundText percent={item.refund_percent} fee={fee} />
          ) : paid === false && fee > 0 ? (
            item.refund_percent === 100 ? t('cancelx.noFee') : t('cancelx.owes', { p: 100 - item.refund_percent, amount: formatVnd(Math.round((fee * (100 - item.refund_percent)) / 100)) })
          ) : (
            t(`cancelx.tier${item.refund_percent}`)
          )}
        </span>
      )}
      {item.by && <span className="text-gray-500"> · {t(item.by === 'host' ? 'cancelx.byHost' : 'cancelx.byPlayer')}</span>}
      {item.reason && <span className="block text-gray-300">“{item.reason}”</span>}
    </span>
  );
}

// On the Host's participant list: how often this player cancelled / didn't come
// before (same club or community, last 180 days). Click for the list.
export function CancelHistoryBadge({ name, history }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!history || !(history.cancels || history.no_shows)) return null;
  const bad = history.late + history.no_shows;
  const tone = bad >= 2 ? 'border-red-400/70 text-red-300' : bad === 1 ? 'border-orange-400/60 text-orange-300' : 'border-navy-500 text-gray-300';
  const label = [
    history.cancels ? t('cancelx.badgeCancels', { n: history.cancels }) : null,
    history.late ? t('cancelx.badgeLate', { n: history.late }) : null,
    history.no_shows ? t('cancelx.badgeNoShows', { n: history.no_shows }) : null,
  ].filter(Boolean).join(' · ');
  return (
    <>
      <button type="button" className={`text-[10px] rounded border px-1 hover:bg-white/5 ${tone}`} title={t('cancelx.badgeHint')} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        {label}
      </button>
      <Modal open={open} title={t('cancelx.historyTitle', { name })} onClose={() => setOpen(false)}>
        <p className="text-gray-400 text-xs mb-3">{t('cancelx.historyHint', { days: history.days })}</p>
        <ul className="flex flex-col divide-y divide-navy-700 text-sm">
          {history.items.map((i, k) => (
            <li key={k} className="py-2">
              <span className="text-white">{fmtDay(i.event_date)} · {i.title}</span>
              <span className="block text-xs text-gray-400 mt-0.5"><CancelLine item={i} /></span>
            </li>
          ))}
        </ul>
        {history.cancels + history.no_shows > history.items.length && <p className="text-gray-500 text-xs mt-2">{t('cancelx.more', { n: history.cancels + history.no_shows - history.items.length })}</p>}
        <p className="text-gray-400 text-xs mt-3">{t('cancelx.decideHint')}</p>
      </Modal>
    </>
  );
}

const QUICK = ['busy', 'sick', 'weather', 'travel'];

// Confirm a cancellation: what comes back under the policy, and an optional reason
// (kept in the history; the Host sees it). host=true: the Host cancels for someone.
export function CancelDialog({ open, name, percent, fee, paid = true, usesSession = false, host = false, busy = false, error = '', onClose, onConfirm }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const pick = (k) => setReason(t(`cancelx.quick_${k}`));
  return (
    <Modal open={open} title={host ? t('cancelx.hostTitle', { name }) : t('cancelx.title')} onClose={onClose}>
      <div className={`rounded-lg border px-3 py-2 text-sm mb-3 ${percent === 100 ? 'border-lime-400/50 bg-lime-400/10 text-lime-200' : percent === 50 ? 'border-amber-300/50 bg-amber-300/10 text-amber-100' : 'border-orange-400/60 bg-orange-400/10 text-orange-200'}`}>
        {usesSession ? (
          t(percent === 100 ? 'cancelx.sessionBack' : 'cancelx.sessionUsed')
        ) : paid || !(fee > 0) ? (
          <RefundText percent={percent} fee={fee} />
        ) : percent === 100 ? (
          t('cancelx.owe100')
        ) : (
          t('cancelx.oweRest', { amount: formatVnd(Math.round((fee * (100 - percent)) / 100)), p: 100 - percent })
        )}
        {percent < 100 && <span className="block text-xs mt-1 opacity-90">{t('cancelx.lateNote')}</span>}
      </div>
      <label className="text-xs text-gray-400" htmlFor="cancel-reason">{host ? t('cancelx.reasonHost') : t('cancelx.reason')}</label>
      <div className="flex flex-wrap gap-1.5 my-1.5">
        {QUICK.map((k) => (
          <button key={k} type="button" className="text-xs rounded-full border border-navy-600 px-2 py-0.5 text-gray-200 hover:border-lime-400" onClick={() => pick(k)}>{t(`cancelx.quick_${k}`)}</button>
        ))}
      </div>
      <textarea id="cancel-reason" className="input" rows={2} maxLength={300} value={reason} placeholder={t('cancelx.reasonPh')} onChange={(e) => setReason(e.target.value)} />
      <p className="text-gray-500 text-xs mt-1">{host ? t('cancelx.reasonHostHint') : t('cancelx.reasonHint')}</p>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" className="btn-secondary text-sm" onClick={onClose} disabled={busy}>{t('cancelx.keep')}</button>
        <button type="button" className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold px-3 py-1.5 text-sm" disabled={busy} onClick={() => onConfirm(reason.trim())}>{busy ? '…' : t('cancelx.confirm')}</button>
      </div>
    </Modal>
  );
}
