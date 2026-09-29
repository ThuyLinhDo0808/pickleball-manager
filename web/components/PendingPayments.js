'use client';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

// Memberships players signed up for themselves, waiting for the Host to see the transfer.
export default function PendingPayments({ club }) {
  const { t } = useI18n();
  const { data: rows, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/pending-payments`) : Promise.resolve([])),
    [club?.id]
  );

  async function confirm(r) {
    if (!window.confirm(t('payments.confirmAsk', { amount: formatVnd(r.total), name: r.full_name, ref: r.ref }))) return;
    try {
      await api.post(`/api/clubs/${club.id}/pending-payments/${r.ref}/confirm`, {});
      reload();
    } catch (err) {
      window.alert(err.message);
    }
  }

  if (!rows?.length) return null;

  return (
    <div className="card mb-6 border-yellow-500/40">
      <h2 className="text-yellow-300 font-semibold mb-2">
        {t('payments.pendingTitle')} ({rows.length})
      </h2>
      <div className="flex flex-col divide-y divide-navy-700">
        {rows.map((r) => (
          <div key={r.ref} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0 text-sm">
              <div className="text-white">
                {r.full_name}
                {r.phone && <span className="text-gray-400"> · {r.phone}</span>}
              </div>
              <div className="text-gray-400 text-xs">
                {r.plan_name} · {r.periods.join(', ')} · <span className="text-white font-semibold">{formatVnd(r.total)}</span> ·{' '}
                <span className="font-mono text-lime-300">{r.ref}</span>
              </div>
            </div>
            <button className="btn-primary text-sm" onClick={() => confirm(r)}>{t('payments.confirm')}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
