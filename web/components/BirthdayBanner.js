'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { todayYmd } from '@/lib/dates';

const HIDE_KEY = 'pickleball_bday_hidden';

// "🎂 Today is X's birthday · in 3 days: Y" — members of the current club whose
// birthday is today or within the next 3 days. Can be hidden for the rest of the day.
export default function BirthdayBanner({ clubId }) {
  const { t } = useI18n();
  const [list, setList] = useState([]);
  const [hidden, setHidden] = useState(false);
  const today = todayYmd();

  useEffect(() => {
    setList([]);
    if (!clubId) return undefined;
    try {
      setHidden(window.localStorage.getItem(HIDE_KEY) === `${clubId}|${today}`);
    } catch {
      /* ignore */
    }
    let alive = true;
    api
      .get(`/api/clubs/${clubId}/birthdays?days=3`)
      .then((rows) => alive && setList(Array.isArray(rows) ? rows : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [clubId, today]);

  if (!list.length || hidden) return null;

  function hide() {
    setHidden(true);
    try {
      window.localStorage.setItem(HIDE_KEY, `${clubId}|${today}`);
    } catch {
      /* ignore */
    }
  }

  const todays = list.filter((m) => m.days === 0);
  const soon = list.filter((m) => m.days > 0);
  const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const when = (n) => (n === 1 ? t('bday.tomorrow') : t('bday.inDays', { n }));

  return (
    <div role="status" className="mb-4 rounded-xl border border-pink-400/50 bg-pink-500/10 px-4 py-3 flex items-start gap-3">
      <span className="text-2xl leading-none" aria-hidden="true">🎂</span>
      <div className="flex-1 min-w-0 text-sm">
        {todays.length > 0 && (
          <p className="text-pink-200">
            <span className="font-semibold text-white">{t('bday.today')}</span>{' '}
            {todays.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ', '}
                <b className="text-white">{m.full_name}</b> ({t('bday.turns', { age: m.age })})
              </span>
            ))}
            {' '}🎉
          </p>
        )}
        {soon.length > 0 && (
          <p className="text-pink-200/90 mt-0.5">
            <span className="font-semibold text-white">{t('bday.soon')}</span>{' '}
            {soon.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ' · '}
                <b className="text-white">{m.full_name}</b> — {when(m.days)} ({dm(m.date)})
              </span>
            ))}
          </p>
        )}
        <p className="text-gray-400 text-xs mt-1">{t('bday.hint')}</p>
      </div>
      <button type="button" onClick={hide} aria-label={t('bday.hide')} title={t('bday.hide')} className="text-gray-400 hover:text-white px-1 text-lg leading-none">
        ×
      </button>
    </div>
  );
}
