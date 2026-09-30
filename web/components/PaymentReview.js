'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

// Host: guests holding a place while their payment is checked.
//   proof_submitted       -> view the transfer screenshot, then Confirm / Reject
//   awaiting_proof/rejected -> still transferring (hold countdown); "Paid in cash" confirms
export default function PaymentReview({ event, rows, onChanged }) {
  const { t, lang } = useI18n();
  const [viewing, setViewing] = useState(null); // { p, image }
  const [busy, setBusy] = useState(false);
  if (!rows.length) return null;

  const fee = (p) => Number(p.fee_amount ?? event.fee_amount ?? 0);
  const time = (iso) => (iso ? new Date(iso).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');
  const sorted = [...rows].sort((a, b) => (a.payment_status === 'proof_submitted' ? -1 : 1) - (b.payment_status === 'proof_submitted' ? -1 : 1));

  async function open(p) {
    try {
      const r = await api.get(`/api/events/${event.id}/participants/${p.id}/proof`);
      setViewing({ p, image: r.image });
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function act(p, action, body = {}) {
    setBusy(true);
    try {
      await api.post(`/api/events/${event.id}/participants/${p.id}/${action}`, body);
      setViewing(null);
      onChanged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reject(p) {
    const note = window.prompt(t('review.rejectAsk'), t('review.rejectDefault'));
    if (note !== null) act(p, 'reject-payment', { note });
  }

  return (
    <div className="card mb-4 border-sky-400/40">
      <h3 className="text-sky-200 font-semibold mb-1">💸 {t('review.title')} ({rows.length})</h3>
      <p className="text-gray-500 text-xs mb-2">{t('review.hint')}</p>
      <div className="flex flex-col divide-y divide-navy-700">
        {sorted.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="text-white">
                {p.full_name}
                <span className="ml-2 text-[10px] rounded border border-navy-500 text-gray-300 px-1">{t(`review.kind_${p.kind}`)}</span>
              </div>
              <div className="text-gray-400 text-xs">
                {formatVnd(fee(p))} · {p.payment_ref || '—'} ·{' '}
                {p.payment_status === 'proof_submitted' ? (
                  <span className="text-sky-300">{t('review.sent', { at: time(p.payment_submitted_at) })}</span>
                ) : p.payment_status === 'rejected' ? (
                  <span className="text-red-300">{t('review.rejected')}{p.payment_note ? `: ${p.payment_note}` : ''}</span>
                ) : (
                  <span className="text-yellow-300">{t('review.waiting', { at: time(p.hold_expires_at) })}</span>
                )}
              </div>
            </div>
            <div className="flex gap-3 shrink-0">
              {p.has_proof && <button className="text-sky-300 text-xs font-semibold" onClick={() => open(p)}>{t('review.view')}</button>}
              <button className="text-lime-400 text-xs" disabled={busy} onClick={() => window.confirm(t('review.confirmAsk', { name: p.full_name, amount: formatVnd(fee(p)) })) && act(p, 'confirm-payment')}>
                {p.has_proof ? t('review.confirm') : t('review.cash')}
              </button>
              <button className="text-red-400 text-xs" disabled={busy} onClick={() => window.confirm(t('policy.cancelAsk', { name: p.full_name })) && act(p, 'cancel')}>
                {t('events.cancel')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!viewing} title={t('review.proofTitle', { name: viewing?.p.full_name || '' })} onClose={() => setViewing(null)}>
        {viewing && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg bg-navy-900 px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">{t('join.amount')}</span><span className="text-white font-semibold">{formatVnd(fee(viewing.p))}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">{t('join.note')}</span><span className="text-white font-semibold">{viewing.p.payment_ref}</span></div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewing.image} alt="" className="w-full h-auto rounded-lg border border-navy-600" />
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy} onClick={() => act(viewing.p, 'confirm-payment')}>✓ {t('review.confirm')}</button>
              <button className="btn-secondary text-red-300" disabled={busy} onClick={() => reject(viewing.p)}>{t('review.reject')}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
