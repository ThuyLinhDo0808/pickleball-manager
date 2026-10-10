'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import EventCalendar, { KIND_ICON, LEGEND_STATUSES, STATUS_STYLE, hrefOf } from '@/components/EventCalendar';
import DatePopover from '@/components/DatePopover';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import Segmented from '@/components/ui/Segmented';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useClubs } from '@/context/ClubContext';
import { clubTones, STATUS_MOD } from '@/lib/clubColors';
import { addDays, addMonths, formatDay, hhmm, monthTitle, todayYmd, weekDays } from '@/lib/dates';

const VIEWS = ['list', 'month', 'week', 'day'];
const SOON_DAYS = 3; // "Sắp diễn ra": from now to 3 days ahead
const LIST_GROUPS = ['soon', 'open', 'done'];

// Over already: marked done / cancelled, an earlier day, or today after its end time.
function isOver(e, today, nowHm) {
  if (e.status === 'completed' || e.status === 'cancelled') return true;
  if (e.event_date < today) return true;
  if (e.event_date === today && e.end_time && e.end_time.slice(0, 5) <= nowHm) return true;
  return false;
}

// A tournament shown on the calendar (links to its own page; no sign-up counts).
function tournamentAsEvent(tr, club) {
  return {
    club_id: club.id,
    club_name: club.name,
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
  const full = e.slots != null && e.slots > 0 && (e.main_count || 0) >= e.slots;
  const pct = e.slots ? Math.min(100, Math.round((100 * (e.main_count || 0)) / e.slots)) : 0;
  return (
    <Link href={hrefOf(e)} className={`card !p-0 overflow-hidden hover:border-lime-400 transition flex ${e.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <div className={`w-16 shrink-0 flex flex-col items-center justify-center border-r border-navy-700 py-3 ${e.tone ? e.tone.chip : 'bg-navy-900'}`}>
        <span className="text-[11px] uppercase text-gray-300">{formatDay(e.event_date, lang, { weekday: 'short' })}</span>
        <span className="text-white text-2xl font-bold leading-none tabular-nums">{Number(e.event_date.slice(8, 10))}</span>
        <span className="text-[11px] text-gray-400">{Number(e.event_date.slice(5, 7))}/{e.event_date.slice(2, 4)}</span>
      </div>
      <div className="min-w-0 flex-1 p-3">
        <div className="flex justify-between gap-2">
          <span className={`text-white font-semibold truncate ${e.status === 'cancelled' ? 'line-through' : ''}`}>
            {KIND_ICON[e.kind] && `${e.kind === 'game' && e.sport === 'badminton' ? '🏸' : KIND_ICON[e.kind]} `}
            {e.title}
          </span>
          <span className={`text-[11px] rounded-full border px-2 py-0.5 shrink-0 ${STATUS_STYLE[e.status] || 'border-navy-600 text-gray-300'}`}>
            {e.kind === 'tournament' ? (e.tkind === 'team' && e.tstatus === 'groups' ? t('league.inProgress') : t(`tournaments.status_${e.tstatus}`)) : t(`events.status_${e.status}`)}
          </span>
        </div>
        <div className="text-gray-400 text-sm truncate">
          {e.start_time ? `🕒 ${hhmm(e.start_time)}${e.end_time ? `–${hhmm(e.end_time)}` : ''} · ` : ''}📍 {e.location || '—'}
        </div>
        {e.club_name && (
          <div className="text-sky-300 text-xs mt-0.5 truncate">
            {e.sport === 'badminton' ? '🏸' : '🏓'} {e.club_name}
            {e.kind && <span className="text-gray-500"> · {t(`kind.${e.kind}`)}</span>}
          </div>
        )}
        {e.slots != null ? (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="flex-1 h-1.5 rounded-full bg-navy-900 overflow-hidden">
              <span className={`block h-full rounded-full ${full ? 'bg-amber-400' : 'bg-lime-400'}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="text-gray-300 tabular-nums whitespace-nowrap">
              {e.main_count || 0}/{e.slots}
              {e.waitlist_count > 0 && <span className="text-gray-500"> · +{e.waitlist_count} {t('events.waitlist').toLowerCase()}</span>}
              {e.requested_count > 0 && <span className="text-amber-300"> · 🙋 {t('evlist.requests', { n: e.requested_count })}</span>}
            </span>
          </div>
        ) : (
          <div className="text-gray-300 text-xs mt-1">{t('tournaments.teamsN', { n: e.team_count })}</div>
        )}
      </div>
    </Link>
  );
}

