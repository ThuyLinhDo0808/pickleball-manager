'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { exportRankings } from '@/lib/exportExcel';

const PERIODS = ['day', 'month', 'quarter', 'year', 'all'];
const MEDALS = ['🥇', '🥈', '🥉'];
const pad = (n) => String(n).padStart(2, '0');

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Move the anchor date one period back (-1) or forward (+1).
function shift(period, ymd, dir) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, period === 'day' ? d : 1));
  if (period === 'day') date.setUTCDate(date.getUTCDate() + dir);
  if (period === 'month') date.setUTCMonth(date.getUTCMonth() + dir);
  if (period === 'quarter') date.setUTCMonth(date.getUTCMonth() + 3 * dir);
  if (period === 'year') date.setUTCFullYear(date.getUTCFullYear() + dir);
  return date.toISOString().slice(0, 10);
}

function periodLabel(period, ymd, t, lang) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (period === 'all') return t('rankings.all');
  if (period === 'day') return new Date(y, m - 1, d).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  if (period === 'month') return `${t('rankings.month')} ${m}/${y}`;
  if (period === 'quarter') return `${t('rankings.quarter')} ${Math.ceil(m / 3)}/${y}`;
  return `${t('rankings.year')} ${y}`;
}

const COLUMNS = [
  { key: 'matches_played', label: 'rankings.played' },
  { key: 'wins', label: 'rankings.wins' },
  { key: 'losses', label: 'rankings.losses' },
  { key: 'win_rate', label: 'rankings.winRate', fmt: (v) => `${v}%` },
  { key: 'points_scored', label: 'rankings.pointsFor' },
  { key: 'points_lost', label: 'rankings.pointsAgainst' },
  { key: 'point_diff', label: 'rankings.diff', fmt: (v) => (v > 0 ? `+${v}` : v) },
];

function AwardCard({ title, icon, rows, fmt, hint }) {
  return (
    <div className="card">
      <div className="text-gray-300 text-xs font-semibold uppercase tracking-wide mb-2">
        {icon} {title}
      </div>
      {rows.length === 0 && <p className="text-gray-500 text-sm">—</p>}
      <ol className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <li key={r.club_member_id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-white">
              {rows.length > 1 ? MEDALS[i] : ''} {r.full_name}
            </span>
            <span className="text-lime-400 font-semibold tabular-nums shrink-0">{fmt(r.value)}</span>
          </li>
        ))}
      </ol>
      {hint && rows.length > 0 && <p className="text-gray-500 text-xs mt-2">{hint}</p>}
    </div>
  );
}

export default function RankingsPage() {
  const { t, lang } = useI18n();
  const { club } = useDefaultClub();
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(todayYmd);
  const [sort, setSort] = useState({ key: null, dir: -1 });
  // Two leaderboards: the club community (fixed members) and the guests.
  const [group, setGroup] = useState('club');

  const { data: stats, loading } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/stats?period=${period}&date=${date}&group=${group}`) : Promise.resolve(null)),
    [club?.id, period, date, group]
  );

  const periodText = periodLabel(period, date, t, lang);
  const label = `${periodText} · ${t(`rankings.group_${group}`)}`; // for the Excel file
  const rows = [...(stats?.rankings || [])];
  if (sort.key) rows.sort((a, b) => sort.dir * (a[sort.key] - b[sort.key]) || a.full_name.localeCompare(b.full_name));
  const a = stats?.awards;

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-white text-2xl font-bold">{t('nav.rankings')}</h1>
        <button
          className="btn-secondary text-sm"
          disabled={!stats?.rankings?.length}
          onClick={() => exportRankings(club?.name || '', label, stats, t)}
        >
          {t('common.exportExcel')}
        </button>
      </div>

      <div role="tablist" className="grid grid-cols-2 gap-1 bg-navy-900 border border-navy-700 rounded-xl p-1 mb-3">
        {['club', 'guest'].map((g) => (
          <button
            key={g}
            role="tab"
            aria-selected={group === g}
            onClick={() => setGroup(g)}
            className={`rounded-lg py-2 text-sm font-semibold ${group === g ? (g === 'club' ? 'bg-lime-400 text-navy-950' : 'bg-sky-400 text-navy-950') : 'text-gray-400 hover:text-white'}`}
          >
            {g === 'club' ? '🏠 ' : '🤝 '}
            {t(`rankings.group_${g}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 bg-navy-900 rounded-lg p-1 text-sm mb-3">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md py-1.5 ${period === p ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400 hover:text-white'}`}
          >
            {t(`rankings.${p}`)}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mb-4">
        {period !== 'all' ? (
          <button className="btn-secondary !px-3" aria-label={t('rankings.prev')} onClick={() => setDate(shift(period, date, -1))}>‹</button>
        ) : (
          <span />
        )}
        <div className="text-center">
          <div className="text-white font-semibold capitalize">{periodText}</div>
          {stats && <div className="text-gray-400 text-xs">{t('rankings.matchesCount', { n: stats.match_count })}</div>}
        </div>
        {period !== 'all' ? (
          <button className="btn-secondary !px-3" aria-label={t('rankings.next')} onClick={() => setDate(shift(period, date, 1))}>›</button>
        ) : (
          <span />
        )}
      </div>

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}

      {!loading && a && (stats.rankings.length > 0 || a.top_attendance.length > 0) && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-2">
            <AwardCard title={t('rankings.topWinRate')} icon="🏆" rows={a.top_win_rate} fmt={(v) => `${v}%`} />
            <AwardCard title={t('rankings.topDiff')} icon="📈" rows={a.top_point_diff} fmt={(v) => (v > 0 ? `+${v}` : v)} />
            <AwardCard title={t('rankings.topAttendance')} icon="💪" rows={a.top_attendance} fmt={(v) => t('rankings.sessions', { n: v })} />
            <AwardCard
              title={t('rankings.lowest')}
              icon="🍚"
              rows={a.lowest_win_rate ? [a.lowest_win_rate] : []}
              fmt={(v) => `${v}%`}
              hint={t('rankings.lowestHint')}
            />
          </div>
          <p className="text-gray-500 text-xs mb-4">{t('rankings.minNote', { n: a.min_matches })}</p>
        </>
      )}

      {!loading && stats && (
        <div className="card">
          {rows.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('rankings.noData')}</p>
          ) : (
            <div className="table-wrap">
              <table className="w-full text-sm grid-table">
                <thead>
                  <tr className="text-gray-300 text-left bg-navy-900">
                    <th className="w-12 text-center">#</th>
                    <th>{t('common.name')}</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="text-right">
                        <button
                          className={`hover:text-lime-400 ${sort.key === c.key ? 'text-lime-400' : ''}`}
                          onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))}
                        >
                          {t(c.label)}
                          {sort.key === c.key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.club_member_id}>
                      <td className="text-center text-gray-400">{!sort.key && i < 3 ? MEDALS[i] : i + 1}</td>
                      <td className="text-white">{r.full_name}</td>
                      {COLUMNS.map((c) => (
                        <td
                          key={c.key}
                          className={`text-right tabular-nums ${
                            c.key === 'point_diff' ? (r.point_diff > 0 ? 'text-lime-400' : r.point_diff < 0 ? 'text-red-400' : 'text-gray-300') : 'text-gray-300'
                          }`}
                        >
                          {c.fmt ? c.fmt(r[c.key]) : r[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
