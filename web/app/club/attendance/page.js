'use client';
import { useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import DatePopover from '@/components/DatePopover';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import Segmented from '@/components/ui/Segmented';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import { KIND_ICON } from '@/components/EventCalendar';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { addDays, addMonths, todayYmd } from '@/lib/dates';

// Month = detail (one column per session), year = overview (one column per month).
const PERIODS = ['month', 'year', 'custom'];
const TABS = ['attendance', 'passes', 'guests'];

// First/last day of the month / year containing `anchor`.
function rangeOf(period, anchor) {
  if (period === 'month') return [`${anchor.slice(0, 7)}-01`, addDays(addMonths(`${anchor.slice(0, 7)}-01`, 1), -1)];
  return [`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`];
}

// Every month from `from` to `to` (YYYY-MM), so a year shows all 12 columns.
function monthsBetween(from, to) {
  const out = [];
  for (let k = from.slice(0, 7); k <= to.slice(0, 7); k = addMonths(`${k}-01`, 1).slice(0, 7)) out.push(k);
  return out;
}

// Up to about two months the grid has a column per session; longer, a column per month.
const SESSION_COLUMNS_MAX_DAYS = 62;

const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const monthKey = (d) => d.slice(0, 7);
const monthLabel = (k) => `${k.slice(5, 7)}/${k.slice(0, 4)}`;

// Editing the grid: a click moves a sign-up to the next state.
const NEXT_STATE = { registered: 'attended', attended: 'absent', absent: 'registered' };

// A cell while editing: clickable when there is a sign-up (late cancels stay locked).
function EditCell({ info, state, changed, onToggle }) {
  if (!info) return null;
  if (info.locked) return <Mark state={state} />;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`h-6 w-6 rounded hover:bg-navy-600 ${changed ? 'ring-2 ring-amber-400 bg-amber-400/10' : 'ring-1 ring-navy-600'}`}
      aria-label={state}
    >
      <Mark state={state} />
    </button>
  );
}

// Green ✓ = signed up and came. Red ✓ = didn't come and didn't tell: no-show or a
// cancel after the deadline — the session is used, not carried over. Empty = didn't come
// but told in time. · = signed up, not checked in yet.
function Mark({ state }) {
  const { t } = useI18n();
  if (state === 'attended') return <span className="inline-block w-4 h-4 rounded-sm bg-lime-400 text-navy-950 text-[11px] leading-4 font-bold" title={t('stats.state_attended')}>✓</span>;
  if (state === 'late' || state === 'absent') return <span className="inline-block w-4 h-4 rounded-sm bg-red-500 text-white text-[11px] leading-4 font-bold" title={t(`stats.state_${state}`)}>✓</span>;
  if (state === 'registered') return <span className="text-gray-500">·</span>;
  return null;
}

// Sessions as a bar split into one part per session of the period: green parts for
// sessions played, red for sessions missed without notice (no-show / late cancel), the
// rest empty (not used). Many sessions (a year) shrink the
// parts into one continuous bar.
function SessionBar({ attended = 0, late = 0, total }) {
  const { t } = useI18n();
  const n = Math.max(total, attended + late, 1);
  const parts = Array.from({ length: n }, (_, i) => (i < attended ? 'bg-lime-400' : i < attended + late ? 'bg-red-500' : 'bg-navy-600'));
  return (
    <div className="flex items-center gap-2" title={t('stats.barTitle', { n: attended + late, total: n, late })}>
      <span className="tabular-nums text-white font-semibold w-12 text-right whitespace-nowrap">
        {attended + late}<span className="text-gray-500 font-normal">/{n}</span>
      </span>
      <span className={`flex h-2.5 w-32 shrink-0 ${n <= 31 ? 'gap-0.5' : ''}`}>
        {parts.map((c, i) => (
          <span key={i} className={`flex-1 first:rounded-l last:rounded-r ${n <= 31 ? 'rounded-sm' : ''} ${c}`} />
        ))}
      </span>
    </div>
  );
}

