'use client';
import { useEffect, useMemo, useState } from 'react';
import { SHOW_TOURNAMENTS } from '@/lib/hidden';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import EventCalendar, { KIND_ICON, LEGEND_STATUSES, STATUS_STYLE, hrefOf } from '@/components/EventCalendar';
import DatePopover from '@/components/DatePopover';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import StatTile from '@/components/ui/StatTile';
import Hint from '@/components/ui/Hint';
import KpiRow from '@/components/ui/KpiRow';
import Segmented from '@/components/ui/Segmented';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useScope } from '@/lib/useScope';
import { useClubs } from '@/context/ClubContext';
import { clubTones, STATUS_MOD } from '@/lib/clubColors';
import { addDays, addMonths, formatDay, hhmm, monthTitle, todayYmd, weekDays } from '@/lib/dates';

const VIEWS = ['list', 'month', 'week', 'day'];
const SOON_DAYS = 3; // "Sắp diễn ra": from now to 3 days ahead
const LIST_GROUPS = ['live', 'soon', 'open', 'done'];

// Each state has its own frame and background, so the list reads at a glance.
const PHASE = {
  live: { card: 'border-emerald-400 bg-emerald-400/10', dot: 'bg-emerald-400' },
  soon: { card: 'border-lime-400/70 bg-lime-400/5', dot: 'bg-lime-400' },
  open: { card: 'border-sky-400/60 bg-sky-400/5', dot: 'bg-sky-400' },
  closed: { card: 'border-violet-400/50 bg-violet-400/5', dot: 'bg-violet-400' },
  done: { card: 'border-navy-600 bg-navy-900/60', dot: 'bg-gray-500' },
  cancelled: { card: 'border-red-400/40 bg-red-400/5', dot: 'bg-red-400' },
};

// Playing right now: today, started, not ended.
function isLive(e, today, nowHm) {
  return e.status !== 'cancelled' && e.status !== 'completed' && e.event_date === today && !!e.start_time && e.start_time.slice(0, 5) <= nowHm && (!e.end_time || e.end_time.slice(0, 5) > nowHm);
}

// live / soon (next few days) / open (taking sign-ups) / closed (sign-ups not open or
// closed) / done / cancelled.
function phaseOf(e, today, nowHm, soonEnd) {
  if (e.status === 'cancelled') return 'cancelled';
  if (isOver(e, today, nowHm)) return 'done';
  if (isLive(e, today, nowHm)) return 'live';
  if (e.event_date <= soonEnd) return 'soon';
  return e.kind === 'tournament' || e.allow_public_registration !== false ? 'open' : 'closed';
}

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

// What tells sessions of the same schedule apart: series label, community levels (Series
// A, B…), DUPR range (women's range for mixed) and what is played (Full nam / nữ / Mix).
const dupr = (v) => (v == null || v === '' ? null : Number(v).toFixed(2));
// Never split inside a range (word joiners around the dash, no-break spaces).
const range = (a, b) => (dupr(a) && dupr(b) ? `${dupr(a)}\u2060–\u2060${dupr(b)}` : dupr(a) ? `≥\u00a0${dupr(a)}` : dupr(b) ? `≤\u00a0${dupr(b)}` : null);
function EventTags({ e }) {
  const { t } = useI18n();
  if (e.kind === 'tournament' || e.kind === 'meeting') return null;
  const men = range(e.level_min, e.level_max);
  const women = range(e.level_min_f, e.level_max_f);
  const membersNow = e.members_only && (!e.public_from || Date.parse(e.public_from) > Date.now());
  const tags = [
    membersNow && { k: 'm', text: `🔒 ${t('mfirst.badge')}`, cls: 'border-violet-400 bg-violet-400/15 text-violet-100' },
    e.series_label && { k: 's', text: `🏷 ${e.series_label}`, cls: 'border-violet-400/60 text-violet-200' },
    ...(e.level_names || []).map((n) => ({ k: `l${n}`, text: `🎯 ${n}`, cls: 'border-amber-300/60 text-amber-200' })),
    women && men ? { k: 'dm', text: `♂\u00a0DUPR\u00a0${men}`, cls: 'border-sky-400/60 text-sky-200' } : men && { k: 'd', text: `DUPR\u00a0${men}`, cls: 'border-sky-400/60 text-sky-200' },
    women && { k: 'df', text: `♀\u00a0DUPR\u00a0${women}`, cls: 'border-pink-400/60 text-pink-200' },
    e.play_format && { k: 'f', text: t(`fmt.${e.play_format}`), cls: 'border-lime-400/60 text-lime-200' },
  ].filter(Boolean);
  if (!tags.length) return null;
  return (
    <div className="flex shrink-0 max-w-[50%] flex-col items-end gap-1">
      {tags.map((x) => <span key={x.k} className={`max-w-full rounded-full border px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold leading-tight text-right break-words ${x.cls}`}>{x.text}</span>)}
    </div>
  );
}

