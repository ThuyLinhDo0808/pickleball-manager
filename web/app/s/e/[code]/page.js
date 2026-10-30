'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import HomeLink from '@/components/HomeLink';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { whenText } from '@/lib/surveyTime';

// The session's shared survey link / QR (the Host posts it in the group chat): everyone
// who played picks their own name and goes on to their own survey. Names only — no phone.
export default function EventSurveyLink() {
  const { code } = useParams();
  const { t, lang, setLang } = useI18n();
  const { data, error, loading } = useLoad(() => api.publicGet(`/api/public/surveys/event/${code}`), [code]);
  const [q, setQ] = useState('');
  const langToggle = (
    <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 min-h-[36px]">
      {lang === 'vi' ? 'EN' : 'VI'}
    </button>
  );
  if (loading && !data) return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('common.loading')}</div>;
  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-300">{error?.status === 404 ? t('survey.notFound') : t('public.loadError')}</p>
        {langToggle}
      </div>
    );
  }
  const e = data.event;
  const time = hhmm(e.start_time);
  const key = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const list = data.people.filter((p) => !q.trim() || key(p.name).includes(key(q.trim())));
  return (
    <div className="min-h-screen max-w-md mx-auto px-4 pt-safe pb-safe-4">
      <header className="flex items-center justify-between py-4">
        <span className="text-lime-400 font-bold break-words">{data.club_name || t('appName')}</span>
        <div className="flex items-center gap-2">
          <HomeLink />
          {langToggle}
        </div>
      </header>
      <section className="card mb-4">
        <p className="text-gray-400 text-xs">{t('survey.kicker')}</p>
        <h1 className="text-white text-xl font-bold">{t('survey.linkTitle')}</h1>
        <p className="text-gray-300 text-sm mt-1">
          {e.title} · <span className="capitalize">{formatDay(e.event_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
          {time && ` · ${time}`}
          {e.location && ` · ${e.location}`}
        </p>
      </section>
      {data.state === 'closed' && <p className="card text-gray-300 text-sm">{t('survey.closed')}</p>}
      {data.state === 'not_yet' && <p className="card text-gray-300 text-sm">{t('survey.linkNotYet', { when: whenText(data.opens_at, lang) })}</p>}
      {data.state === 'open' && (
        <section className="card !p-0 overflow-hidden mb-4">
          <div className="px-4 pt-4 pb-3 border-b border-navy-700">
            <p className="text-white font-semibold">{t('survey.pickName')}</p>
            <p className="text-gray-400 text-sm mt-0.5">{t('survey.openUntil', { when: whenText(data.closes_at, lang) })}</p>
            {data.people.length > 8 && (
              <input className="input mt-3" type="search" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder={t('survey.findName')} aria-label={t('survey.findName')} />
            )}
          </div>
          {!data.people.length && <p className="text-gray-400 text-sm px-4 py-3">{t('survey.linkEmpty')}</p>}
          {data.people.length > 0 && !list.length && <p className="text-gray-400 text-sm px-4 py-3">{t('survey.noName')}</p>}
          <ul>
            {list.map((p) => (
              <li key={p.token} className="border-b border-navy-700 last:border-b-0">
                {p.done ? (
                  <span className="flex items-center justify-between gap-3 px-4 min-h-[52px] text-gray-500">
                    <span className="break-words">{p.name}</span>
                    <span className="text-xs shrink-0">✓ {t('survey.linkDone')}</span>
                  </span>
                ) : (
                  <Link href={`/s/${p.token}`} className="flex items-center justify-between gap-3 px-4 min-h-[52px] text-white hover:bg-navy-800">
                    <span className="break-words">{p.name}</span>
                    <span className="text-lime-300 text-sm shrink-0">{t('survey.linkGo')} →</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-gray-500 text-xs text-center">{t('survey.linkNote')}</p>
    </div>
  );
}
