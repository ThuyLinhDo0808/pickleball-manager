'use client';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// Guests' answers to the after-session survey: average stars, level fit, comments, join wishes.
export default function EventSurveys({ eventId }) {
  const { t } = useI18n();
  const { data } = useLoad(() => api.get(`/api/events/${eventId}/surveys`).catch(() => null), [eventId]);
  if (!data) return null;
  return (
    <section className="card mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 className="text-white font-semibold">{t('survey.hostTitle')}</h2>
        {data.count > 0 && (
          <span className="text-sm text-gray-300">
            <span className="text-amber-300 font-bold">★ {data.average}</span> · {t('survey.hostCount', { n: data.count })}
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
                {s.level_fit && <span className="text-[11px] rounded border border-navy-500 text-gray-300 px-1">{t(`survey.level_${s.level_fit}`)}</span>}
                {s.wants_join && <span className="text-[11px] rounded border border-lime-400/60 text-lime-300 px-1">{t('survey.wantsJoin')}</span>}
              </div>
              {s.comment && <p className="text-gray-300 mt-0.5">“{s.comment}”</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