function EventCard({ e, phase = 'open' }) {
  const { t, lang } = useI18n();
  const look = PHASE[phase] || PHASE.open;
  const full = e.slots != null && e.slots > 0 && (e.main_count || 0) >= e.slots;
  const pct = e.slots ? Math.min(100, Math.round((100 * (e.main_count || 0)) / e.slots)) : 0;
  return (
    <Link href={hrefOf(e)} className={`card !p-0 overflow-hidden hover:border-lime-300 transition flex ${look.card} ${phase === 'done' || phase === 'cancelled' ? 'opacity-75' : ''}`}>
      <div className={`w-16 shrink-0 flex flex-col items-center justify-center border-r border-navy-700 py-3 ${e.tone ? e.tone.chip : 'bg-navy-900'}`}>
        <span className="text-[11px] text-gray-300">{formatDay(e.event_date, lang, { weekday: 'short' })}</span>
        <span className="text-white text-2xl font-bold leading-none tabular-nums">{Number(e.event_date.slice(8, 10))}</span>
        <span className="text-[11px] text-gray-400">{e.event_date.slice(5, 7)}/{e.event_date.slice(0, 4)}</span>
      </div>
      <div className="min-w-0 flex-1 p-3">
        {/* Main info on the left; what tells this session apart (series, level, DUPR, format)
            sits on the right like a note, so cards don't grow taller. */}
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2">
              <span className={`text-white font-semibold break-words min-w-0 ${e.status === 'cancelled' ? 'line-through' : ''}`}>
                {KIND_ICON[e.kind] && `${e.kind === 'game' && e.sport === 'badminton' ? '🏸' : KIND_ICON[e.kind]} `}
                {e.title}
              </span>
              {/* Kèo show their state on the line below (colour + words); tournaments keep their stage here. */}
              {e.kind === 'tournament' && (
                <span className={`text-[11px] rounded-full border px-2 py-0.5 shrink-0 ${STATUS_STYLE[e.status] || 'border-navy-600 text-gray-300'}`}>
                  {e.tkind === 'team' && e.tstatus === 'groups' ? t('league.inProgress') : t(`tournaments.status_${e.tstatus}`)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs font-semibold text-gray-200">
              <span className={`h-2 w-2 rounded-full ${look.dot} ${phase === 'live' ? 'animate-pulse' : ''}`} aria-hidden />
              {t(`evlist.ph_${phase}`)}
            </div>
            <div className="text-gray-400 text-sm break-words">
              {e.start_time ? `🕒 ${hhmm(e.start_time)}${e.end_time ? `–${hhmm(e.end_time)}` : ''} · ` : ''}📍 {e.location || '—'}
            </div>
            {e.club_name && (
              <div className="text-sky-300 text-xs mt-0.5 break-words">
                {e.sport === 'badminton' ? '🏸' : '🏓'} {e.club_name}
                {e.kind && <span className="text-gray-500"> · {t(`kind.${e.kind}`)}</span>}
              </div>
            )}
          </div>
          <EventTags e={e} />
        </div>
        {e.slots != null ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="flex-1 min-w-[5rem] h-1.5 rounded-full bg-navy-900 overflow-hidden">
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
  const { scoped: isClub, community } = useScope();
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
          SHOW_TOURNAMENTS ? api.get(`/api/tournaments?club_id=${c.id}`).catch(() => []) : [],
        ]);
        return [...evs, ...tours.map((tr) => tournamentAsEvent(tr, c))].map((e) => ({ ...e, club_name: c.name, sport: c.sport || 'pickleball' }));
      })
    );
    return perClub.flat();
  }, [workspace, clubKey, club?.id]);
  // Opens on the club / community picked in the menu; "Tất cả cộng đồng" shows every one.
  // Switching club in the menu goes back to that club.
  const [clubPick, setClubFilter] = useState(null);
  useEffect(() => setClubFilter(null), [club?.id]);
  const clubFilter = clubPick || (isClub && club?.id && (clubs || []).some((c) => c.id === club.id) ? club.id : 'all');

  // Opens on the list (search, filters, Sắp diễn ra / Đang mở / Đã xong) in clubs and
  // communities alike; Tháng / Tuần / Ngày are one tap away.
  const [view, setView] = useState('list');
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
    live: listed.filter((e) => isLive(e, today, nowHm)),
    soon: listed.filter((e) => !isOver(e, today, nowHm) && !isLive(e, today, nowHm) && e.event_date <= soonEnd),
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
        icon={isClub && !community ? 'calendar' : 'ticket'}
        title={isClub && !community ? t('nav.schedule') : t('nav.kevents')}
        subtitle={isClub ? (manyClubs && clubFilter === 'all' ? t(community ? 'social.allCommunities' : 'calx.allYourClubs', { n: clubs.length }) : (clubs || []).find((c) => c.id === clubFilter)?.name || club?.name) : t('finX.scopeXeve')}
        actionsWide={isClub} // phone: the tabs below lead to the create pages
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
      {/* On a phone the list comes first: the numbers are for bigger screens. */}
      <div className="hidden sm:block">
      <KpiRow cols={3}>
        <StatTile icon="📅" label={t('calx.thisMonth')} value={kpi.month} sub={t('calx.thisMonthSub', { done: kpi.monthDone })} />
        <StatTile icon="⏭" label={t('calx.next7')} value={kpi.week} tone="text-lime-300" sub={kpi.next ? `${formatDay(kpi.next.event_date, lang, { weekday: 'short', day: 'numeric', month: 'numeric' })} · ${kpi.next.title}` : t('cal.noUpcoming')} />
        {isClub && !community && SHOW_TOURNAMENTS ? (
          <StatTile icon="🏆" label={t('calx.tournaments')} value={kpi.tours} tone="text-amber-300" sub={t('calx.upcomingSub')} />
        ) : (
          <StatTile icon="👥" label={t('calx.fill')} value={kpi.fill == null ? '—' : `${kpi.fill}%`} tone="text-sky-300" sub={t('calx.fillSub', { main: kpi.main, slots: kpi.slots })} />
        )}
      </KpiRow>
      </div>

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
          {[{ id: 'all', name: t(community ? 'social.allComm' : 'cal.allClubs') }, ...clubs].map((c) => (
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
            // Nothing playing right now: no empty "Đang diễn ra" block.
            if (g === 'live' && !rows.length && groupF === 'all') return null;
            return (
              <section key={g} className="mb-6">
                {g === 'done' && groupF === 'all' ? (
                  <button type="button" className="text-gray-300 text-sm font-semibold mb-2" onClick={() => setShowDone(!showDone)}>
                    {showDone ? '▾' : '▸'} {t('evlist.g_done')} ({rows.length})
                  </button>
                ) : (
                  <h2 className="text-gray-300 text-sm font-semibold mb-2 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${PHASE[g].dot}`} aria-hidden />{t(`evlist.g_${g}`)} ({rows.length}) <Hint inline text={t(`evlist.h_${g}`, { n: SOON_DAYS })} /></h2>
                )}
                {!folded && (
                  <>
                    {rows.length === 0 && <p className="text-gray-500 text-sm">{t('evlist.none')}</p>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {rows.map((e) => <EventCard key={e.id} e={e} phase={phaseOf(e, today, nowHm, soonEnd)} />)}
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
