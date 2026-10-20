'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import PaymentCard from '@/components/PaymentCard';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { localDate } from '@/lib/dates';

// Top 10 cộng đồng uy tín: pay to be shown on the club search; the Owner checks first.
export default function FeaturedPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data, error, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/featured`) : Promise.resolve(null)), [club?.id]);
  const [months, setMonths] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const owner = club && club.role !== 'co_admin';

  async function run(fn) {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  const cur = data?.current;
  const day = (v) => (v ? localDate(`${v}T00:00:00`, 'vi-VN') : '—');

  return (
    <AppShell>
      <PageHeader icon="🏆" title={t('featured.title')} subtitle={club?.name} />
      {error && <p className="text-red-400 text-sm">{error.message}</p>}
      {data && !data.ready && <p className="card text-amber-200 text-sm">{t('featured.migration')}</p>}
      {data?.ready && (
        <div className="max-w-2xl flex flex-col gap-4">
          <section className="card">
            <p className="text-gray-200">{t('featured.what')}</p>
            <ul className="mt-2 text-sm text-gray-300 list-disc pl-5 space-y-1">
              <li>{t('featured.p1')}</li>
              <li>{t('featured.p2')}</li>
              <li>{t('featured.p3')}</li>
            </ul>
          </section>

          {!cur && (
            <section className="card">
              {data.last?.status === 'rejected' && <p className="rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-red-200 mb-3">✕ {t('featured.rejected')}{data.last.owner_note ? `: ${data.last.owner_note}` : ''}</p>}
              <h2 className="text-white font-semibold mb-2">{t('featured.choose')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup">
                {data.months.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={months === m} onClick={() => setMonths(m)} className={`rounded-xl border p-3 text-center ${months === m ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300'}`}>
                    <span className="block text-lg font-bold">{t('plan.nMonths', { n: m })}</span>
                    <span className="block text-xs text-gray-400">{formatVnd(data.price_month * m)}</span>
                  </button>
                ))}
              </div>
              <p className="text-gray-400 text-xs mt-2">{t('featured.slotsLeft', { n: data.slots_left })}</p>
              {owner ? (
                <button type="button" className="btn-primary w-full py-3 mt-3" disabled={busy} onClick={() => run(() => api.post(`/api/clubs/${club.id}/featured`, { months }))}>
                  {t('featured.ask', { amount: formatVnd(data.price_month * months) })}
                </button>
              ) : (
                <p className="text-gray-400 text-sm mt-3">{t('featured.ownerOnly')}</p>
              )}
            </section>
          )}

          {cur && (
            <section className="card">
              <p className="text-lg font-bold text-white">{t(`featured.st_${cur.status}`)}</p>
              {cur.status === 'awaiting_payment' && (
                <>
                  <p className="text-gray-300 text-sm mt-1 mb-3">{t('featured.payHint', { n: cur.months })}</p>
                  <PaymentCard payment={cur.payment} />
                  {owner && <button type="button" className="text-red-300 text-sm mt-3" disabled={busy} onClick={() => window.confirm(t('featured.cancelAsk')) && run(() => api.del(`/api/clubs/${club.id}/featured`))}>{t('featured.cancel')}</button>}
                </>
              )}
              {cur.status === 'in_review' && <p className="text-gray-300 text-sm mt-1">{t('featured.reviewHint')}</p>}
              {cur.status === 'active' && (
                <p className="text-gray-200 mt-1">
                  {t('featured.activeLine', { pos: cur.position, from: day(cur.starts_on), to: day(cur.ends_on) })}
                  {cur.trust_score != null && <span className="block text-sm text-lime-300 mt-1">⭐ {t('featured.trust', { n: cur.trust_score })}</span>}
                </p>
              )}
            </section>
          )}
          {err && <p className="text-red-400 text-sm">{err}</p>}
        </div>
      )}
    </AppShell>
  );
}
