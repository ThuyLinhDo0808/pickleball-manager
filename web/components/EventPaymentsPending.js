'use client';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { formatDay, hhmm } from '@/lib/dates';

// Finance overview: guests' transfer screenshots waiting for the Host, for the club /
// community whose finance page this is (never another space's).
export default function EventPaymentsPending({ clubId }) {
  const { t, lang } = useI18n();
  const { data } = useLoad(() => (clubId ? api.get(`/api/events/pending-payments?club_id=${clubId}`) : Promise.resolve([])), [clubId]);
  if (!data?.length) return null;
  // Slots of one quick booking (invite link) are one transfer: one line.
  const lines = [];
  const seen = new Map();
  for (const r of data) {
    const g = r.guest_booking_id && seen.get(r.guest_booking_id);
    if (g) {
      g.amount += r.amount;
      g.count += 1;
      continue;
    }
    const line = { ...r, count: 1 };
    if (r.guest_booking_id) seen.set(r.guest_booking_id, line);
    lines.push(line);
  }
  return (
    <section className="card mb-4 border-sky-400/40">
      <h2 className="text-sky-200 font-semibold mb-2">{t('review.financeTitle')} ({lines.length})</h2>
      <div className="flex flex-col divide-y divide-navy-700">
        {lines.map((r) => (
          <Link key={r.id} href={`/events/${r.event.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-lime-400">
            <span className="min-w-0">
              <span className="text-white">{r.booking ? `${r.booking.contact_name} (${t('quick.slotsCount', { n: r.count })})` : r.full_name}</span>
              <span className="block text-gray-400 text-xs break-words">
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
