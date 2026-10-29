'use client';
import { useState } from 'react';
import { Avatar } from '@/components/PlayerChip';
import Segmented from '@/components/ui/Segmented';
import Podium from '@/components/Podium';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { exportRankings } from '@/lib/exportExcel';
import { localDate } from '@/lib/dates';
import UiIcon from '@/components/ui/UiIcon';

const PERIODS = ['day', 'month', 'quarter', 'year', 'all'];
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
  if (period === 'day') return localDate(new Date(y, m - 1, d), lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
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
      <div className="text-gray-300 text-xs font-semibold mb-2">
        <UiIcon name={icon} className="w-4 h-4 text-gray-400" />{title}
      </div>
      {rows.length === 0 && <p className="text-gray-500 text-sm">—</p>}
      <ol className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <li key={r.club_member_id} className="flex items-center justify-between gap-2 text-sm">
            <span className="break-words text-white">
              {rows.length > 1 ? <span className="text-lime-300 tabular-nums mr-1.5">{i + 1}</span> : null}{r.full_name}
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
export default function ClubLeaderboard({ statsUrl, clubName = '', me = null, settingsUrl = null }) {
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState('month');
  const [date, setDate] = useState(todayYmd);
  const [sort, setSort] = useState({ key: null, dir: -1 });
  // Three leaderboards: everyone in the club, the fixed members only, the guests only.
  const [group, setGroup] = useState('all');

  const { data: stats, loading, error, reload } = useLoad(
    () => (statsUrl ? api.get(`${statsUrl}?period=${period}&date=${date}${group === 'all' ? '' : `&group=${group}`}`) : Promise.resolve(null)),
    [statsUrl, period, date, group]
  );

  const periodText = periodLabel(period, date, t, lang);
  // Communities: "Toàn cộng đồng" + the Host's ranking tabs (Bảng điều khiển → Bảng xếp hạng);
  // a tab shows its players only, numbered again from 1.
  const community = !!stats?.community;
  const rankGroups = stats?.rank_groups || [];
  const [rg, setRg] = useState('all');
  const inGroup = (r) => rg === 'all' || r.rank_group === rg;
  let n = 0;
  const rows = (stats?.rankings || []).filter(inGroup).map((r) => (rg === 'all' ? r : { ...r, rank: r.eligible === false ? null : ++n }));
  const boardLabel = community ? (rg === 'all' ? t('homeRank.wholeCommunity') : rankGroups.find((g) => g.key === rg)?.label || '') : t(`rankings.group_${group}`);
  const label = `${periodText} · ${boardLabel}`; // for the Excel file
  if (sort.key) rows.sort((a, b) => sort.dir * (a[sort.key] - b[sort.key]) || a.full_name.localeCompare(b.full_name));
  const a = stats?.awards;
  const meId = me ?? stats?.me ?? null; // the members' endpoint says who I am
  const weeksAtTop = stats?.weeks_at_top || [];
  const weeksOf = new Map(weeksAtTop.map((w) => [w.club_member_id, w.weeks]));

  // Podium: only players with a place (enough matches), by win rate.
  const top3 = !sort.key ? rows.filter((r) => r.eligible !== false).slice(0, 3) : [];
  const onPodium = new Set(top3.map((r) => r.club_member_id));
  const listRows = rows.filter((r) => !onPodium.has(r.club_member_id));
  const saveMin = async (n) => {
    await api.put(settingsUrl, { rank_min_matches: n });
    reload();
  };
  const groupIcon = { all: 'globe', club: 'home', guest: 'users' };

  return (
    <>

      {community ? (
        rankGroups.length > 0 && <UnderlineTabs value={rg} onChange={setRg} tabs={[{ key: 'all', label: t('homeRank.wholeCommunity'), icon: 'globe' }, ...rankGroups.map((g) => ({ key: g.key, label: g.label, icon: 'medal' }))]} />
      ) : (
        <UnderlineTabs value={group} onChange={setGroup} tabs={['all', 'club', 'guest'].map((g) => ({ key: g, label: t(`rankings.group_${g}`), icon: groupIcon[g] }))} />
      )}

      <div className="card !p-3 mb-4 flex flex-wrap items-center gap-2">
        <Segmented items={PERIODS} value={period} onChange={setPeriod} label={(p) => t(`rankings.${p}`)} />
        <div className="flex items-center gap-1 sm:ml-auto">
          {period !== 'all' && <button className="btn-secondary !px-3" aria-label={t('rankings.prev')} onClick={() => setDate(shift(period, date, -1))}>‹</button>}
          <div className="text-center px-2 min-w-[9rem]">
            <div className="text-white font-semibold capitalize text-sm">{periodText}</div>
            {stats && <div className="text-gray-400 text-xs">{t('rankings.matchesCount', { n: stats.match_count })}</div>}
          </div>
          {period !== 'all' && <button className="btn-secondary !px-3" aria-label={t('rankings.next')} onClick={() => setDate(shift(period, date, 1))}>›</button>}
          <button className="btn-secondary text-sm !px-3 ml-1" disabled={!stats?.rankings?.length} title={t('common.exportExcel')} onClick={() => exportRankings(clubName, label, { ...stats, rankings: rows }, t)}><UiIcon name="download" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /><span className="hidden sm:inline"> Excel</span>
          </button>
        </div>
      </div>

      {stats && (
        <p className="text-gray-400 text-xs -mt-2 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{t('rankx.rule', { n: stats.min_matches })}</span>
          {settingsUrl && (
            <label className="inline-flex items-center gap-1">
              <span className="sr-only">{t('rankx.minLabel')}</span>
              <select className="input !py-0.5 !px-2 !w-auto text-xs" value={stats.min_matches} onChange={(e) => saveMin(Number(e.target.value))} aria-label={t('rankx.minLabel')}>
                {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{t('rankx.minN', { n })}</option>)}
              </select>
            </label>
          )}
          {stats.main_only && <span className="text-gray-500">· {t('rankx.mainOnly')}</span>}
        </p>
      )}
      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {error?.status === 402 && <p className="card text-gray-300 text-sm">{t('plan.rankingsOff')}</p>}

      {/* Podium as steps: 2 · 1 · 3, the step's height by place; the list below goes on from 4. */}
      {!loading && top3.length > 0 && <Podium rows={top3.map((r) => ({ key: r.club_member_id, full_name: r.full_name, avatar_uid: r.avatar_uid, avatar_v: r.avatar_v, main: `${r.win_rate}%`, sub: `${r.wins}-${r.losses} · ${r.point_diff > 0 ? `+${r.point_diff}` : r.point_diff}` }))} />}

      {!loading && a && rg === 'all' && (stats.rankings.length > 0 || a.top_attendance.length > 0) && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-2">
            <AwardCard title={t('rankings.topWinRate')} icon="trophy" rows={a.top_win_rate} fmt={(v) => `${v}%`} />
            <AwardCard title={t('rankings.topDiff')} icon="trendUp" rows={a.top_point_diff} fmt={(v) => (v > 0 ? `+${v}` : v)} />
            <AwardCard title={t('rankings.topAttendance')} icon="trophy" rows={a.top_attendance} fmt={(v) => t('rankings.sessions', { n: v })} />
            <AwardCard title={t('rankings.lowest')} icon="trendDown" rows={a.lowest_win_rate ? [a.lowest_win_rate] : []} fmt={(v) => `${v}%`} hint={t('rankings.lowestHint')} />
          </div>
          <p className="text-gray-500 text-xs mb-4">{t('rankings.minNote', { n: a.min_matches })}</p>
        </>
      )}

      {!loading && rg === 'all' && weeksAtTop.length > 0 && (
        <section className="card mb-4 border-amber-300/30">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="text-white font-semibold">{t('rankings.weeksTitle')}</h2>
            <span className="text-gray-500 text-xs">{t('rankings.weeksHint', { group: boardLabel })}</span>
          </div>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {weeksAtTop.slice(0, 6).map((w, i) => (
              <li key={w.club_member_id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${i === 0 ? 'border-amber-300/50 bg-amber-300/5' : 'border-navy-700 bg-navy-900'}`}>
                <span className={`w-6 text-center text-sm tabular-nums ${i < 3 ? 'text-lime-300 font-semibold' : 'text-gray-400'}`}>{i + 1}</span>
                <Avatar uid={w.avatar_uid} v={w.avatar_v} name={w.full_name} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-white text-sm font-semibold break-words">
                    {w.full_name}
                    {w.current && <span className="ml-1.5 text-[10px] rounded-full bg-amber-300/20 text-amber-200 px-1.5 py-0.5 align-middle">{t('rankings.weeksCurrent')}</span>}
                  </div>
                  <div className="text-gray-400 text-xs">{w.current && w.since ? t('rankings.weeksSince', { d: `${w.since.slice(8, 10)}/${w.since.slice(5, 7)}/${w.since.slice(0, 4)}` }) : t('rankings.weeksStreak', { n: w.streak })}</div>
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
            <h2 className="text-white font-semibold">{boardLabel}</h2>
            <span className="text-gray-400 text-xs">{t('rankx.players', { n: rows.length })}</span>
          </div>
          {rows.length > 0 && listRows.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">{t('rankx.onlyPodium')}</p>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-2" aria-hidden="true"><UiIcon name="paddle" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></div>
              <p className="text-gray-400 text-sm">{t('rankings.noData')}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="w-full text-sm rank-table">
                <thead>
                  <tr className="text-left">
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
                    <th className="text-right whitespace-nowrap" title={t('rankings.weeksTitle')}>{t('rankings.weeksCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.map((r, i) => (
                    <tr key={r.club_member_id} className={`${r.club_member_id === meId ? 'bg-lime-400/10' : !sort.key && r.rank && r.rank <= 3 ? 'bg-amber-300/[0.04]' : ''} ${r.eligible === false ? 'opacity-60' : ''}`}>
                      <td className="text-center text-gray-400" title={r.eligible === false ? t('rankx.notEnough', { n: stats.min_matches }) : undefined}>{sort.key ? i + 1 : r.eligible === false ? '—' : r.rank ?? i + 1 + top3.length}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Avatar uid={r.avatar_uid} v={r.avatar_v} name={r.full_name} size={26} />
                          <span className="text-white">{r.full_name}</span>
                          {/* On the member list or not (a quick sign-up / a name typed into a match). */}
                          <span className={`text-[10px] rounded-full px-1.5 py-0.5 whitespace-nowrap ${r.kind === 'guest' ? 'bg-navy-700 text-gray-300' : 'bg-sky-400/15 text-sky-200'}`}>{t(r.kind === 'guest' ? 'rankings.tagGuest' : 'rankings.tagMember')}</span>
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