// Schedule (Club) / Kèo list (Xé Vé): list or calendar (month / week / day).
export default function EventsPage() {
  const { t, lang } = useI18n();
  const { club } = useDefaultClub();
  const { clubs } = useClubs();
  const { workspace } = useWorkspace();
  const isClub = workspace === 'club';
  const clubKey = (clubs || []).map((c) => c.id).join(',');
  // Every club the Host runs (pickleball and badminton) in one calendar, each tagged with
  // its club: weekly play, games/sessions and tournaments.
  const { data: events, loading, reload } = useLoad(async () => {
    if (!workspace) return [];
    if (!isClub) return api.get('/api/events?scope=standalone');
    const list = clubs?.length ? clubs : club ? [club] : [];
    const perClub = await Promise.all(
      list.map(async (c) => {
        const [evs, tours] = await Promise.all([
          api.get(`/api/clubs/${c.id}/events`).catch(() => []),
          api.get(`/api/tournaments?club_id=${c.id}`).catch(() => []),
        ]);
        return [...evs, ...tours.map((tr) => tournamentAsEvent(tr, c))].map((e) => ({ ...e, club_name: c.name, sport: c.sport || 'pickleball' }));
      })
    );
    return perClub.flat();
  }, [workspace, clubKey, club?.id]);
  const [clubFilter, setClubFilter] = useState('all');

  // Always opens on the month: the clearest overview. Clicking a day opens its timeline.
  const [view, setView] = useState('month');
  const [date, setDate] = useState(todayYmd());
  // List: search + filters, then three groups (Sắp diễn ra / Đang mở / Đã xong).
  const [q, setQ] = useState('');
  const [kindF, setKindF] = useState('all');
  const [groupF, setGroupF] = useState('all');
  const [showDone, setShowDone] = useState(false);
  const pickView = setView;
  // Phones: the month is a list of the days that have something, and the week grid
  // (7 narrow columns) is left out.
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

  // Each club (and sport) its own colour; status shows as faded (done) / struck out (cancelled).
  const tones = useMemo(() => (isClub ? clubTones(clubs) : {}), [isClub, clubKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = (events || [])
    .filter((e) => clubFilter === 'all' || e.club_id === clubFilter)
    .map((e) => (tones[e.club_id] ? { ...e, tone: tones[e.club_id] } : e));
  const manyClubs = isClub && (clubs || []).length > 1;
  const marks = useMemo(() => all.reduce((m, e) => ({ ...m, [e.event_date]: (m[e.event_date] || 0) + 1 }), {}), [all]);
  const today = todayYmd();
  const sorted = [...all].sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time || '').localeCompare(b.start_time || ''));
  const nowHm = (() => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })();
  const soonEnd = addDays(today, SOON_DAYS);
  const needle = q.trim().toLowerCase();
  const listed = sorted.filter(
    (e) =>
      (kindF === 'all' || e.kind === kindF) &&
      (!needle || [e.title, e.location, e.club_name].filter(Boolean).some((x) => x.toLowerCase().includes(needle)))
  );
  const groups = {
    soon: listed.filter((e) => !isOver(e, today, nowHm) && e.event_date <= soonEnd),
    open: listed.filter((e) => !isOver(e, today, nowHm) && e.event_date > soonEnd),
    done: listed.filter((e) => isOver(e, today, nowHm)).reverse(),
  };
  const kindsPresent = [...new Set(all.map((e) => e.kind).filter(Boolean))];
  const kpi = useMemo(() => {
    const live = all.filter((e) => e.status !== 'cancelled');
    const games = live.filter((e) => e.kind !== 'tournament');
    const inMonth = games.filter((e) => e.event_date.slice(0, 7) === today.slice(0, 7));
    const week = addDays(today, 7);
    const soon = games.filter((e) => e.event_date >= today && e.event_date <= week).sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time || '').localeCompare(b.start_time || ''));
    const ahead = games.filter((e) => e.event_date >= today && e.slots);
    const main = ahead.reduce((n, e) => n + (e.main_count || 0), 0);
    const slots = ahead.reduce((n, e) => n + (e.slots || 0), 0);
    return {
      month: inMonth.length,
      monthDone: inMonth.filter((e) => e.status === 'completed' || e.event_date < today).length,
      week: soon.length,
      next: soon[0] || null,
      tours: live.filter((e) => e.kind === 'tournament' && e.event_date >= today).length,
      main,
      slots,
      fill: slots ? Math.round((100 * main) / slots) : null,
    };
  }, [all, today]);

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
      <PageHeader
        icon={isClub ? '🗓' : '🎟'}
        title={isClub ? t('nav.schedule') : t('nav.kevents')}
        subtitle={isClub ? (manyClubs ? t('calx.allYourClubs', { n: clubs.length }) : club?.name) : t('finX.scopeXeve')}
        actions={
          isClub ? (
            <>
              <Link href="/events/create/weekly" className="btn-secondary text-sm">🔁 {t('nav.createWeekly')}</Link>
              <Link href={`/events/create${view === 'day' ? `?date=${date}` : ''}`} className="btn-primary text-sm">＋ {t('nav.createGame')}</Link>
            </>
          ) : (
            <Link href={`/events/create${view === 'day' ? `?date=${date}` : ''}`} className="btn-primary text-sm">＋ {t('events.addEvent')}</Link>
          )
        }
      />
      <SectionTabs group="activities" />

      {/* Club: sessions and tournaments. Xé Vé sells places, so it shows how full the coming kèo are. */}
      <KpiRow cols={3}>
        <StatTile icon="📅" label={t('calx.thisMonth')} value={kpi.month} sub={t('calx.thisMonthSub', { done: kpi.monthDone })} />
        <StatTile icon="⏭" label={t('calx.next7')} value={kpi.week} tone="text-lime-300" sub={kpi.next ? `${formatDay(kpi.next.event_date, lang, { weekday: 'short', day: 'numeric', month: 'numeric' })} · ${kpi.next.title}` : t('cal.noUpcoming')} />
        {isClub ? (
          <StatTile icon="🏆" label={t('calx.tournaments')} value={kpi.tours} tone="text-amber-300" sub={t('calx.upcomingSub')} />
        ) : (
          <StatTile icon="👥" label={t('calx.fill')} value={kpi.fill == null ? '—' : `${kpi.fill}%`} tone="text-sky-300" sub={t('calx.fillSub', { main: kpi.main, slots: kpi.slots })} />
        )}
      </KpiRow>

      <div className="card !p-3 mb-4 flex flex-wrap items-center gap-2">
        <Segmented items={phone ? VIEWS.filter((v) => v !== 'week') : VIEWS} value={view} onChange={pickView} label={(v) => t(`cal.${v}`)} />
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

      {manyClubs && (
        <div className="flex flex-wrap gap-1.5 mb-3 text-sm" role="tablist">
          {[{ id: 'all', name: t('cal.allClubs') }, ...clubs].map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={clubFilter === c.id}
              onClick={() => setClubFilter(c.id)}
              className={`rounded-full border px-3 py-1 ${clubFilter === c.id ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
            >
              {c.id !== 'all' && <span className={`inline-block h-2.5 w-2.5 rounded-full mr-1.5 align-middle ${tones[c.id]?.dot || ''}`} />}
              {c.id !== 'all' && (c.sport === 'badminton' ? '🏸 ' : '🏓 ')}
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}

      {!loading && view !== 'list' && <EventCalendar view={view} date={date} events={all} onPickDay={openDay} onChanged={reload} />}

      {!loading && view !== 'list' && (
        <div className="hidden sm:flex flex-wrap gap-3 mt-3 text-xs text-gray-400">
          {isClub && (clubs || []).length > 0
            ? [
                ...(clubs || []).map((c) => (
                  <span key={c.id} className="flex items-center gap-1.5">
                    <span className={`h-3 w-3 rounded-sm border-l-4 ${tones[c.id]?.chip || ''}`} />
                    {c.sport === 'badminton' ? '🏸' : '🏓'} {c.name}
                  </span>
                )),
                <span key="status" className="flex items-center gap-1.5">
                  · <span className={`h-3 w-3 rounded-sm border-l-4 bg-gray-400/15 border-gray-400 ${STATUS_MOD.completed}`} /> {t('events.status_completed')}
                  <span className="line-through">{t('events.status_cancelled')}</span>
                </span>,
              ]
            : LEGEND_STATUSES.map((s) => (
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
          <div className="card !p-3 mb-3 flex flex-wrap items-center gap-2">
            <input className="input !w-auto flex-1 min-w-[12rem] text-sm" placeholder={t('evlist.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('evlist.search')} />
            <select className="input !w-auto text-sm" value={kindF} onChange={(e) => setKindF(e.target.value)} aria-label={t('kind.label')}>
              <option value="all">{t('evlist.allKinds')}</option>
              {kindsPresent.map((k) => <option key={k} value={k}>{KIND_ICON[k] ? `${KIND_ICON[k]} ` : ''}{t(`kind.${k}`)}</option>)}
            </select>
            <div className="flex flex-wrap gap-1.5" role="tablist">
              {['all', ...LIST_GROUPS].map((g) => (
                <button key={g} type="button" role="tab" aria-selected={groupF === g} onClick={() => setGroupF(g)} className={`rounded-full border px-3 py-1 text-sm ${groupF === g ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                  {t(`evlist.g_${g}`)}{g !== 'all' && <span className="ml-1 text-gray-400 tabular-nums">{groups[g].length}</span>}
                </button>
              ))}
            </div>
          </div>
          {LIST_GROUPS.filter((g) => groupF === 'all' || groupF === g).map((g) => {
            const rows = groups[g];
            const folded = g === 'done' && groupF === 'all' && !showDone;
            return (
              <section key={g} className="mb-6">
                {g === 'done' && groupF === 'all' ? (
                  <button type="button" className="text-gray-300 text-sm font-semibold mb-2" onClick={() => setShowDone(!showDone)}>
                    {showDone ? '▾' : '▸'} {t('evlist.g_done')} ({rows.length})
                  </button>
                ) : (
                  <h2 className="text-gray-300 text-sm font-semibold mb-1">{t(`evlist.g_${g}`)} ({rows.length})</h2>
                )}
                {!folded && (
                  <>
                    <p className="text-gray-500 text-xs mb-2">{t(`evlist.h_${g}`, { n: SOON_DAYS })}</p>
                    {rows.length === 0 && <p className="text-gray-500 text-sm">{t('evlist.none')}</p>}
                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${g === 'done' ? 'opacity-80' : ''}`}>
                      {rows.map((e) => <EventCard key={e.id} e={e} />)}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </>
      )}
    </AppShell>
  );
}
