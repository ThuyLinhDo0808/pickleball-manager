'use client';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import Hint from '@/components/ui/Hint';
import Podium from '@/components/Podium';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// Level groups (the community's level bands).
const BANDS = {
  pickleball: [
    { key: 'low', max: 2.99 },
    { key: 'mid', max: 3.5 },
    { key: 'high', max: Infinity },
  ],
  badminton: [
    { key: 'low', max: 2 },
    { key: 'mid', max: 4 },
    { key: 'high', max: Infinity },
  ],
};
const bandOf = (level, sport) => (level == null ? null : (BANDS[sport] || BANDS.pickleball).find((b) => Number(level) <= b.max)?.key || null);
const fmtLevel = (v, sport) => (v == null ? '' : sport === 'badminton' ? String(v) : Number(v).toFixed(2));

// Rankings of each club / community I am a member of (no web-wide board): its own monthly
// ranking (clubs: weekly sessions only). My place first, then everyone; order by win rate
// or by level. Communities: "Toàn cộng đồng" plus the tabs the Host set up in Bảng điều khiển
// (levels or named DUPR bands); clubs: the fixed level bands.
export default function HomeRankings({ clubs = [], showTitle = true }) {
  const { t } = useI18n();
  const [pick, setPick] = useState(null);
  const [band, setBand] = useState('all');
  const [order, setOrder] = useState('rate');
  const club = clubs.find((c) => c.club_id === pick) || clubs[0] || null;
  const sport = club?.sport || 'pickleball';
  const { data, error, loading } = useLoad(
    () => (club ? api.get(`/api/player/clubs/${club.club_id}/rankings?period=month`) : Promise.resolve(null)),
    [club?.club_id]
  );
  const isMe = (r) => r.club_member_id === data?.me;
  const keyOf = (r) => r.club_member_id;
  // The Host's ranking tabs (communities); clubs use the fixed level bands.
  const groups = data?.rank_groups || [];
  const useGroups = !!data?.community;
  const inBand = (r) => band === 'all' || (useGroups ? r.rank_group === band : bandOf(r.level, sport) === band);

  const rows = useMemo(() => {
    let list = (data?.rankings || []).filter(inBand);
    if (order === 'level') {
      list = [...list].sort((a, b) => (b.level ?? -1) - (a.level ?? -1) || b.win_rate - a.win_rate || a.full_name.localeCompare(b.full_name, 'vi'));
      let n = 0;
      return list.map((r) => ({ ...r, place: r.level == null ? null : ++n }));
    }
    let n = 0; // rows come ranked by win rate; re-number inside the level group
    return list.map((r) => ({ ...r, place: r.eligible === false ? null : ++n }));
  }, [data, band, order, sport]); // eslint-disable-line react-hooks/exhaustive-deps
  const placed = rows.filter((r) => r.place != null).length;
  const mine = rows.find(isMe);
  const scopeLabel = club?.kind === 'community' ? t('homeRank.community') : t('homeRank.club');
  const choose = (id) => {
    setPick(id);
    setBand('all');
  };
  const ranked = rows.filter((r) => r.place != null);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const unranked = rows.filter((r) => r.place == null);
  const levelName = sport === 'badminton' ? t('homeRank.levelLabel') : 'DUPR';
  // One player per row: place in a circle · name (+ "Bạn") and level · record on a second line ·
  // the number the list is ordered by, big on the right.
  const RankList = ({ rows: list, muted = false }) => (
    <ol className={`rounded-xl border border-navy-600 divide-y divide-navy-600 overflow-hidden ${muted ? 'opacity-70' : ''}`}>
      <li className="flex items-stretch divide-x divide-navy-600 bg-navy-900 text-gray-300 text-xs font-semibold uppercase tracking-wide [&>*]:px-2 [&>*]:py-2" aria-hidden="true">
        <span className="w-8 text-center">#</span>
        <span className="flex-1">{t('common.name')}</span>
        <span>{order === 'level' ? levelName : t('homeRank.byRate')}</span>
      </li>
      {list.map((r, i) => (
        <li key={keyOf(r)} className={`flex items-stretch divide-x divide-navy-600 [&>*]:px-2 [&>*]:py-2 [&>*]:flex [&>*]:items-center ${isMe(r) ? 'bg-lime-400/10' : i % 2 ? 'bg-navy-800/40' : ''}`}>
          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold tabular-nums ${isMe(r) ? 'border-lime-400/70 text-lime-300' : 'border-navy-600 text-gray-300'}`}>{r.place ?? '—'}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-white text-sm font-semibold break-words">
              {r.full_name}
              {isMe(r) && <span className="ml-1.5 align-middle text-[10px] rounded-full bg-lime-400/20 text-lime-300 px-1.5 py-0.5">{t('rankings.you')}</span>}
            </span>
            <span className="block text-gray-400 text-xs tabular-nums">
              {levelName} {fmtLevel(r.level, sport) || '—'} · {t('cpeople.record', { n: r.matches_played, w: r.wins, l: r.losses })}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-white font-bold tabular-nums">{order === 'level' ? fmtLevel(r.level, sport) || '—' : `${r.win_rate}%`}</span>
            {order === 'level' && <span className="block text-gray-400 text-xs tabular-nums">{r.win_rate}%</span>}
          </span>
        </li>
      ))}
    </ol>
  );
  const small = (on) => `rounded-md px-2.5 py-2 sm:px-2 sm:py-0.5 text-xs sm:text-[11px] transition-colors ${on ? 'bg-navy-600 text-white' : 'text-gray-400 hover:text-gray-200'}`;

  return (
    <section className="mb-6" aria-labelledby="home-rank-title">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 id="home-rank-title" className={showTitle ? 'text-white font-semibold' : 'sr-only'}>{t('homeRank.title')}</h2>
        {club && <Link href={`/c/${club.club_id}`} className="text-lime-400 text-xs hover:underline">{t('homeRank.full')} →</Link>}
      </div>
      <UnderlineTabs className="mb-2" value={club?.club_id} onChange={choose} tabs={clubs.map((c) => ({ key: c.club_id, label: c.name }))} />
      {!club ? (
        <p className="card text-gray-400 text-sm">{t('homeRank.noClubs')}</p>
      ) : (
      <div className="card !p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-b border-navy-700 text-[11px] text-gray-400">
          {useGroups ? (
            groups.length > 0 && (
              <span className="flex flex-wrap items-center gap-0.5" role="group" aria-label={t('homeRank.groupLabel')}>
                {[{ key: 'all', label: t('homeRank.wholeCommunity') }, ...groups].map((g) => (
                  <button key={g.key} type="button" aria-pressed={band === g.key} onClick={() => setBand(g.key)} className={small(band === g.key)}>{g.label}</button>
                ))}
              </span>
            )
          ) : (
            <span className="flex items-center gap-0.5" role="group" aria-label={t('homeRank.levelLabel')}>
              <span className="mr-1">{t('homeRank.levelLabel')}:</span>
              {['all', 'low', 'mid', 'high'].map((k) => (
                <button key={k} type="button" aria-pressed={band === k} onClick={() => setBand(k)} className={small(band === k)}>{t(`homeRank.band_${sport === 'badminton' ? 'b_' : ''}${k}`)}</button>
              ))}
            </span>
          )}
          <span className="flex items-center gap-0.5" role="group" aria-label={t('homeRank.orderLabel')}>
            <span className="mr-1">{t('homeRank.orderLabel')}:</span>
            <button type="button" aria-pressed={order === 'rate'} onClick={() => setOrder('rate')} className={small(order === 'rate')}>{t('homeRank.byRate')}</button>
            <button type="button" aria-pressed={order === 'level'} onClick={() => setOrder('level')} className={small(order === 'level')}>{t('homeRank.byLevel')}</button>
          </span>
        </div>
        {loading && !data && <p className="p-4 text-gray-400 text-sm">{t('common.loading')}</p>}
        {error?.status === 402 && <p className="p-4 text-gray-400 text-sm">{t('plan.rankingsOff')}</p>}
        {error && error.status !== 402 && <p className="p-4 text-red-300 text-sm">{error.message}</p>}
        {data && (
          <>
            {/* Where I stand: big place number + record, on top. */}
            <div className="px-4 py-3 border-b border-navy-700 bg-navy-900/60 flex items-center gap-3">
              <span className={`shrink-0 inline-flex h-12 min-w-12 px-2 items-center justify-center rounded-xl border text-lg font-extrabold tabular-nums ${mine?.place != null ? 'border-lime-400/60 bg-lime-400/10 text-lime-300' : 'border-navy-600 text-gray-400'}`}>
                {mine?.place != null ? `#${mine.place}` : '—'}
              </span>
              <span className="min-w-0">
                <span className="block text-gray-400 text-xs">{t('homeRank.month')} · {scopeLabel}</span>
                {mine ? (
                  <span className="block text-white text-sm mt-0.5">
                    {mine.place == null
                      ? order === 'level'
                        ? t('homeRank.mineNoLevel')
                        : t('homeRank.mineNotYet', { n: data.min_matches - mine.matches_played, m: mine.matches_played })
                      : t('homeRank.mine', { rank: mine.place, total: placed })}
                    <span className="block text-gray-400 text-xs tabular-nums">{t('homeRank.mineStats', { w: mine.wins, l: mine.losses, p: mine.win_rate })}</span>
                  </span>
                ) : (data.rankings || []).some(isMe) ? (
                  <span className="block text-gray-300 text-sm mt-0.5">{t('homeRank.otherBand')}</span>
                ) : (
                  <span className="block text-gray-300 text-sm mt-0.5">{t('homeRank.noMatchesYet', { n: data.min_matches })}</span>
                )}
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="p-4 text-gray-400 text-sm">{t('rankings.noData')}</p>
            ) : (
              <div className="p-3 sm:p-4 flex flex-col gap-3">
                {/* Top 1 · 2 · 3 on the podium (cups); everyone else in the list below. */}
                {top.length > 0 && (
                  <Podium
                    className="rounded-xl border border-navy-600 bg-navy-900/50 pt-4"
                    rows={top.map((r) => ({
                      key: keyOf(r),
                      full_name: r.full_name,
                      avatar_uid: r.avatar_uid,
                      avatar_v: r.avatar_v,
                      main: order === 'level' ? fmtLevel(r.level, sport) || '—' : `${r.win_rate}%`,
                      sub: t('cpeople.record', { n: r.matches_played, w: r.wins, l: r.losses }),
                    }))}
                  />
                )}
                {rest.length > 0 && <RankList rows={rest} />}
                {unranked.length > 0 && (
                  <div>
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1.5 px-1">{order === 'level' ? t('homeRank.noLevelYet') : t('homeRank.notRanked', { n: data.min_matches })}</p>
                    <RankList rows={unranked} muted />
                  </div>
                )}
              </div>
            )}
            <div className="px-4 py-2 border-t border-navy-700">
              <Hint text={order === 'level' ? t('homeRank.ruleLevel') : t('homeRank.rule', { n: data.min_matches })} />
            </div>
          </>
        )}
      </div>
      )}
    </section>
  );
}
