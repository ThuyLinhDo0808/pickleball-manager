'use client';
import HomeLink from '@/components/HomeLink';
import { useEffect } from 'react';
import { levelRange, levelText } from '@/lib/levels';
import { useParams } from 'next/navigation';
import EventSignup from '@/components/EventSignup';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import AnnouncementBanner from '@/components/AnnouncementBanner';

function locale(lang) {
  return lang === 'vi' ? 'vi-VN' : 'en-GB';
}

function formatDate(ymd, lang) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(lang), { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(t) {
  return t ? t.slice(0, 5) : '';
}

function Info({ label, value }) {
  return (
    <div className="bg-navy-900 rounded-lg px-3 py-2">
      <div className="text-gray-400 text-xs">{label}</div>
      <div className="text-white font-semibold text-sm">{value}</div>
    </div>
  );
}

// Player-facing page opened from the link the Host posts in Zalo/Telegram. Anyone can read
// it; signing up needs an account (member vs guest, payment, ticket).
export default function PublicEventPage() {
  const { token } = useParams();
  const { t, lang, setLang, setSport } = useI18n();
  const { user } = useAuth();
  const { data: ev, error, loading, reload } = useLoad(() => api.publicGet(`/api/events/public/${token}`), [token]);
  // Words and levels follow the event's sport (DUPR vs badminton levels).
  useEffect(() => {
    if (ev?.sport) setSport(ev.sport);
  }, [ev?.sport, setSport]);
  const { data: me, error: meError, reload: reloadMe } = useLoad(() => (user ? api.get(`/api/events/public/${token}/me`) : Promise.resolve(null)), [token, user?.id]);
  const refresh = () => {
    reload();
    reloadMe();
  };

  const langToggle = (
    <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
      {lang === 'vi' ? 'EN' : 'VI'}
    </button>
  );

  if (loading && !ev) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('common.loading')}</div>;
  }
  if (error || !ev) {
    // Only a 404 means the link is wrong; anything else is a server problem worth showing.
    const notFound = !error || error.status === 404;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-300">{notFound ? t('public.notFound') : t('public.loadError')}</p>
        {!notFound && <p className="text-gray-500 text-xs break-all">{error.message}</p>}
        {!notFound && <button className="btn-secondary" onClick={reload}>{t('public.retry')}</button>}
        {langToggle}
      </div>
    );
  }

  const main = ev.participants.filter((p) => p.status !== 'waitlisted');
  const waitlist = ev.participants.filter((p) => p.status === 'waitlisted');
  const level = levelRange(ev.level_min, ev.level_max, ev.sport, t) || t('public.anyLevel');
  const time = [formatTime(ev.start_time), formatTime(ev.end_time)].filter(Boolean).join(' – ');

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 pt-safe pb-safe-4">
      <header className="flex items-center justify-between py-4">
        <span className="text-lime-400 font-bold truncate">{ev.club_name || t('appName')}</span>
        <div className="flex items-center gap-2">
          <HomeLink />
          {langToggle}
        </div>
      </header>
      <AnnouncementBanner publicOnly className="mb-3" />

      <section className="card mb-4">
        <h1 className="text-white text-2xl font-bold leading-tight">{ev.title}</h1>
        <p className="text-lime-400 text-sm mt-1 capitalize">
          {formatDate(ev.event_date, lang)}
          {time && ` · ${time}`}
        </p>
        {ev.location && <p className="text-gray-300 text-sm mt-1">📍 {ev.location}</p>}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <Info label={t('public.fee')} value={Number(ev.fee_amount) ? `${Number(ev.fee_amount).toLocaleString('vi-VN')} ₫` : t('public.free')} />
          <Info label={t('public.level')} value={level} />
          <Info label={t('events.courts')} value={ev.courts} />
          <Info label={t('events.slots')} value={`${ev.main_count}/${ev.slots}`} />
        </div>
      </section>

      {ev.cancel_deadline_hours != null && (
        <p className="card mb-4 !py-3 text-sm text-gray-300">
          ⏰ {t('policy.public', { h: ev.cancel_deadline_hours })}
        </p>
      )}

      {ev.notice && (
        <section className="card mb-4 border-lime-400/40">
          <h2 className="text-lime-400 text-xs font-semibold uppercase tracking-wide mb-1">{t('public.hostNotice')}</h2>
          <p className="text-gray-200 text-sm whitespace-pre-line">{ev.notice}</p>
        </section>
      )}

      <section className="card mb-4">
        <EventSignup ev={ev} me={me} meError={meError} user={user} token={token} onChanged={refresh} />
      </section>

      <section className="card mb-6">
        <h2 className="text-white font-semibold mb-2">
          {t('public.players')} <span className="text-gray-400 font-normal">({main.length}/{ev.slots})</span>
        </h2>
        {main.length === 0 && <p className="text-gray-400 text-sm">{t('public.nobody')}</p>}
        <ol className="flex flex-col divide-y divide-navy-700">
          {main.map((p, i) => (
            <li key={i} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-200">
                <span className="text-gray-500 w-6 inline-block">{i + 1}.</span>
                {p.full_name}
                {p.status === 'pending' && <span className="ml-2 text-[11px] text-sky-300">({t('signup.pendingShort')})</span>}
              </span>
              {p.dupr_level != null && <span className="text-gray-400 text-xs">{levelText(p.dupr_level, ev.sport, t)}</span>}
            </li>
          ))}
        </ol>
        {waitlist.length > 0 && (
          <>
            <h3 className="text-gray-300 text-sm font-semibold mt-4 mb-1">
              {t('events.waitlist')} ({waitlist.length})
            </h3>
            <ol className="flex flex-col divide-y divide-navy-700">
              {waitlist.map((p, i) => (
                <li key={i} className="py-2 text-sm text-gray-400">
                  <span className="text-gray-500 w-6 inline-block">{i + 1}.</span>
                  {p.full_name}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <p className="text-center text-gray-600 text-xs pb-4">{t('public.poweredBy')}</p>
    </div>
  );
}