// Excel-friendly CSV (UTF-8 with BOM so Vietnamese names open correctly).
function downloadCsv(name, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AttendancePage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const [period, setPeriod] = useState('month');
  const [anchor, setAnchor] = useState(todayYmd());
  const [custom, setCustom] = useState(() => [addMonths(todayYmd(), -2), todayYmd()]);
  const [tab, setTab] = useState('attendance');
  const [sort, setSort] = useState('name'); // name | count
  const [onlyActive, setOnlyActive] = useState(true);

  const [from, to] = period === 'custom' ? custom : rangeOf(period, anchor);
  const step = { month: 1, year: 12 }[period];
  // Columns follow the period: sessions for a month, months for a year (no separate switch).
  const by = period === 'month' || (period === 'custom' && (Date.parse(to) - Date.parse(from)) / 86400000 <= SESSION_COLUMNS_MAX_DAYS) ? 'session' : 'month';
  const [editing, setEditing] = useState(false);
  const [changes, setChanges] = useState({}); // participant_id -> { state, from, name, date }
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const { data, loading, error, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/attendance?from=${from}&to=${to}`) : Promise.resolve(null)),
    [club?.id, from, to]
  );

  const view = useMemo(() => {
    if (!data) return null;
    const today = todayYmd();
    const cell = new Map(data.cells.map((c) => [`${c.club_member_id}|${c.event_id}`, c.state]));
    const cellInfo = new Map(data.cells.map((c) => [`${c.club_member_id}|${c.event_id}`, c]));
    const evDate = new Map(data.events.map((e) => [e.id, e.event_date]));
    // Sessions that count: came, or didn't come without telling (no-show / late cancel).
    const missedNoNotice = (st) => st === 'late' || st === 'absent';
    const counts = (st) => st === 'attended' || missedNoNotice(st);
    const attended = {};
    const late = {};
    const perMonth = {};
    for (const c of data.cells) {
      if (!counts(c.state)) continue;
      attended[c.club_member_id] = (attended[c.club_member_id] || 0) + 1;
      if (missedNoNotice(c.state)) late[c.club_member_id] = (late[c.club_member_id] || 0) + 1;
      const k = `${c.club_member_id}|${monthKey(evDate.get(c.event_id))}`;
      perMonth[k] = (perMonth[k] || 0) + 1;
    }
    const withCells = new Set(data.cells.map((c) => c.club_member_id));
    let members = data.members.filter((m) => withCells.has(m.id) || (m.member_type === 'fixed' && (!onlyActive || m.is_active)));
    if (onlyActive) members = members.filter((m) => m.is_active || withCells.has(m.id));
    const played = (id) => (attended[id] || 0) - (late[id] || 0);
    members.sort((a, b) => (sort === 'count' ? played(b.id) - played(a.id) : 0) || a.full_name.localeCompare(b.full_name, 'vi'));
    const months = monthsBetween(data.from, data.to);
    const sessionsInMonth = (k) => data.events.filter((e) => monthKey(e.event_date) === k).length;
    const guestMonth = (g, k) => Object.entries(g.events).filter(([id, st]) => counts(st) && monthKey(evDate.get(id)) === k).length;
    const guestLate = (g) => Object.values(g.events).filter(missedNoNotice).length;

    // Guests: one row per person (the server merges by guest record / phone), each with
    // sessions played, matches played and won with the club.
    const guests = (data.guests || [])
      .filter((g) => !onlyActive || g.is_active !== false || g.sessions > 0)
      .sort((a, b) => (sort === 'count' ? b.sessions - a.sessions : 0) || a.full_name.localeCompare(b.full_name, 'vi'));
    const guestsByCount = [...guests].sort((a, b) => b.sessions - a.sessions || b.matches - a.matches || a.full_name.localeCompare(b.full_name, 'vi'));
    const guestEvents = data.events.filter((e) => guests.some((g) => g.events[e.id]));

    const perEvent = (id) => ({
      members: data.cells.filter((c) => c.event_id === id && c.state === 'attended').length,
      guests: guests.filter((g) => g.events[id] === 'attended').length,
    });
    const pastIds = new Set(data.events.filter((e) => e.event_date < today || e.status === 'completed').map((e) => e.id));
    const missedDates = [
      ...data.cells.filter((c) => c.state === 'registered' && pastIds.has(c.event_id)).map((c) => evDate.get(c.event_id)),
      ...guests.flatMap((g) => Object.entries(g.events).filter(([id, st]) => st === 'registered' && pastIds.has(id)).map(([id]) => evDate.get(id))),
    ].sort();
    const missed =
      data.cells.filter((c) => c.state === 'registered' && pastIds.has(c.event_id)).length +
      guests.reduce((n, g) => n + Object.entries(g.events).filter(([id, st]) => st === 'registered' && pastIds.has(id)).length, 0);
    const maxCount = Math.max(1, ...Object.values(attended), ...guests.map((g) => g.sessions));

    // Passes: sessions left in each period — what the club carries over ("bảo lưu").
    const name = new Map(data.members.map((m) => [m.id, m.full_name]));
    const passes = data.passes
      .map((p) => ({ ...p, full_name: name.get(p.club_member_id) || '?', ended: p.ends_on < today }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi') || a.starts_on.localeCompare(b.starts_on));
    const carry = passes.filter((p) => p.ended && p.sessions_included > 0 && p.status === 'paid').reduce((s, p) => s + p.sessions_remaining, 0);

    // Per month, everyone who came (members / guests) — the year view's footer.
    const monthCame = (k) => ({
      members: data.cells.filter((c) => c.state === 'attended' && monthKey(evDate.get(c.event_id)) === k).length,
      guests: guests.reduce((n, g) => n + Object.entries(g.events).filter(([id, st]) => st === 'attended' && monthKey(evDate.get(id)) === k).length, 0),
    });

    return { late, guestLate, missed, missedFirst: missedDates[0] || null, monthCame, sessionsInMonth, cell, cellInfo, attended, perMonth, members, months, guestMonth, guests, guestsByCount, guestEvents, perEvent, maxCount, passes, carry };
  }, [data, sort, onlyActive]);

  const evDay = (id) => dm(data.events.find((e) => e.id === id)?.event_date || '');
  const shown = (pid, state) => changes[pid]?.state ?? state;
  function toggle(info, state, name, eventId) {
    const pid = info.participant_id;
    const from = changes[pid]?.from ?? state;
    const next = NEXT_STATE[shown(pid, state)] || 'attended';
    setChanges((c) => {
      const copy = { ...c };
      if (next === from) delete copy[pid];
      else copy[pid] = { state: next, from, name, date: evDay(eventId) };
      return copy;
    });
  }
  function stopEditing() {
    setEditing(false);
    setChanges({});
    setConfirming(false);
    setSaveError('');
  }
  async function saveChanges() {
    setSaving(true);
    setSaveError('');
    try {
      await api.post(`/api/clubs/${club.id}/attendance/edits`, {
        changes: Object.entries(changes).map(([participant_id, c]) => ({ participant_id, state: c.state })),
      });
      stopEditing();
      reload();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }
  const nChanges = Object.keys(changes).length;
  const summary = useMemo(() => {
    if (!view || !data) return null;
    const today = todayYmd();
    const past = data.events.filter((e) => e.event_date < today || e.status === 'completed').length;
    // Who actually came (red "didn't tell" sessions are counted for passes, not here).
    const memberCheckins = Object.entries(view.attended).reduce((a, [id, n]) => a + n - (view.late[id] || 0), 0);
    const guestVisits = view.guests.reduce((n, g) => n + g.sessions - view.guestLate(g), 0);
    const checkins = memberCheckins + guestVisits;
    const half = Math.max(1, Math.ceil(past / 2));
    return {
      past,
      checkins,
      guestVisits,
      avg: past ? Math.round((10 * checkins) / past) / 10 : 0,
      regulars: past ? view.members.filter((m) => (view.attended[m.id] || 0) - (view.late[m.id] || 0) >= half).length : 0,
    };
  }, [view, data]);
  const stateLabel = (st) => t(`stats.state_${st}`);

  function exportCsv() {
    if (!view) return;
    const ev = data.events;
    const rows =
      by === 'session'
        ? [
            ['STT', t('common.name'), ...ev.map((e) => dm(e.event_date)), t('stats.sessionsCol')],
            ...view.members.map((m, i) => [
              i + 1,
              m.full_name,
              ...ev.map((e) => ({ attended: 'x', late: 'không báo', absent: 'không báo', registered: 'đăng ký' })[view.cell.get(`${m.id}|${e.id}`)] || ''),
              view.attended[m.id] || 0,
            ]),
            ...view.guests.map((g) => [
              '',
              `${g.full_name} (${t('members.guest')})`,
              ...ev.map((e) => ({ attended: 'x', late: 'không báo', absent: 'không báo', registered: 'đăng ký' })[g.events[e.id]] || ''),
              g.sessions,
            ]),
            ['', t('stats.membersRow'), ...ev.map((e) => view.perEvent(e.id).members), ''],
            ['', t('stats.guestsRow'), ...ev.map((e) => view.perEvent(e.id).guests), ''],
          ]
        : [
            ['STT', t('common.name'), ...view.months.map(monthLabel), t('stats.sessionsCol')],
            ...view.members.map((m, i) => [i + 1, m.full_name, ...view.months.map((k) => view.perMonth[`${m.id}|${k}`] || 0), view.attended[m.id] || 0]),
            ...view.guests.map((g) => ['', `${g.full_name} (${t('members.guest')})`, ...view.months.map((k) => view.guestMonth(g, k)), g.sessions]),
          ];
    downloadCsv(`diem-danh_${from}_${to}.csv`, rows);
  }

  return (
    <AppShell>
      <PageHeader
        icon="📋"
        title={t('nav.memberStats')}
        subtitle={club?.name}
        actions={tab === 'attendance' && view ? <button type="button" className="btn-secondary text-sm" onClick={exportCsv}>⬇ {t('stats.exportCsv')}</button> : null}
      />
      <SectionTabs group="stats" />

      <div className="card !p-3 mb-4 flex flex-wrap items-center gap-2">
        <Segmented items={PERIODS} value={period} onChange={setPeriod} label={(k) => t(`stats.p_${k}`)} />
        {period !== 'custom' ? (
          <div className="flex items-center gap-1">
            <button type="button" className="btn-secondary !px-3" onClick={() => setAnchor(addMonths(anchor, -step))} aria-label={t('cal.prev')}>‹</button>
            <span className="text-white font-semibold text-sm px-2 tabular-nums">{`${dm(from)}/${from.slice(0, 4)} – ${dm(to)}/${to.slice(0, 4)}`}</span>
            <button type="button" className="btn-secondary !px-3" onClick={() => setAnchor(addMonths(anchor, step))} aria-label={t('cal.next')}>›</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <DatePopover value={custom[0]} onChange={(d) => setCustom([d, custom[1] < d ? d : custom[1]])} />
            <span className="text-gray-400">→</span>
            <DatePopover align="right" value={custom[1]} onChange={(d) => setCustom([custom[0] > d ? d : custom[0], d])} />
          </div>
        )}
      </div>

      {view && (
        <KpiRow cols={5}>
          <StatTile icon="📅" label={t('statx.sessions')} value={data.events.length} sub={t('statx.sessionsSub', { n: summary.past })} />
          <StatTile icon="✅" label={t('statx.checkins')} value={summary.checkins} tone="text-lime-300" sub={summary.past ? t('statx.perSession', { n: summary.avg }) : t('statx.noneYet')} />
          <StatTile icon="🔥" label={t('statx.regulars')} value={summary.regulars} tone="text-amber-300" sub={t('statx.regularsSub')} />
          <StatTile icon="🤝" label={t('statx.guests')} value={view.guests.length} tone="text-sky-300" sub={t('statx.guestVisits', { n: summary.guestVisits })} />
          <StatTile icon="🎫" label={t('statx.carry')} value={view.carry} tone="text-pink-300" sub={t('statx.carrySub')} />
        </KpiRow>
      )}

      <UnderlineTabs
        value={tab}
        onChange={setTab}
        tabs={TABS.map((k) => ({ key: k, label: t(`stats.tab_${k}`), icon: { attendance: '✅', passes: '🎫', guests: '🤝' }[k] }))}
      />

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {error && <p className="text-red-400 text-sm">{error.message}</p>}

      {view && tab === 'attendance' && (
        <div className="card">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Segmented items={['name', 'count']} value={sort} onChange={setSort} label={(k) => t(`stats.sort_${k}`)} />
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              {t('stats.onlyActive')}
            </label>
            <div className="flex gap-2 sm:ml-auto">
              {by === 'session' && !editing && (
                <button type="button" className="btn-secondary text-sm" onClick={() => setEditing(true)}>✏️ {t('stats.editGrid')}</button>
              )}
            </div>
          </div>
          {!editing && view.missed > 0 && (
            <button type="button" className="w-full text-left rounded-lg border border-amber-400/50 bg-amber-400/5 px-3 py-2 text-sm mb-3" onClick={() => {
                // Fixing ticks happens on the session grid: open the month of the first one.
                if (by !== 'session') {
                  setPeriod('month');
                  setAnchor(view.missedFirst || anchor);
                }
                setEditing(true);
              }}>
              <span className="text-amber-300 font-semibold">⚠️ {t('stats.missed', { n: view.missed })}</span>{' '}
              <span className="text-lime-400">{t('stats.missedCta')} →</span>
            </button>
          )}
          {editing && (
            <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/60 bg-navy-900 px-3 py-2 text-sm mb-3">
              <span className="text-amber-200">{t('stats.editHint')}</span>
              <span className="text-white font-semibold">{t('stats.changesN', { n: nChanges })}</span>
              <div className="flex gap-2 ml-auto">
                <button type="button" className="btn-secondary !py-1 text-sm" onClick={stopEditing}>{t('common.cancel')}</button>
                <button type="button" className="btn-primary !py-1 text-sm" disabled={!nChanges} onClick={() => setConfirming(true)}>{t('stats.reviewSave')}</button>
              </div>
            </div>
          )}
          <p className="text-gray-500 text-xs mb-2">{t('stats.legend')}</p>
          {data.events.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('stats.noSessions')}</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="text-sm grid-table compact-cells">
                <thead>
                  <tr className="text-gray-300 bg-navy-900">
                    <th className="w-10 text-center sticky left-0 bg-navy-900 z-10">#</th>
                    <th className="text-left min-w-[10rem] sticky left-10 bg-navy-900 z-10">{t('common.name')}</th>
                    {by === 'session'
                      ? data.events.map((e) => (
                          <th key={e.id} className="text-center whitespace-nowrap font-normal" title={e.title}>
                            <div className="text-[10px] leading-none">{KIND_ICON[e.kind] || ''}</div>
                            {dm(e.event_date)}
                          </th>
                        ))
                      : view.months.map((k) => (
                          <th key={k} className="text-center whitespace-nowrap font-normal min-w-[3rem]">
                            {/* One year: "T1".."T12"; across years keep the year. */}
                            {from.slice(0, 4) === to.slice(0, 4) ? t('stats.monthShort', { m: Number(k.slice(5, 7)) }) : monthLabel(k)}
                            <div className="text-[10px] leading-none text-gray-500">{view.sessionsInMonth(k) ? t('stats.monthSessions', { n: view.sessionsInMonth(k) }) : '–'}</div>
                          </th>
                        ))}
                    <th className="text-left min-w-[8rem]">{t('stats.sessionsCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.members.map((m, i) => (
                    <tr key={m.id} className="hover:bg-navy-700/40">
                      <td className="text-center text-gray-400 sticky left-0 bg-navy-800">{i + 1}</td>
                      <td className="text-white whitespace-nowrap sticky left-10 bg-navy-800">
                        {m.full_name}
                        {m.member_type !== 'fixed' && <span className="text-gray-500 text-xs"> · {t('members.guest')}</span>}
                      </td>
                      {by === 'session'
                        ? data.events.map((e) => {
                            const info = view.cellInfo.get(`${m.id}|${e.id}`);
                            const st = info ? shown(info.participant_id, info.state) : undefined;
                            return (
                              <td key={e.id} className="text-center">
                                {editing ? (
                                  <EditCell info={info} state={st} changed={!!(info && changes[info.participant_id])} onToggle={() => toggle(info, info.state, m.full_name, e.id)} />
                                ) : (
                                  <Mark state={st} />
                                )}
                              </td>
                            );
                          })
                        : view.months.map((k) => (
                            <td key={k} className="text-center tabular-nums text-gray-200">{view.perMonth[`${m.id}|${k}`] || ''}</td>
                          ))}
                      <td>
                        <SessionBar attended={(view.attended[m.id] || 0) - (view.late[m.id] || 0)} late={view.late[m.id] || 0} total={data.events.length} />
                      </td>
                    </tr>
                  ))}
                  {view.guests.length > 0 && (
                    <tr className="bg-navy-900/70">
                      <td className="sticky left-0 bg-navy-900" />
                      <td className="sticky left-10 bg-navy-900 text-sky-300 text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{t('stats.guestSection', { n: view.guests.length })}</td>
                      <td colSpan={(by === 'session' ? data.events.length : view.months.length) + 1} />
                    </tr>
                  )}
                  {view.guests.map((g, i) => (
                    <tr key={g.key} className="hover:bg-navy-700/40">
                      <td className="text-center text-gray-500 sticky left-0 bg-navy-800">{i + 1}</td>
                      <td className="text-sky-100 whitespace-nowrap sticky left-10 bg-navy-800">
                        {g.full_name}
                        {g.guest_perk && <span className="ml-1 text-xs">⚡</span>}
                      </td>
                      {by === 'session'
                        ? data.events.map((e) => {
                            const info = g.participants?.[e.id];
                            const st = info ? shown(info.participant_id, g.events[e.id]) : g.events[e.id];
                            return (
                              <td key={e.id} className="text-center">
                                {editing ? (
                                  <EditCell info={info} state={st} changed={!!(info && changes[info.participant_id])} onToggle={() => toggle(info, g.events[e.id], g.full_name, e.id)} />
                                ) : (
                                  <Mark state={st} />
                                )}
                              </td>
                            );
                          })
                        : view.months.map((k) => (
                            <td key={k} className="text-center tabular-nums text-gray-200">{view.guestMonth(g, k) || ''}</td>
                          ))}
                      <td>
                        <SessionBar attended={g.sessions - view.guestLate(g)} late={view.guestLate(g)} total={data.events.length} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {by === 'month' && (
                  <tfoot>
                    <tr className="bg-navy-900 text-gray-300">
                      <td className="sticky left-0 bg-navy-900" />
                      <td className="sticky left-10 bg-navy-900 text-xs">{t('stats.membersRow')}</td>
                      {view.months.map((k) => <td key={k} className="text-center tabular-nums">{view.monthCame(k).members || ''}</td>)}
                      <td />
                    </tr>
                    <tr className="bg-navy-900 text-gray-300">
                      <td className="sticky left-0 bg-navy-900" />
                      <td className="sticky left-10 bg-navy-900 text-xs">{t('stats.guestsRow')}</td>
                      {view.months.map((k) => <td key={k} className="text-center tabular-nums text-sky-300">{view.monthCame(k).guests || ''}</td>)}
                      <td />
                    </tr>
                  </tfoot>
                )}
                {by === 'session' && (
                  <tfoot>
                    <tr className="bg-navy-900 text-gray-300">
                      <td className="sticky left-0 bg-navy-900" />
                      <td className="sticky left-10 bg-navy-900 text-xs">{t('stats.membersRow')}</td>
                      {data.events.map((e) => <td key={e.id} className="text-center tabular-nums">{view.perEvent(e.id).members}</td>)}
                      <td />
                    </tr>
                    <tr className="bg-navy-900 text-gray-300">
                      <td className="sticky left-0 bg-navy-900" />
                      <td className="sticky left-10 bg-navy-900 text-xs">{t('stats.guestsRow')}</td>
                      {data.events.map((e) => <td key={e.id} className="text-center tabular-nums text-sky-300">{view.perEvent(e.id).guests || ''}</td>)}
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {view && tab === 'passes' && (
        <div className="card">
          <p className="text-gray-400 text-sm mb-1">{t('stats.passesHint')}</p>
          <p className="text-lime-400 text-sm font-semibold mb-3">{t('stats.carryTotal', { n: view.carry })}</p>
          {view.passes.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('stats.noPasses')}</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm grid-table compact-cells">
                <thead>
                  <tr className="text-gray-300 bg-navy-900 text-left">
                    <th>{t('common.name')}</th>
                    <th>{t('stats.periodCol')}</th>
                    <th className="text-right">{t('stats.included')}</th>
                    <th className="text-right">{t('stats.used')}</th>
                    <th className="text-right">{t('stats.left')}</th>
                    <th>{t('stats.carryCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.passes.map((p) => {
                    const unlimited = p.sessions_included === 0;
                    return (
                      <tr key={`${p.club_member_id}${p.starts_on}`}>
                        <td className="text-white whitespace-nowrap">{p.full_name}</td>
                        <td className="text-gray-300 whitespace-nowrap">
                          {/^\d{4}-\d{2}$/.test(p.period_label || '') ? monthLabel(p.period_label) : p.period_label || `${dm(p.starts_on)} – ${dm(p.ends_on)}`}
                          {p.status !== 'paid' && <span className="ml-1 text-yellow-300 text-xs">· {t('membership.pending')}</span>}
                        </td>
                        <td className="text-right tabular-nums text-gray-300">{unlimited ? '∞' : p.sessions_included}</td>
                        <td className="text-right tabular-nums text-gray-300">{p.sessions_used}</td>
                        <td className={`text-right tabular-nums font-semibold ${unlimited ? 'text-gray-400' : p.sessions_remaining > 0 ? 'text-lime-400' : 'text-gray-400'}`}>
                          {unlimited ? '∞' : p.sessions_remaining}
                        </td>
                        <td className="text-sm">
                          {unlimited ? (
                            <span className="text-gray-500">—</span>
                          ) : p.ended ? (
                            p.sessions_remaining > 0 && p.status === 'paid' ? (
                              <span className="text-lime-300">{t('stats.carryN', { n: p.sessions_remaining })}</span>
                            ) : (
                              <span className="text-gray-500">{t('stats.carryNone')}</span>
                            )
                          ) : (
                            <span className="text-sky-300">{t('stats.running')}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view && tab === 'guests' && (
        <div className="card">
          <p className="text-gray-400 text-sm mb-3">{t('stats.guestsHint', { n: view.guests.length })}</p>
          {view.guests.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('stats.noGuests')}</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="text-sm grid-table compact-cells">
                <thead>
                  <tr className="text-gray-300 bg-navy-900">
                    <th className="w-10 text-center">#</th>
                    <th className="text-left min-w-[10rem]">{t('common.name')}</th>
                    <th className="text-left">{t('common.phone')}</th>
                    <th className="text-right">{t('stats.sessionsCol')}</th>
                    <th className="text-right">{t('stats.matchesCol')}</th>
                    <th className="text-right">{t('stats.winsCol')}</th>
                    {view.guestEvents.map((e) => <th key={e.id} className="text-center whitespace-nowrap font-normal" title={e.title}>{dm(e.event_date)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {view.guestsByCount.map((g, i) => (
                    <tr key={g.key}>
                      <td className="text-center text-gray-400">{i + 1}</td>
                      <td className="text-white whitespace-nowrap">
                        {g.full_name}
                        {g.guest_perk && <span className="ml-1 text-xs">⚡ {t('guests.perk_priority')}</span>}
                      </td>
                      <td className="text-gray-400 whitespace-nowrap">{g.phone || '—'}</td>
                      <td className="text-right tabular-nums text-white font-semibold">{g.sessions}</td>
                      <td className="text-right tabular-nums text-gray-200">{g.matches}</td>
                      <td className="text-right tabular-nums text-gray-200 whitespace-nowrap">
                        {g.wins}
                        {g.matches > 0 && <span className="text-gray-500 text-xs"> · {Math.round((100 * g.wins) / g.matches)}%</span>}
                      </td>
                      {view.guestEvents.map((e) => <td key={e.id} className="text-center"><Mark state={g.events[e.id]} /></td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-navy-900 text-gray-300">
                    <td />
                    <td className="text-xs">{t('stats.guestsRow')}</td>
                    <td colSpan={4} />
                    {view.guestEvents.map((e) => <td key={e.id} className="text-center tabular-nums text-sky-300">{view.perEvent(e.id).guests}</td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
      <Modal open={confirming} title={t('stats.confirmTitle', { n: nChanges })} onClose={() => setConfirming(false)}>
        <p className="text-gray-300 text-sm mb-3">{t('stats.confirmHint')}</p>
        <ul className="max-h-72 overflow-y-auto divide-y divide-navy-700 text-sm mb-4">
          {Object.entries(changes).map(([pid, c]) => (
            <li key={pid} className="py-1.5 flex flex-wrap gap-x-2">
              <span className="text-white">{c.name}</span>
              <span className="text-gray-400">· {c.date}</span>
              <span className="ml-auto text-gray-400">
                {stateLabel(c.from)} → <span className={c.state === 'attended' ? 'text-lime-400' : c.state === 'absent' ? 'text-red-400' : 'text-gray-300'}>{stateLabel(c.state)}</span>
              </span>
            </li>
          ))}
        </ul>
        {saveError && <p className="text-red-400 text-sm mb-2">{saveError}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>{t('stats.backToEdit')}</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={saveChanges}>{t('stats.confirmSave')}</button>
        </div>
      </Modal>
    </AppShell>
  );
}
