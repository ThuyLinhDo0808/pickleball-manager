'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import Segmented from '@/components/ui/Segmented';
import { KIND_ICON } from '@/components/EventCalendar';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { addDays, formatDay, hhmm, todayYmd } from '@/lib/dates';

const ROLE_TONE = {
  coordinator: 'bg-lime-400/15 text-lime-300 border-lime-400/40',
  referee: 'bg-sky-400/15 text-sky-300 border-sky-400/40',
};

function RoleBadge({ role }) {
  const { t } = useI18n();
  return <span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 shrink-0 ${ROLE_TONE[role]}`}>{role === 'coordinator' ? '🦺' : '🏁'} {t(`staff.${role}`)}</span>;
}

// Check-in progress: who arrived out of who is on the list.
function Progress({ e }) {
  const { t } = useI18n();
  const total = e.main_count || 0;
  const pct = total ? Math.round((100 * e.arrived) / total) : 0;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[11px] text-gray-400 mb-1">
        <span>{t('staffX.arrivedOf', { n: e.arrived, total })}</span>
        <span>{t('staffX.slots', { n: total, slots: e.slots })}</span>
      </div>
      <div className="h-1.5 rounded-full bg-navy-900 overflow-hidden">
        <div className="h-full bg-lime-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// An event as a row: date block, title, time and place, club, my role.
function EventRow({ e, today }) {
  const { t, lang } = useI18n();
  const past = e.event_date < today;
  return (
    <Link href={`/staff/${e.id}`} className={`card !p-0 overflow-hidden flex hover:border-lime-400/60 transition ${past ? 'opacity-70' : ''}`}>
      <div className="w-16 shrink-0 flex flex-col items-center justify-center border-r border-navy-700 bg-navy-900 py-3">
        <span className="text-[11px] uppercase text-gray-400">{formatDay(e.event_date, lang, { weekday: 'short' })}</span>
        <span className="text-white text-2xl font-bold leading-none">{Number(e.event_date.slice(8, 10))}</span>
        <span className="text-[11px] text-gray-500">{`${Number(e.event_date.slice(5, 7))}/${e.event_date.slice(2, 4)}`}</span>
      </div>
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-white font-semibold truncate">{KIND_ICON[e.kind] ? `${KIND_ICON[e.kind]} ` : ''}{e.title}</span>
          <RoleBadge role={e.role} />
        </div>
        <div className="text-gray-400 text-xs truncate mt-0.5">
          {e.start_time ? `🕒 ${hhmm(e.start_time)}${e.end_time ? `–${hhmm(e.end_time)}` : ''} · ` : ''}📍 {e.location || '—'}
          {e.club_name ? ` · ${e.club_name}` : ` · ${t('staffX.xeve')}`}
        </div>
        <Progress e={e} />
      </div>
    </Link>
  );
}

// Referee / coordinator home ("Sự kiện của tôi"): today first with quick actions, then
// what's coming, then the last two weeks; tournaments to score live.
export default function StaffEventsPage() {
  const { t, lang } = useI18n();
  const { staffInfo } = useWorkspace();
  const { data: events, loading } = useLoad(() => api.get('/api/staff/events'), []);
  const { data: tours } = useLoad(() => api.get('/api/live/tournaments').catch(() => []), []);
  const [view, setView] = useState('upcoming');
  const [role, setRole] = useState('all');
  const today = todayYmd();
  const week = addDays(today, 7);

  const list = useMemo(() => (events || []).filter((e) => role === 'all' || e.role === role), [events, role]);
  const todays = list.filter((e) => e.event_date === today);
  const upcoming = list.filter((e) => e.event_date > today);
  const past = list.filter((e) => e.event_date < today).reverse();
  const roles = [...new Set((events || []).map((e) => e.role))];
  const shown = view === 'upcoming' ? upcoming : past;
  // Upcoming grouped by month for an easy scan.
  const groups = shown.reduce((acc, e) => {
    const k = e.event_date.slice(0, 7);
    (acc[k] = acc[k] || []).push(e);
    return acc;
  }, {});

  return (
    <AppShell>
      <PageHeader
        icon="🦺"
        title={t('staffView.title')}
        subtitle={staffInfo?.role ? t('staffX.youAre', { role: t(`staff.${staffInfo.role}`) }) : null}
      />
      {staffInfo && staffInfo.email_verified === false && <p className="card text-yellow-300 text-sm mb-4">{t('staffView.unverified')}</p>}

      <KpiRow cols={4}>
        <StatTile icon="📍" label={t('staffX.kpiToday')} value={todays.length} tone="text-lime-300" sub={todays[0] ? todays[0].title : t('staffX.nothingToday')} />
        <StatTile icon="📅" label={t('staffX.kpiWeek')} value={list.filter((e) => e.event_date > today && e.event_date <= week).length} tone="text-sky-300" sub={t('staffX.kpiWeekSub')} />
        <StatTile icon="✅" label={t('staffX.kpiDone')} value={past.length} sub={t('staffX.kpiDoneSub')} />
        <StatTile icon="🏆" label={t('staffX.kpiLive')} value={(tours || []).length} tone="text-red-300" sub={t('staffX.kpiLiveSub')} />
      </KpiRow>

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && (events || []).length === 0 && !(tours || []).length && (
        <div className="card text-center py-8">
          <div className="text-4xl mb-2">🦺</div>
          <p className="text-gray-300">{t('staffView.none')}</p>
          <p className="text-gray-500 text-sm mt-1">{t('staffX.noneHint')}</p>
        </div>
      )}

      {todays.length > 0 && (
        <section className="mb-6">
          <h2 className="text-white font-semibold mb-2">📍 {t('staffX.today')}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {todays.map((e) => (
              <div key={e.id} className="rounded-2xl border border-lime-400/40 bg-gradient-to-br from-navy-800 to-navy-900 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-white text-lg font-bold truncate">{KIND_ICON[e.kind] ? `${KIND_ICON[e.kind]} ` : ''}{e.title}</div>
                    <div className="text-gray-300 text-sm">
                      {e.start_time ? `🕒 ${hhmm(e.start_time)}${e.end_time ? `–${hhmm(e.end_time)}` : ''} · ` : ''}📍 {e.location || '—'}
                    </div>
                    <div className="text-gray-500 text-xs">{e.club_name || t('staffX.xeve')}</div>
                  </div>
                  <RoleBadge role={e.role} />
                </div>
                <Progress e={e} />
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {e.role === 'coordinator' ? (
                    <>
                      <Link href={`/staff/${e.id}?tab=checkin`} className="btn-primary !py-2 text-sm text-center">✅ {t('staffView.checkInTab')}</Link>
                      <Link href={`/staff/${e.id}?tab=courts`} className="btn-secondary !py-2 text-sm text-center">🏟 {t('staffX.courtsTab')}</Link>
                    </>
                  ) : (
                    <span className="col-span-2 text-gray-500 text-xs self-center">{t('staffView.refereeOnly')}</span>
                  )}
                  <Link href={`/staff/${e.id}?tab=scores`} className="btn-secondary !py-2 text-sm text-center">🎾 {t('staffView.scoresTab')}</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(events || []).length > 0 && (
        <section className="mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Segmented items={['upcoming', 'past']} value={view} onChange={setView} label={(k) => `${t(`staffX.${k}`)} (${k === 'upcoming' ? upcoming.length : past.length})`} />
            {roles.length > 1 && <Segmented items={['all', ...roles]} value={role} onChange={setRole} label={(k) => (k === 'all' ? t('staffX.allRoles') : t(`staff.${k}`))} />}
          </div>
          {shown.length === 0 ? (
            <p className="card text-gray-400 text-sm">{view === 'upcoming' ? t('staffX.noUpcoming') : t('staffX.noPast')}</p>
          ) : (
            Object.entries(groups).map(([k, rows]) => (
              <div key={k} className="mb-4">
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 capitalize">
                  {new Date(`${k}-01T00:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {rows.map((e) => <EventRow key={e.id} e={e} today={today} />)}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {(tours || []).length > 0 && (
        <section className="mt-2">
          <h2 className="text-white font-semibold mb-2">🔴 {t('live.staffTitle')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tours.map((tr) => (
              <Link key={tr.id} href={`/live/${tr.id}`} className="card hover:border-red-400 transition">
                <div className="flex justify-between gap-2">
                  <span className="text-white font-semibold">🏆 {tr.name}</span>
                  <span className="text-xs rounded-full px-2 py-0.5 bg-red-500/20 text-red-200 shrink-0">● {t('live.score')}</span>
                </div>
                <div className="text-gray-400 text-sm">
                  {tr.club_name && <span>{tr.club_name} · </span>}
                  {tr.event_date || '—'}
                  {tr.location ? ` · ${tr.location}` : ''}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
