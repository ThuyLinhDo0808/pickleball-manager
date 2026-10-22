'use client';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// Players' answers to the after-session review: average stars (overall, court,
// organisation), "would come back", level fit, private notes, join wishes.
export default function EventSurveys({ eventId }) {
  const { t } = useI18n();
  const { data } = useLoad(() => api.get(`/api/events/${eventId}/surveys`).catch(() => null), [eventId]);
  if (!data) return null;
  const chip = 'text-[11px] rounded border px-1';
  return (
    <section className="card mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="text-white font-semibold">{t('survey.hostTitle')}</h2>
        {data.count > 0 && (
          <span className="text-sm text-gray-300 flex flex-wrap gap-x-3 gap-y-1">
            <span><span className="text-amber-300 font-bold">★ {data.average}</span> · {t('survey.hostCount', { n: data.count })}</span>
            {data.court != null && <span>{t('survey.hostCourt')} <b className="text-white">{data.court}</b></span>}
            {data.organization != null && <span>{t('survey.hostOrg')} <b className="text-white">{data.organization}</b></span>}
            {data.come_back_rate != null && <span>↩︎ {t('survey.hostComeBack')} <b className="text-white">{data.come_back_rate}%</b></span>}
          </span>
        )}
      </div>
      {data.count === 0 ? (
        <p className="text-gray-500 text-sm">{t('survey.hostEmpty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-navy-700">
          {data.items.map((s, i) => (
            <li key={i} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-white">{s.full_name || '—'}</span>
                <span className="text-amber-300 tracking-wider" aria-label={`${s.rating}/5`}>{'★'.repeat(s.rating)}</span>
                {s.court_rating && <span className={`${chip} border-navy-500 text-gray-300`}>{s.court_rating}/5</span>}
                {s.organization_rating && <span className={`${chip} border-navy-500 text-gray-300`}>{s.organization_rating}/5</span>}
                {s.level_fit && <span className={`${chip} border-navy-500 text-gray-300`}>{t(`survey.level_${s.level_fit}`)}</span>}
                {s.come_back && <span className={`${chip} ${s.come_back === 'no' ? 'border-red-400/50 text-red-300' : 'border-navy-500 text-gray-300'}`}>↩︎ {t(`survey.back_${s.come_back}`)}</span>}
                {s.wants_join && <span className={`${chip} border-lime-400/60 text-lime-300`}>{t('survey.wantsJoin')}</span>}
              </div>
              {s.comment && <p className="text-gray-300 mt-0.5">“{s.comment}”</p>}
            </li>
          ))}
        </ul>
      )}
      <Link href="/club/reviews" className="inline-block mt-3 text-sm text-lime-300 hover:underline">{t('survey.hostAll')} →</Link>
    </section>
  );
}
