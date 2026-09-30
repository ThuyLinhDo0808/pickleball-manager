'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import EventCalendar, { KIND_ICON, STATUS_STYLE, hrefOf } from '@/components/EventCalendar';
import DatePopover from '@/components/DatePopover';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useWorkspace } from '@/context/WorkspaceContext';
import { addDays, addMonths, formatDay, hhmm, monthTitle, todayYmd, weekDays } from '@/lib/dates';

const VIEWS = ['list', 'month', 'week', 'day'];
const VIEW_KEY = 'pickleball_events_view';

// A tournament shown on the calendar (links to its own page; no sign-up counts).
function tournamentAsEvent(tr) {
  return {
    id: `t-${tr.id}`,
    href: `/club/tournaments/${tr.id}`,
    kind: 'tournament',
    title: tr.name,
    event_date: tr.event_date || tr.created_at.slice(0, 10),
    start_time: tr.start_time || null,
    end_time: tr.end_time || null,
    location: tr.location || null,
    status: tr.status === 'completed' ? 'completed' : 'open',
    tstatus: tr.status,
    tkind: tr.kind,
    team_count: tr.team_count,
    slots: null,
  };
}

function EventCard({ e }) {
  const { t, lang } = useI18n();
  return (
    <Link href={hrefOf(e)} className="card hover:border-lime-400 transition flex gap-3">
      <div className={`w-1 shrink-0 rounded-full border ${STATUS_STYLE[e.status]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <span className="text-white font-semibold truncate">{KIND_ICON[e.kind] && `${KIND_ICON[e.kind]} `}{e.title}</span>
          <span className="text-gray-400 text-xs uppercase shrink-0">{e.kind === 'tournament' ? (e.tkind === 'team' && e.tstatus === 'groups' ? t('league.inProgress') : t(`tournaments.status_${e.tstatus}`)) : t(`events.status_${e.status}`)}</span>
        </div>
        <div className="text-gray-400 text-sm">
          {formatDay(e.event_date, lang)} {e.start_time ? `· ${hhmm(e.start_time)}${e.end_time ? `–${hhmm(e.end_time)}` : ''}` : ''} · {e.location || '—'}
        </div>
        <div className="text-gray-300 text-sm mt-1">
          {e.kind && <span className="text-gray-400">{t(`kind.${e.kind}`)} · </span>}
          {e.slots != null ? (
            <>
              {e.main_count}/{e.slots} {t('events.mainList').toLowerCase()}
              {e.waitlist_count > 0 && ` · ${e.waitlist_count} ${t('events.waitlist').toLowerCase()}`}
            </>
          ) : (
            t('tournaments.teamsN', { n: e.team_count })
          )}
        </div>
      </div>
    </Link>
  );
}

// Schedule (Club) / Kèo list (Xé Vé): list or calendar (month / week / day).
export default function EventsPage() {
  const { t, lang } = useI18n();
  const { club } = useDefaultClub();
  const { workspace } = useWorkspace();
  const isClub = workspace === 'club';
  const { data: events, loading } = useLoad(async () => {
    if (!workspace) return [];
    if (!isClub) return api.get('/api/events?scope=standalone');
    if (!club) return [];
    // Everything the club runs in one calendar: weekly play, games/sessions and tournaments.
    const [evs, tours] = await Promise.all([
      api.get(`/api/clubs/${club.id}/events`),
      api.get(`/api/tournaments?club_id=${club.id}`).catch(() => []),
    ]);
    return [...evs, ...tours.map(tournamentAsEvent)];
  }, [workspace, club?.id]);

  const [view, setView] = useState('month');
  const [date, setDate] = useState(todayYmd());
  const [showPast, setShowPast] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (VIEWS.includes(saved)) setView(saved);
    } catch {
      /* private mode */
    }
  }, []);
  function pickView(v) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }

  const all = events || [];
  const marks = useMemo(() => all.reduce((m, e) => ({ ...m, [e.event_date]: (m[e.event_date] || 0) + 1 }), {}), [all]);
  const today = todayYmd();
  const sorted = [...all].sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time || '').localeCompare(b.start_time || ''));
  const upcoming = sorted.filter((e) => e.event_date >= today);
  const past = sorted.filter((e) => e.event_date < today).reverse();

  const step = { month: (n) => addMonths(date, n), week: (n) => addDays(date, 7 * n), day: (n) => addDays(date, n) }[view];
  const week = weekDays(date);
  const title =
    view === 'month'
      ? monthTitle(date, lang)
      : view === 'week'
        ? `${formatDay(week[0], lang, { day: 'numeric', month: 'numeric' })} – ${formatDay(week[6], lang, { day: 'numeric', month: 'numeric', year: 'numeric' })}`
        : formatDay(date, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Clicking a day anywhere (mini calendar, month cell, week header) opens its timeline.
  function openDay(d) {
    setDate(d);
    pickView('day');
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-white text-2xl font-bold">{isClub ? t('nav.schedule') : t('nav.kevents')}</h1>
        {!isClub && (
          <Link href={`/events/create${view === 'day' ? `?date=${date}` : ''}`} className="btn-primary">
            ＋ {t('events.addEvent')}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="grid grid-cols-4 rounded-lg bg-navy-900 border border-navy-700 p-1 text-sm" role="tablist">
          {VIEWS.map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => pickView(v)} className={`whitespace-nowrap rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm ${view === v ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-300 hover:text-white'}`}>
              {t(`cal.${v}`)}
            </button>
          ))}
        </div>
        {view !== 'list' && (
          <>
            <div className="flex items-center gap-1">
              <button type="button" className="btn-secondary !px-3" onClick={() => setDate(step(-1))} aria-label={t('cal.prev')}>‹</button>
              <button type="button" className="btn-secondary !px-3 text-sm" onClick={() => setDate(today)}>{t('cal.today')}</button>
              <button type="button" className="btn-secondary !px-3" onClick={() => setDate(step(1))} aria-label={t('cal.next')}>›</button>
            </div>
            <span className="text-white font-semibold capitalize">{title}</span>
            <DatePopover className="ml-auto" align="right" value={date} marks={marks} onChange={openDay} />
          </>
        )}
      </div>

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}

      {!loading && view !== 'list' && <EventCalendar view={view} date={date} events={all} onPickDay={openDay} />}

      {!loading && view !== 'list' && (
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-400">
          {Object.keys(STATUS_STYLE).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-sm border-l-4 ${STATUS_STYLE[s]}`} />
              {t(`events.status_${s}`)}
            </span>
          ))}
          {isClub && (
            <span className="flex flex-wrap gap-3 basis-full sm:basis-auto sm:ml-auto">
              {Object.entries(KIND_ICON).map(([k, icon]) => (
                <span key={k}>{icon} {t(`kind.${k}`)}</span>
              ))}
            </span>
          )}
        </div>
      )}

      {!loading && view === 'list' && (
        <>
          <h2 className="text-gray-300 text-sm font-semibold mb-2">{t('cal.upcoming')} ({upcoming.length})</h2>
          {upcoming.length === 0 && <p className="text-gray-400 text-sm mb-4">{t('cal.noUpcoming')}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {upcoming.map((e) => <EventCard key={e.id} e={e} />)}
          </div>
          {past.length > 0 && (
            <button type="button" className="text-lime-400 text-sm mb-3" onClick={() => setShowPast(!showPast)}>
              {showPast ? '▾' : '▸'} {t('cal.past')} ({past.length})
            </button>
          )}
          {showPast && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-80">
              {past.map((e) => <EventCard key={e.id} e={e} />)}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
