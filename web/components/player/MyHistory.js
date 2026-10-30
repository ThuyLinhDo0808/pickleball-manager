'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CancelDialog, CancelLine } from '@/components/CancelHistory';
import { refundIfCancelNow } from '@/lib/cancelPolicy';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';

// My sign-ups (kèo / sessions) in two lists — "Sắp diễn ra" (soonest first) and "Đã diễn ra"
// (newest first) — with the ticket, "pay now", the cancel deadline and "Huỷ" (refund tiers).
// `history` comes from /api/player/me.
const startMs = (h) => new Date(`${h.event_date}T${(h.start_time || '00:00').slice(0, 5)}:00`).getTime();
// Still to come until about 3 hours after it starts (a session in progress stays on top).
const isUpcoming = (h, now = Date.now()) => startMs(h) + 3 * 3600000 > now;
export default function MyHistory({ history, onChanged, onFlash }) {
  const { t, lang } = useI18n();
  const [cancelling, setCancelling] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState('');
  const me = { history };
  function cancelEvent(h) {
    setCancelErr('');
    setCancelling(h);
  }
  async function doCancel(reason) {
    const h = cancelling;
    setCancelBusy(true);
    setCancelErr('');
    try {
      const r = await api.post(`/api/player/participations/${h.participant_id}/cancel`, { reason });
      setCancelling(null);
      const pct = r.refund_percent ?? (r.late ? 0 : 100);
      onFlash?.(pct === 100 ? t('pp.cancelled') : pct === 50 ? t(h.fee_paid ? 'cancelx.doneHalf' : 'cancelx.doneHalfOwe') : t('pp.cancelledLate'));
      onChanged?.();
    } catch (err) {
      setCancelErr(err.message);
    } finally {
      setCancelBusy(false);
    }
  }
  return (
    <section className="card">
        <h2 className="text-white font-semibold mb-2">{t('player.history')}</h2>
        {me.history.length === 0 && <p className="text-gray-400 text-sm">{t('player.noHistory')}</p>}
        {cancelling && (
          <CancelDialog
            open
            percent={refundIfCancelNow({ deadline: cancelling.cancel_deadline, halfDeadline: cancelling.half_deadline, status: cancelling.status })}
            fee={cancelling.fee}
            paid={!!cancelling.fee_paid}
            busy={cancelBusy}
            error={cancelErr}
            onClose={() => setCancelling(null)}
            onConfirm={doCancel}
          />
        )}
        {me.history.length > 0 && [
          ['upcoming', me.history.filter((h) => isUpcoming(h)).sort((a, b) => startMs(a) - startMs(b))],
          ['past', me.history.filter((h) => !isUpcoming(h)).sort((a, b) => startMs(b) - startMs(a))],
        ].map(([part, rows]) => (
        <div key={part} className="mt-3 first-of-type:mt-0">
          <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wide border-b border-navy-700 pb-1.5">
            {t(`player.hist_${part}`)} <span className="text-gray-500 font-normal tabular-nums">({rows.length})</span>
          </h3>
          {rows.length === 0 && <p className="text-gray-500 text-sm py-2">{t(`player.hist_${part}Empty`)}</p>}
        <div className="flex flex-col divide-y divide-navy-700">
          {rows.map((h) => {
            const deadline = h.cancel_deadline && new Date(h.cancel_deadline);
            const fmtAt = (d) => localDate(d, lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }, true);
            const info = (
              <div className="min-w-0">
                <div className="text-white text-sm break-words">{h.title}</div>
                <div className="text-gray-400 text-xs">
                  {localDate(new Date(`${h.event_date}T00:00:00`), lang === 'vi' ? 'vi-VN' : 'en-GB')}
                  {h.start_time ? ` · ${h.start_time.slice(0, 5)}` : ''}
                  {h.club_name ? ` · ${h.club_name}` : ''}
                </div>
                {h.can_cancel && h.status === 'registered' && deadline && (
                  <div className={`text-[11px] ${new Date() > deadline ? 'text-orange-300' : 'text-gray-500'}`}>
                    {new Date() <= deadline
                      ? t('pp.freeUntil', { at: fmtAt(deadline) })
                      : h.half_deadline && new Date() <= new Date(h.half_deadline)
                        ? t('cancelx.halfUntil', { at: fmtAt(new Date(h.half_deadline)) })
                        : t('pp.pastDeadline')}
                  </div>
                )}
                {h.status === 'cancelled' && (h.cancelled_at || h.cancel_reason) && (
                  <div className="text-[11px] text-gray-500">
                    {h.cancelled_at && `${t('cancelx.cancelledAt', { at: fmtAt(new Date(h.cancelled_at)) })} · `}
                    <CancelLine item={{ refund_percent: h.refund_percent, by: h.cancelled_by, reason: h.cancel_reason }} fee={h.fee} paid={!!h.fee_paid} />
                  </div>
                )}
              </div>
            );
            return (
              <div key={h.event_id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  {h.link ? <Link href={`/e/${h.link}`}>{info}</Link> : info}
                  {h.ticket_code && (
                    <Link href={`/t/${h.ticket_code}`} className="text-lime-400 text-xs font-semibold">{t('pp.ticket')}</Link>
                  )}
                  {h.status === 'pending' && h.link && (
                    <Link href={`/e/${h.link}`} className="text-yellow-300 text-xs font-semibold">
                      {h.payment_status === 'proof_submitted' ? t('signup.hostChecking') : t('pp.payNow')}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs ${h.status === 'checked_in' ? 'text-lime-400' : h.status === 'no_show' ? 'text-red-300' : 'text-gray-400'}`}>
                    {t(`player.status_${h.status}`)}
                    {h.late_cancel && h.refund_percent == null && ` · ${t('policy.lateBadge')}`}
                  </span>
                  {h.can_cancel && (
                    <button className="text-red-400 text-xs" onClick={() => cancelEvent(h)}>{t('events.cancel')}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
        ))}
      </section>

  );
}
