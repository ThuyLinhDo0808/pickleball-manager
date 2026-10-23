'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useScope } from '@/lib/useScope';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const fmtMonth = (m) => (m ? `${Number(m.slice(5))}/${m.slice(0, 4)}` : '');

// Cuộc đua Top tháng (communities): this month's live table, past months' final tables,
// and the on / off switch. Statistics only: no prizes or vouchers.
export default function RacePage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { community } = useScope();
  const [month, setMonth] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const { data: d, error, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/race${month ? `?month=${month}` : ''}`) : Promise.resolve(null)), [club?.id, month]);
  const s = d?.settings;
  const canEdit = !club?.role || ['owner', 'co_admin'].includes(club.role);

  const toggle = async (enabled) => {
    setBusy('settings');
    setErr('');
    try {
      await api.patch(`/api/clubs/${club.id}/race`, { enabled });
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const months = d ? [d.current_month, ...d.closed_months.map((m) => m.month).filter((m) => m !== d.current_month)] : [];
  return (
    <AppShell>
      <PageHeader icon="trophy" title={t('race.title')} subtitle={club?.name} />
      <SectionTabs group="stats" />
      {!community && <p className="card text-gray-300 text-sm mb-4">{t('race.communityOnly')}</p>}
      {error && <p className="card text-red-300 text-sm">{error.payload?.code === 'migration_required' ? t('race.needMigration') : error.message}</p>}
      {err && <p className="card text-red-300 text-sm mb-3">{err}</p>}
      {!d && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {d && (
        <div className="flex flex-col gap-5">
          {/* On / off: whether players see the table on their community page. */}
          <section className="card flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-white font-semibold">{t('race.title')}</h2>
              <p className="text-gray-400 text-xs mt-0.5">{t('race.rules', { min: s.min_sessions, day: s.join_by_day })}</p>
            </div>
            <label className="flex items-center gap-2 min-h-[44px] text-sm text-white cursor-pointer">
              <input type="checkbox" checked={s.enabled} disabled={!canEdit || busy === 'settings'} onChange={(e) => toggle(e.target.checked)} />
              {s.enabled ? t('race.on') : t('race.off')}
            </label>
          </section>

          {/* Table */}
          <section className="card !p-0 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
              <h2 className="text-white font-semibold">
                {t('race.tableTitle', { m: fmtMonth(d.month) })}{' '}
                <span className={`ml-1 text-[11px] rounded-full border px-2 py-0.5 ${d.closed ? 'border-navy-500 text-gray-300' : 'border-lime-400/60 text-lime-300'}`}>{d.closed ? t('race.closed') : t('race.live')}</span>
              </h2>
              <select className="input !w-40 !py-1 text-sm" value={month || d.month} onChange={(e) => setMonth(e.target.value)} aria-label={t('race.pickMonth')}>
                {months.map((m) => <option key={m} value={m}>{t('race.monthN', { m: fmtMonth(m) })}</option>)}
              </select>
            </div>
            {d.table.groups.every((g) => g.rows.length === 0) ? (
              <p className="text-gray-500 text-sm px-4 pb-4">{t('race.empty')}</p>
            ) : (
              d.table.groups.map((g) => (
                <div key={g.key || 'all'} className="pb-2">
                  {g.key && <p className="px-4 pt-2 text-xs font-semibold text-gray-300">{t(`race.group_${g.key}_${d.table.sport === 'badminton' ? 'b' : 'p'}`)}</p>}
                  <table className="w-full text-sm">
                    <thead className="text-gray-400 text-xs text-left">
                      <tr className="border-b border-navy-700">{['place', 'name', 'sessions', 'wins', 'noShows', 'points', 'note'].map((k) => <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">{t(`race.col_${k}`)}</th>)}</tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r, i) => (
                        <tr key={r.club_member_id} className="border-b border-navy-800 last:border-0 tabular-nums">
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 text-white">{r.full_name}</td>
                          <td className="px-3 py-2">{r.sessions}</td>
                          <td className="px-3 py-2">{r.wins}</td>
                          <td className={`px-3 py-2 ${r.no_shows ? 'text-red-300' : ''}`}>{r.no_shows}</td>
                          <td className="px-3 py-2 font-bold text-amber-300">{r.points}</td>
                          <td className="px-3 py-2 text-xs">
                            {!r.joined_in_time ? <span className="text-gray-500">{t('race.lateJoin')}</span> : !r.eligible ? <span className="text-gray-500">{t('race.notEnough', { n: s.min_sessions })}</span> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
