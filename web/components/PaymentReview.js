'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { localDate } from '@/lib/dates';

// Host: guests holding a place while their payment is checked.
//   proof_submitted       -> view the transfer screenshot, then Confirm / Reject
//   awaiting_proof/rejected -> still transferring (hold countdown); "Paid in cash" confirms
export default function PaymentReview({ event, rows, onChanged }) {
  const { t, lang } = useI18n();
  const [viewing, setViewing] = useState(null); // { p, image }
  const [busy, setBusy] = useState(false);
  if (!rows.length) return null;

  const fee = (p) => Number(p.fee_amount ?? event.fee_amount ?? 0);
  const time = (iso) => (iso ? localDate(new Date(iso), lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }, true) : '');
  // A quick booking (invite link) is one transfer for several slots: one line, one action.
  const groups = [];
  const byBooking = new Map();
  for (const p of rows) {
    if (!p.guest_booking_id) groups.push({ p, rows: [p] });
    else if (byBooking.has(p.guest_booking_id)) byBooking.get(p.guest_booking_id).rows.push(p);
    else {
      const g = { p, rows: [p], booking: p.booking };
      byBooking.set(p.guest_booking_id, g);
      groups.push(g);
    }
  }
  const sorted = groups.sort((a, b) => (a.p.payment_status === 'proof_submitted' ? -1 : 1) - (b.p.payment_status === 'proof_submitted' ? -1 : 1));
  const total = (g) => g.rows.reduce((s, p) => s + fee(p), 0);
  const nameOf = (g) => (g.booking ? `${g.booking.contact_name} (${t('quick.slotsCount', { n: g.rows.length })})` : g.p.full_name);

  async function open(g) {
    try {
      const r = await api.get(`/api/events/${event.id}/participants/${g.p.id}/proof`);
      setViewing({ g, image: r.image });
    } catch (err) {
      // Deleted by the retention rule (PROOF_RETENTION_DAYS after the session).
      if (err.payload?.code === 'proof_purged') return window.alert(t('legal.proofPurged', { date: localDate(new Date(err.payload.purged_at), 'vi-VN') }));
      window.alert(err.message);
    }
  }

  // Confirm / reject cascade to the group on the server; cancel goes slot by slot.
  async function act(g, action, body = {}) {
    setBusy(true);
    try {
      for (const p of ['cancel', 'place'].includes(action) ? g.rows : [g.p]) await api.post(`/api/events/${event.id}/participants/${p.id}/${action}`, body);
      setViewing(null);
      onChanged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reject(g) {
    const note = window.prompt(t('review.rejectAsk'), t('review.rejectDefault'));
    if (note !== null) act(g, 'reject-payment', { note });
  }

  return (
    <div className="card mb-4 border-sky-400/40">
      <h3 className="text-sky-200 font-semibold mb-1">💸 {t('review.title')} ({groups.length})</h3>
      <p className="text-gray-500 text-xs mb-2">{t('review.hint')}</p>
      <div className="flex flex-col divide-y divide-navy-700">
        {sorted.map((g) => {
          const p = g.p;
          return (
          <div key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="text-white">
                {nameOf(g)}
                {g.booking ? (
                  <span className="ml-2 text-[10px] rounded border border-amber-300/60 text-amber-200 px-1">⚡ {t('quick.badge')}</span>
                ) : (
                  <span className="ml-2 text-[10px] rounded border border-navy-500 text-gray-300 px-1">{t(`review.kind_${p.kind}`)}</span>
                )}
                {p.pay_later && <span className="ml-1 text-[10px] rounded border border-sky-400/60 text-sky-300 px-1">🕒 {t('payLater.badge')}</span>}
              </div>
              {g.booking && (
                <div className="text-gray-300 text-xs">
                  📞 <a href={`tel:${g.booking.contact_phone}`} className="text-sky-300">{g.booking.contact_phone}</a> · {g.rows.map((r) => r.full_name).join(', ')}
                </div>
              )}
              <div className="text-gray-400 text-xs">
                {formatVnd(total(g))} · {p.payment_ref || '—'} ·{' '}
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
              {p.has_proof && <button className="text-sky-300 text-xs font-semibold" onClick={() => open(g)}>{t('review.view')}</button>}
              <button className="text-lime-400 text-xs" disabled={busy} onClick={() => window.confirm(t('review.confirmAsk', { name: nameOf(g), amount: formatVnd(total(g)) })) && act(g, 'confirm-payment')}>
                {p.has_proof ? t('review.confirm') : t('review.cash')}
              </button>
              <button className="text-sky-300 text-xs" disabled={busy} title={t('review.toWaitlistHint')} onClick={() => window.confirm(t('review.toWaitlistAsk', { name: nameOf(g) })) && act(g, 'place', { to: 'waitlist' })}>
                ⏳ {t('review.toWaitlist')}
              </button>
              <button className="text-red-400 text-xs" disabled={busy} onClick={() => window.confirm(t('policy.cancelAsk', { name: nameOf(g) })) && act(g, 'cancel')}>
                {t('events.cancel')}
              </button>
            </div>
          </div>
          );
        })}
      </div>

      <Modal open={!!viewing} title={t('review.proofTitle', { name: viewing ? nameOf(viewing.g) : '' })} onClose={() => setViewing(null)}>
        {viewing && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg bg-navy-900 px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">{t('join.amount')}</span><span className="text-white font-semibold">{formatVnd(total(viewing.g))}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">{t('join.note')}</span><span className="text-white font-semibold">{viewing.g.p.payment_ref}</span></div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewing.image} alt="" className="w-full h-auto rounded-lg border border-navy-600" />
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy} onClick={() => act(viewing.g, 'confirm-payment')}>✓ {t('review.confirm')}</button>
              <button className="btn-secondary text-red-300" disabled={busy} onClick={() => reject(viewing.g)}>{t('review.reject')}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
