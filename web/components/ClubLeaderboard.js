'use client';
import { useState } from 'react';
import { Avatar } from '@/components/PlayerChip';
import Segmented from '@/components/ui/Segmented';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import { useI18n } from '@/context/I18nContext';
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
    <div className="card !p-4">
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

// A club's leaderboards (all / fixed members / guest members) for a period: podium,
// awards, weeks at No. 1 and the full table. `statsUrl`: the managers' or the members'
// endpoint; `me`: the viewer's club member id (their row is marked).
export default function ClubLeaderboard({ statsUrl, clubName = '', me = null }) {
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(todayYmd);
  const [sort, setSort] = useState({ key: null, dir: -1 });
  // Three leaderboards: everyone in the club, the fixed members only, the guests only.
  const [group, setGroup] = useState('all');

  const { data: stats, loading, error } = useLoad(
    () => (statsUrl ? api.get(`${statsUrl}?period=${period}&date=${date}${group === 'all' ? '' : `&group=${group}`}`) : Promise.resolve(null)),
    [statsUrl, period, date, group]
  );

  const periodText = periodLabel(period, date, t, lang);
  const label = `${periodText} · ${t(`rankings.group_${group}`)}`; // for the Excel file
  const rows = [...(stats?.rankings || [])];
  if (sort.key) rows.sort((a, b) => sort.dir * (a[sort.key] - b[sort.key]) || a.full_name.localeCompare(b.full_name));
  const a = stats?.awards;
  const meId = me ?? stats?.me ?? null; // the members' endpoint says who I am
  const weeksAtTop = stats?.weeks_at_top || [];
  const weeksOf = new Map(weeksAtTop.map((w) => [w.club_member_id, w.weeks]));

  const top3 = !sort.key ? rows.slice(0, 3) : [];
  const groupIcon = { all: '🌐', club: '🏠', guest: '🤝' };

  return (
    <>

      <UnderlineTabs value={group} onChange={setGroup} tabs={['all', 'club', 'guest'].map((g) => ({ key: g, label: t(`rankings.group_${g}`), icon: groupIcon[g] }))} />

      <div className="card !p-3 mb-4 flex flex-wrap items-center gap-2">
        <Segmented items={PERIODS} value={period} onChange={setPeriod} label={(p) => t(`rankings.${p}`)} />
        <div className="flex items-center gap-1 sm:ml-auto">
          {period !== 'all' && <button className="btn-secondary !px-3" aria-label={t('rankings.prev')} onClick={() => setDate(shift(period, date, -1))}>‹</button>}
          <div className="text-center px-2 min-w-[9rem]">
            <div className="text-white font-semibold capitalize text-sm">{periodText}</div>
            {stats && <div className="text-gray-400 text-xs">{t('rankings.matchesCount', { n: stats.match_count })}</div>}
          </div>
          {period !== 'all' && <button className="btn-secondary !px-3" aria-label={t('rankings.next')} onClick={() => setDate(shift(period, date, 1))}>›</button>}
          <button className="btn-secondary text-sm !px-3 ml-1" disabled={!stats?.rankings?.length} title={t('common.exportExcel')} onClick={() => exportRankings(clubName, label, stats, t)}>
            ⬇<span className="hidden sm:inline"> Excel</span>
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {error?.status === 402 && <p className="card text-gray-300 text-sm">💎 {t('plan.rankingsOff')}</p>}

      {!loading && top3.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 items-end">
          {[1, 0, 2].map((idx) => {
            const r = top3[idx];
            if (!r) return <div key={idx} />;
            const h = ['pt-8 sm:pt-10', 'pt-4 sm:pt-6', 'pt-1 sm:pt-2'][idx];
            const ring = ['ring-amber-300', 'ring-gray-300', 'ring-orange-400'][idx];
            return (
              <div key={r.club_member_id} className={`card !p-3 text-center flex flex-col items-center ${idx === 0 ? 'border-amber-300/60 bg-amber-300/5' : ''}`}>
                <div className={h} />
                <div className={`rounded-full ring-2 ${ring}`}><Avatar name={r.full_name} size={idx === 0 ? 52 : 42} /></div>
                <div className="text-2xl -mt-2" aria-hidden="true">{MEDALS[idx]}</div>
                <div className="text-white font-semibold text-sm truncate max-w-full">{r.full_name}</div>
                <div className="text-lime-300 text-sm font-bold tabular-nums">{r.win_rate}%</div>
                <div className="text-gray-400 text-[11px] tabular-nums">{r.wins}-{r.losses} · {r.point_diff > 0 ? `+${r.point_diff}` : r.point_diff}</div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && a && (stats.rankings.length > 0 || a.top_attendance.length > 0) && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-2">
            <AwardCard title={t('rankings.topWinRate')} icon="🏆" rows={a.top_win_rate} fmt={(v) => `${v}%`} />
            <AwardCard title={t('rankings.topDiff')} icon="📈" rows={a.top_point_diff} fmt={(v) => (v > 0 ? `+${v}` : v)} />
            <AwardCard title={t('rankings.topAttendance')} icon="💪" rows={a.top_attendance} fmt={(v) => t('rankings.sessions', { n: v })} />
            <AwardCard title={t('rankings.lowest')} icon="🍚" rows={a.lowest_win_rate ? [a.lowest_win_rate] : []} fmt={(v) => `${v}%`} hint={t('rankings.lowestHint')} />
          </div>
          <p className="text-gray-500 text-xs mb-4">{t('rankings.minNote', { n: a.min_matches })}</p>
        </>
      )}

      {!loading && weeksAtTop.length > 0 && (
        <section className="card mb-4 border-amber-300/30">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="text-white font-semibold">👑 {t('rankings.weeksTitle')}</h2>
            <span className="text-gray-500 text-xs">{t('rankings.weeksHint', { group: t(`rankings.group_${group}`) })}</span>
          </div>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {weeksAtTop.slice(0, 6).map((w, i) => (
              <li key={w.club_member_id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${i === 0 ? 'border-amber-300/50 bg-amber-300/5' : 'border-navy-700 bg-navy-900'}`}>
                <span className="w-6 text-center">{i < 3 ? MEDALS[i] : <span className="text-gray-400 text-sm">{i + 1}</span>}</span>
                <Avatar name={w.full_name} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-white text-sm font-semibold truncate">
                    {w.full_name}
                    {w.current && <span className="ml-1.5 text-[10px] rounded-full bg-amber-300/20 text-amber-200 px-1.5 py-0.5 align-middle">{t('rankings.weeksCurrent')}</span>}
                  </div>
                  <div className="text-gray-400 text-xs">{t('rankings.weeksStreak', { n: w.streak })}</div>
                </div>
                <span className="text-amber-300 font-bold tabular-nums shrink-0">{t('rankings.weeksN', { n: w.weeks })}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!loading && stats && (
        <section className="card !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-navy-700 flex items-center justify-between gap-2">
            <h2 className="text-white font-semibold">{groupIcon[group]} {t(`rankings.group_${group}`)}</h2>
            <span className="text-gray-400 text-xs">{t('rankx.players', { n: rows.length })}</span>
          </div>
          {rows.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-2" aria-hidden="true">🏓</div>
              <p className="text-gray-400 text-sm">{t('rankings.noData')}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="w-full text-sm grid-table">
                <thead>
                  <tr className="text-gray-300 text-left bg-navy-900">
                    <th className="w-12 text-center">#</th>
                    <th>{t('common.name')}</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="text-right">
                        <button className={`hover:text-lime-400 ${sort.key === c.key ? 'text-lime-400' : ''}`} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))}>
                          {t(c.label)}
                          {sort.key === c.key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
                        </button>
                      </th>
                    ))}
                    <th className="text-right whitespace-nowrap" title={t('rankings.weeksTitle')}>👑 {t('rankings.weeksCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.club_member_id} className={r.club_member_id === meId ? 'bg-lime-400/10' : !sort.key && i < 3 ? 'bg-amber-300/[0.04]' : ''}>
                      <td className="text-center text-gray-400">{!sort.key && i < 3 ? MEDALS[i] : i + 1}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Avatar name={r.full_name} size={26} />
                          <span className="text-white">{r.full_name}</span>
                          {r.club_member_id === meId && <span className="text-[10px] rounded-full bg-lime-400/20 text-lime-300 px-1.5 py-0.5">{t('rankings.you')}</span>}
                        </span>
                      </td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className={`text-right tabular-nums ${c.key === 'point_diff' ? (r.point_diff > 0 ? 'text-lime-400' : r.point_diff < 0 ? 'text-red-400' : 'text-gray-300') : 'text-gray-300'}`}>
                          {c.key === 'win_rate' ? (
                            <span className="inline-flex items-center gap-2 justify-end">
                              <span className="hidden sm:inline-block w-14 h-1.5 rounded-full bg-navy-900 overflow-hidden">
                                <span className="block h-full bg-lime-400 rounded-full" style={{ width: `${r.win_rate}%` }} />
                              </span>
                              {r.win_rate}%
                            </span>
                          ) : c.fmt ? c.fmt(r[c.key]) : r[c.key]}
                        </td>
                      ))}
                      <td className="text-right tabular-nums text-amber-300">{weeksOf.get(r.club_member_id) || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
