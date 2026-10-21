'use client';
import { policyText } from '@/lib/cancelPolicy';
import HomeLink from '@/components/HomeLink';
import MapLink from '@/components/MapLink';
import { useEffect } from 'react';
import { eventLevelText, levelText } from '@/lib/levels';
import { useParams } from 'next/navigation';
import EventSignup from '@/components/EventSignup';
import PlayerEventLive from '@/components/PlayerEventLive';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import { localDate } from '@/lib/dates';

function locale(lang) {
  return lang === 'vi' ? 'vi-VN' : 'en-GB';
}

function formatDate(ymd, lang) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return localDate(new Date(y, m - 1, d), locale(lang), { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
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
// Players on the main list / waitlist: gender, DUPR doubles rating, its reliability and the
// matches recorded here that were sent to DUPR (badminton: the level instead of DUPR).
function PlayerTable({ rows, sport, muted = false }) {
  const { t } = useI18n();
  const badminton = sport === 'badminton';
  return (
    <>
      <ol className="flex flex-col divide-y divide-navy-700">
        {rows.map((p, i) => (
          <li key={i} className="py-2 text-sm">
            <div className={muted ? 'text-gray-400' : 'text-gray-200'}>
              <span className="text-gray-500 w-6 inline-block">{i + 1}.</span>
              {p.full_name}
              {p.status === 'pending' && <span className="ml-2 text-[11px] text-sky-300">({t('signup.pendingShort')})</span>}
            </div>
            {/* Giới tính | DUPR | Uy tín (DUPR reliability). Self-entered levels are not shown:
                they say little. Badminton: the level instead of DUPR. */}
            <div className="mt-0.5 ml-6 text-xs text-gray-400 tabular-nums">
              {[
                p.gender ? <span key="g" className={p.gender === 'male' ? 'text-sky-300' : 'text-pink-300'}>{t(`members.${p.gender}`)}</span> : null,
                badminton
                  ? p.dupr_level != null ? <span key="l">{t('public.colLevel')} {levelText(p.dupr_level, sport, t)}</span> : null
                  : p.dupr != null ? <span key="d">DUPR <b className="text-lime-300">{p.dupr.toFixed(2)}</b></span> : <span key="d" className="text-gray-500">{t('public.noDupr')}</span>,
                !badminton && p.dupr != null && p.dupr_rel != null ? <span key="r">{t('public.reliability')} {p.dupr_rel}%</span> : null,
              ]
                .filter(Boolean)
                .reduce((out, x, i) => (i ? [...out, <span key={`s${i}`} className="text-gray-600"> | </span>, x] : [x]), [])}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

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
  const level = eventLevelText(ev, ev.sport, t) || t('public.anyLevel');
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
        {(ev.location || ev.map_url) && <p className="mt-1"><MapLink location={ev.location} mapUrl={ev.map_url} /></p>}
        {ev.play_format && <p className="text-gray-300 text-sm mt-1">🏓 {t(`fmt.${ev.play_format}`)}</p>}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <Info label={t('public.fee')} value={ev.groups?.length ? t('egroups.feeFrom', { amount: `${Math.min(...ev.groups.map((g) => Number(g.fee_amount) || 0)).toLocaleString('vi-VN')} ₫` }) : Number(ev.fee_amount) ? `${Number(ev.fee_amount).toLocaleString('vi-VN')} ₫` : t('public.free')} />
          <Info label={t('public.level')} value={level} />
          {!(ev.groups?.length > 0) && <Info label={t('egroups.courtNo')} value={ev.court_labels || ev.courts} />}
          <Info label={t('events.slots')} value={`${ev.main_count}/${ev.slots}`} />
        </div>
        {/* Kèo with time groups: each with its hours, fee and places left. */}
        {ev.groups?.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {ev.groups.map((g, i) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-navy-900 px-3 py-2">
                <span className="text-white font-semibold">
                  🏟 {t('egroups.courtN', { n: g.courts || i + 1 })}
                  {g.play_format && <span className="ml-1.5 rounded-full border border-sky-400/60 px-1.5 text-[11px] font-normal text-sky-200">{t(`fmt.${g.play_format}`)}</span>}
                </span>
                <span className="text-gray-200 tabular-nums">🕒 {g.start_time}–{g.end_time} · {Number(g.fee_amount) ? `${Number(g.fee_amount).toLocaleString('vi-VN')} ₫` : t('public.free')}</span>
                <span className={g.left > 0 ? 'text-lime-300 text-xs' : 'text-amber-300 text-xs'}>{g.left > 0 ? t('egroups.left', { n: g.left, total: g.slots }) : t('egroups.full')}</span>
              </li>
            ))}
          </ul>
        )}
        {ev.services && <p className="text-gray-300 text-sm mt-2">🎁 {t('svc.included')}: <span className="text-white">{ev.services}</span></p>}
      </section>

      {(ev.cancel_deadline_hours != null || ev.no_refund) && (
        <p className="card mb-4 !py-3 text-sm text-gray-300">
          ⏰ {policyText(t, ev.cancel_deadline_hours, ev.cancel_half_hours, ev.no_refund)}.
          <span className="block text-xs text-gray-500 mt-1">{t('policy.publicNote')}</span>
        </p>
      )}

      {ev.notice && (
        <section className="card mb-4 border-lime-400/40">
          <h2 className="text-lime-400 text-xs font-semibold mb-1">{t('public.hostNotice')}</h2>
          <p className="text-gray-200 text-sm whitespace-pre-line">{ev.notice}</p>
        </section>
      )}

      <section className="card mb-4">
        <EventSignup ev={ev} me={me} meError={meError} user={user} token={token} onChanged={refresh} />
      </section>

      {/* Players with a place: who plays on which court, scores, session rankings. */}
      <PlayerEventLive token={ev.public_token || token} sport={ev.sport} />

      <section className="card mb-6">
        <h2 className="text-white font-semibold mb-2">
          {t('public.playerList')} <span className="text-gray-400 font-normal">({main.length}/{ev.slots})</span>
        </h2>
        {main.length === 0 && <p className="text-gray-400 text-sm">{t('public.nobody')}</p>}
        {main.length > 0 && <PlayerTable rows={main} sport={ev.sport} />}
        {waitlist.length > 0 && (
          <>
            <h3 className="text-gray-300 text-sm font-semibold mt-4 mb-1">
              {t('events.waitlist')} ({waitlist.length})
            </h3>
            <PlayerTable rows={waitlist} sport={ev.sport} muted />
          </>
        )}
      </section>

      <p className="text-center text-gray-600 text-xs pb-4">{t('public.poweredBy')}</p>
    </div>
  );
}
