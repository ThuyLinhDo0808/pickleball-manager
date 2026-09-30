'use client';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { formatDay, hhmm } from '@/lib/dates';

// Finance overview: guests' transfer screenshots waiting for the Host, across all events.
export default function EventPaymentsPending() {
  const { t, lang } = useI18n();
  const { data } = useLoad(() => api.get('/api/events/pending-payments'), []);
  if (!data?.length) return null;
  return (
    <section className="card mb-4 border-sky-400/40">
      <h2 className="text-sky-200 font-semibold mb-2">💸 {t('review.financeTitle')} ({data.length})</h2>
      <div className="flex flex-col divide-y divide-navy-700">
        {data.map((r) => (
          <Link key={r.id} href={`/events/${r.event.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-lime-400">
            <span className="min-w-0">
              <span className="text-white">{r.full_name}</span>
              <span className="block text-gray-400 text-xs truncate">
                {r.event.title} · {formatDay(r.event.event_date, lang)} {hhmm(r.event.start_time)}
              </span>
            </span>
            <span className="text-sky-300 tabular-nums shrink-0">{formatVnd(r.amount)} →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
