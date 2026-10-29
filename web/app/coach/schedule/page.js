'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import EventCalendar from '@/components/EventCalendar';
import DatePopover from '@/components/DatePopover';
import PageHeader from '@/components/ui/PageHeader';
import Segmented from '@/components/ui/Segmented';
import Hint from '@/components/ui/Hint';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import EmptyState from '@/components/ui/EmptyState';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { addDays, addMonths, formatDay, monthTitle, todayYmd, weekDays } from '@/lib/dates';
import { CoachGate } from '@/components/coach/CoachGate';
import { endTime } from '@/lib/coach';
import { SessionRow } from '@/components/coach/SessionRow';

const VIEWS = ['list', 'year', 'month', 'week', 'day'];
// A coach session drawn like a club event on the shared calendar.
const STATUS = { scheduled: 'open', done: 'completed', cancelled: 'cancelled' };
const asEvent = (s) => ({
  id: s.id,
  title: s.class_title || '',
  event_date: s.session_date,
  start_time: s.start_time,
  end_time: `${endTime(s.start_time, s.duration_min)}:00`,
  status: STATUS[s.status] || 'open',
  location: s.court_name,
  href: `/coach/sessions/${s.id}`,
  noActions: true,
});

// Lịch dạy: the same views as the club's Lịch hoạt động — list (upcoming, by day), year,
// month, week, day — over every session of every class.
export default function CoachSchedulePage() {
  const { t, lang } = useI18n();
  const today = todayYmd();
  const [view, setView] = useState('list');
  const [date, setDate] = useState(today);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    if (phone && view === 'week') setView('month');
  }, [phone, view]);

  // What to load: the whole year for the year view, a wide month otherwise, the next 90
  // days for the list.
  const range = useMemo(() => {
    if (view === 'list') return [addDays(today, -30), addDays(today, 90)];
    if (view === 'year') return [`${date.slice(0, 4)}-01-01`, `${date.slice(0, 4)}-12-31`];
    if (view === 'month') return [addDays(`${date.slice(0, 7)}-01`, -7), addDays(addMonths(`${date.slice(0, 7)}-01`, 1), 7)];
    const w = weekDays(date);
    return [w[0], w[6]];
  }, [view, date, today]);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/coach/sessions?from=${range[0]}&to=${range[1]}`), [range[0], range[1]]);
  const sessions = data || [];
  const events = useMemo(() => sessions.map(asEvent), [sessions]);
  const marks = useMemo(() => events.reduce((m, e) => ({ ...m, [e.event_date]: (m[e.event_date] || 0) + 1 }), {}), [events]);

  const step = { year: (n) => addMonths(date, 12 * n), month: (n) => addMonths(date, n), week: (n) => addDays(date, 7 * n), day: (n) => addDays(date, n) }[view];
  const week = weekDays(date);
  const title =
    view === 'year'
      ? t('cal.yearTitle', { y: date.slice(0, 4) })
      : view === 'month'
        ? monthTitle(date, lang)
        : view === 'week'
          ? `${formatDay(week[0], lang, { day: 'numeric', month: 'numeric' })} – ${formatDay(week[6], lang, { day: 'numeric', month: 'numeric', year: 'numeric' })}`
          : formatDay(date, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  function openDay(d) {
    setDate(d);
    setView('day');
  }

  // List: upcoming sessions grouped by day (cancelled ones stay, struck out).
  const endedMs = (s) => Date.parse(`${s.session_date}T${String(s.start_time).slice(0, 8)}`) + Number(s.duration_min || 0) * 60000;
  // Past sessions still "scheduled" = not taken attendance yet.
  const toMark = useMemo(() => sessions.filter((s) => s.status === 'scheduled' && endedMs(s) < Date.now()), [sessions]);
  const days = useMemo(() => {
    const out = [];
    for (const s of sessions) {
      if (s.session_date < today) continue;
      const last = out[out.length - 1];
      if (last && last.date === s.session_date) last.items.push(s);
      else out.push({ date: s.session_date, items: [s] });
    }
    return out;
  }, [sessions]);

  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader
          icon="schedule"
          title={t('coach.schedule')}
          subtitle={t('coach.scheduleLead')}
          hint={<Hint inline text={t('coach.scheduleHint')} />}
          actions={<Link href="/coach/classes/new" className="btn-primary">+ {t('coach.classNew')}</Link>}
        />
        <div className="card !p-3 mb-4 flex flex-wrap items-center gap-2">
          <Segmented items={phone ? VIEWS.filter((v) => v !== 'week') : VIEWS} value={view} onChange={setView} label={(v) => t(`cal.${v}`)} />
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
        {loading && !data && <LoadingBlock rows={4} className="card" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {data && view !== 'list' && <EventCalendar view={view} date={date} events={events} onPickDay={openDay} onPickMonth={(d) => { setDate(d); setView('month'); }} onChanged={reload} labels={{ yearCount: (n) => t('coach.calCount', { n }), freeDay: t('coach.calFreeDay') }} />}
        {data && view === 'list' && toMark.length > 0 && (
          <section className="card !p-0 overflow-hidden mb-3 border border-amber-300/40">
            <h2 className="px-4 py-2 border-b border-navy-700 text-sm font-semibold text-amber-200">{t('coach.toMark')} <span className="text-gray-500 font-normal">({toMark.length})</span></h2>
            {toMark.map((s) => <SessionRow key={s.id} s={s} lang={lang} onChanged={reload} withClass past />)}
          </section>
        )}
        {data && view === 'list' && days.length === 0 && (
          <EmptyState title={t('coach.listEmpty')} action={<Link href="/coach/classes/new" className="btn-primary">+ {t('coach.classNew')}</Link>}>
            {t('coach.listEmptyHint')}
          </EmptyState>
        )}
        {data && view === 'list' && days.length > 0 && (
          <div className="grid gap-3">
            {days.map((d) => (
              <section key={d.date} className={`card !p-0 overflow-hidden ${d.date === today ? 'border-lime-400/50' : ''}`}>
                <h2 className={`px-4 py-2 border-b border-navy-700 text-sm font-semibold capitalize ${d.date === today ? 'text-lime-300' : 'text-white'}`}>
                  {formatDay(d.date, lang, { weekday: 'long', day: '2-digit', month: '2-digit' })}
                  {d.date === today && <span className="ml-2 text-[11px] rounded-full bg-lime-400/15 px-2 py-0.5">{t('cal.today')}</span>}
                </h2>
                {d.items.map((s) => <SessionRow key={s.id} s={s} lang={lang} onChanged={reload} withClass />)}
              </section>
            ))}
          </div>
        )}
      </CoachGate>
    </AppShell>
  );
}
