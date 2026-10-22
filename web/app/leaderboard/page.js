'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import SectionTabs from '@/components/ui/SectionTabs';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { todayYmd } from '@/lib/dates';
import Segmented from '@/components/ui/Segmented';

const PERIODS = ['month', 'quarter', 'year', 'all'];

function shift(period, ymd, dir) {
  const [y, m] = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  if (period === 'month') d.setUTCMonth(d.getUTCMonth() + dir);
  if (period === 'quarter') d.setUTCMonth(d.getUTCMonth() + 3 * dir);
  if (period === 'year') d.setUTCFullYear(d.getUTCFullYear() + dir);
  return d.toISOString().slice(0, 10);
}

function label(period, ymd, t) {
  const [y, m] = ymd.split('-').map(Number);
  if (period === 'all') return t('rankings.all');
  if (period === 'month') return `${t('rankings.month')} ${m}/${y}`;
  if (period === 'quarter') return `${t('rankings.quarter')} ${Math.ceil(m / 3)}/${y}`;
  return `${t('rankings.year')} ${y}`;
}

// Leaderboard across the whole app: players of every club, guests and Xé Vé players.
export default function LeaderboardPage() {
  const { t } = useI18n();
  const sport = 'pickleball'; // only pickleball for now
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(todayYmd);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('all');
  const { data, loading } = useLoad(() => api.get(`/api/leaderboard?sport=${sport}&period=${period}&date=${date}${scope === 'xeve' ? '&scope=xeve' : ''}`), [sport, period, date, scope]);
  const all = data?.rankings || [];
  const rows = q.trim() ? all.filter((r) => r.full_name.toLowerCase().includes(q.trim().toLowerCase())) : all;

  return (
    <AppShell>
      <SectionTabs group="rankings" />
      <h1 className="text-white text-2xl font-bold">{t('nav.globalRank')}</h1>
      <p className="text-gray-400 text-sm">{t('leaderboard.hint')}</p>
      <p className="text-gray-500 text-xs mb-4">{t('leaderboard.rule', { n: data?.min_matches || 3 })}</p>

      <div className="flex flex-wrap gap-3 mb-3">
        <Segmented full items={['all', 'xeve']} value={scope} onChange={setScope} label={(k) => t(`leaderboard.scope_${k}`)} />
        <Segmented full className="flex-1 min-w-[16rem]" items={PERIODS} value={period} onChange={setPeriod} label={(k) => t(`rankings.${k}`)} />
      </div>

      <div className="flex items-center justify-between gap-2 mb-4">
        {period !== 'all' ? <button className="btn-secondary !px-3" aria-label={t('rankings.prev')} onClick={() => setDate(shift(period, date, -1))}>‹</button> : <span />}
        <div className="text-center">
          <div className="text-white font-semibold">{label(period, date, t)}</div>
          {data && <div className="text-gray-400 text-xs">{t('leaderboard.summary', { players: all.length, matches: data.match_count })}</div>}
        </div>
        {period !== 'all' ? <button className="btn-secondary !px-3" aria-label={t('rankings.next')} onClick={() => setDate(shift(period, date, 1))}>›</button> : <span />}
      </div>

      <div className="card">
        <input className="input mb-3 sm:max-w-xs" placeholder={t('leaderboard.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('leaderboard.search')} />
        {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
        {!loading && rows.length === 0 && <p className="text-gray-400 text-sm">{t('leaderboard.none')}</p>}
        {!loading && rows.length > 0 && (
          <div className="table-wrap">
            <table className="w-full text-sm grid-table">
              <thead>
                <tr className="text-left">
                  <th className="w-12 text-center">#</th>
                  <th>{t('common.name')}</th>
                  <th>{t('leaderboard.where')}</th>
                  <th className="text-right">{t('rankings.played')}</th>
                  <th className="text-right">{t('rankings.wins')}</th>
                  <th className="text-right">{t('rankings.losses')}</th>
                  <th className="text-right">{t('rankings.winRate')}</th>
                  <th className="text-right">{t('rankings.diff')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rank = r.rank == null ? null : r.rank - 1;
                  return (
                    <tr key={r.key} className={`hover:bg-navy-700/40 ${rank == null ? 'opacity-60' : ''} ${r.me ? 'bg-lime-400/10' : ''}`}>
                      <td className="text-center text-gray-400">{rank == null ? '—' : <span className={rank < 3 ? 'text-lime-300 font-semibold' : ''}>{rank + 1}</span>}</td>
                      <td className="text-white whitespace-nowrap">{r.full_name}</td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {r.clubs.map((c) => (
                            <span key={c} className="text-[11px] rounded border border-lime-400/40 text-lime-200 px-1.5 whitespace-nowrap">{c}</span>
                          ))}
                          {r.xeve && <span className="text-[11px] rounded border border-sky-400/50 text-sky-200 px-1.5">Xé Vé</span>}
                        </span>
                      </td>
                      <td className="text-right tabular-nums text-gray-200">{r.matches_played}</td>
                      <td className="text-right tabular-nums text-lime-400 font-semibold">{r.wins}</td>
                      <td className="text-right tabular-nums text-gray-300">{r.losses}</td>
                      <td className="text-right tabular-nums text-gray-200">{r.win_rate}%</td>
                      <td className={`text-right tabular-nums ${r.point_diff > 0 ? 'text-lime-400' : r.point_diff < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                        {r.point_diff > 0 ? `+${r.point_diff}` : r.point_diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
