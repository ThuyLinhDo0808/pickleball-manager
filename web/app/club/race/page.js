'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useScope } from '@/lib/useScope';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

const fmtMonth = (m) => (m ? `${Number(m.slice(5))}/${m.slice(0, 4)}` : '');
const fmtDay = (d) => (d ? d.split('-').reverse().join('/') : '—');
const STATE_TONE = { available: 'border-lime-400/60 text-lime-300', used: 'border-navy-500 text-gray-300', expired: 'border-gray-600 text-gray-500', revoked: 'border-red-400/50 text-red-300' };
const REWARDS = ['free', 'half', 'none'];

// Cuộc đua Top tháng (communities): this month's live table, past months' final tables,
// the race settings, and every voucher given (use / extend / revoke).
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

  const save = async (patch) => {
    setBusy('settings');
    setErr('');
    try {
      await api.patch(`/api/clubs/${club.id}/race`, patch);
      await reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };
  const act = async (v, body) => {
    setBusy(v.id);
    setErr('');
    try {
      await api.post(`/api/clubs/${club.id}/race/vouchers/${v.id}`, body);
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
      <PageHeader icon="🏆" title={t('race.title')} subtitle={club?.name} />
      <SectionTabs group="stats" />
      {!community && <p className="card text-gray-300 text-sm mb-4">{t('race.communityOnly')}</p>}
      {error && <p className="card text-red-300 text-sm">{error.payload?.code === 'migration_required' ? t('race.needMigration') : error.message}</p>}
      {err && <p className="card text-red-300 text-sm mb-3">{err}</p>}
      {!d && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {d && (
        <div className="flex flex-col gap-5">
          {/* Settings */}
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-white font-semibold">{t('race.settings')}</h2>
                <p className="text-gray-400 text-xs mt-0.5">{t('race.rules', { min: s.min_sessions, day: s.join_by_day })}</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                <input type="checkbox" checked={s.enabled} disabled={!canEdit || busy === 'settings'} onChange={(e) => save({ enabled: e.target.checked })} />
                {s.enabled ? t('race.on') : t('race.off')}
              </label>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mt-4">
              {['1', '2', '3'].map((r) => (
                <label key={r} className="text-sm">
                  <span className="text-xs text-gray-400">🏅 {t('race.prizeFor', { n: r })}</span>
                  <select className="input mt-1" value={s.rewards[r]} disabled={!canEdit} onChange={(e) => save({ rewards: { ...s.rewards, [r]: e.target.value } })}>
                    {REWARDS.map((k) => <option key={k} value={k}>{t(`race.reward_${k}`)}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-4 mt-3 text-sm">
              <label>
                <span className="text-xs text-gray-400">{t('race.voucherDays')}</span>
                <select className="input mt-1 !w-36" value={s.voucher_days} disabled={!canEdit} onChange={(e) => save({ voucher_days: Number(e.target.value) })}>
                  {[7, 14, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{t('race.days', { n })}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-gray-200 cursor-pointer pb-2">
                <input type="checkbox" checked={s.split_levels} disabled={!canEdit} onChange={(e) => save({ split_levels: e.target.checked })} />
                {t('race.splitLevels')}
              </label>
            </div>
            <p className="text-gray-500 text-xs mt-2">{t('race.pointsHint', { c: s.points.checkin, w: s.points.win, n: s.points.no_show })}</p>
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
                      <tr className="border-b border-navy-700">{['place', 'name', 'sessions', 'wins', 'noShows', 'points', 'prize'].map((k) => <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">{t(`race.col_${k}`)}</th>)}</tr>
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
                            {r.prize_rank ? <span className="text-lime-300 font-semibold">🏆 Top {r.prize_rank}</span> : !r.joined_in_time ? <span className="text-gray-500">{t('race.lateJoin')}</span> : !r.eligible ? <span className="text-gray-500">{t('race.notEnough', { n: s.min_sessions })}</span> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </section>

          {/* Vouchers */}
          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className="text-white font-semibold">🎁 {t('race.vouchers')}</h2>
              <span className="text-sm text-gray-300">{t('race.given', { n: d.given.used, amount: formatVnd(d.given.amount) })}</span>
            </div>
            {d.vouchers.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('race.noVouchers')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-navy-700 text-sm">
                {d.vouchers.map((v) => (
                  <li key={v.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-white">{v.full_name || '—'}</span>
                    <span className="text-xs text-gray-400">Top {v.rank} · {fmtMonth(v.month)}{v.level_group ? ` · ${t(`race.groupShort_${v.level_group}`)}` : ''}</span>
                    <span className="text-xs text-amber-200">{t(`race.reward_${v.kind}`)}</span>
                    <span className={`text-[11px] rounded border px-1.5 ${STATE_TONE[v.state]}`}>{t(`race.state_${v.state}`)}</span>
                    <span className="text-xs text-gray-500">{v.used_for ? t('race.usedFor', { title: v.used_for.title, date: fmtDay(v.used_for.event_date) }) : t('race.until', { date: fmtDay(v.expires_on) })}</span>
                    {canEdit && (
                      <span className="ml-auto flex gap-2">
                        {['available', 'expired'].includes(v.state) && <button type="button" className="text-xs text-lime-300 hover:underline" disabled={busy === v.id} onClick={() => act(v, { action: 'extend', days: 30 })}>{t('race.extend')}</button>}
                        {v.state === 'available' && <button type="button" className="text-xs text-red-300 hover:underline" disabled={busy === v.id} onClick={() => window.confirm(t('race.revokeAsk', { name: v.full_name })) && act(v, { action: 'revoke' })}>{t('race.revoke')}</button>}
                        {v.state === 'revoked' && <button type="button" className="text-xs text-gray-300 hover:underline" disabled={busy === v.id} onClick={() => act(v, { action: 'restore' })}>{t('race.restore')}</button>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-gray-500 text-xs mt-3">{t('race.vouchersHint')} <Link href="/finance" className="underline">{t('nav.groupFinance')}</Link></p>
          </section>
        </div>
      )}
    </AppShell>
  );
}
