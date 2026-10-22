'use client';
import Hint from '@/components/ui/Hint';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// Level groups (same bands as the Top tháng race).
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

// Home page rankings, two views:
// - "Xé vé · toàn web": every xé vé game on the web (Xé Vé, community kèo, club kèo outside its
//   weekly schedule), one row per player.
// - Each club / community I play in: its own monthly ranking (clubs: weekly sessions only).
// Both: my place first, then everyone; filter by level group; order by win rate or by level.
export default function HomeRankings({ clubs = [], showTitle = true }) {
  const { t } = useI18n();
  const [pick, setPick] = useState('xeve');
  const [band, setBand] = useState('all');
  const [order, setOrder] = useState('rate');
  const club = pick === 'xeve' ? null : clubs.find((c) => c.club_id === pick) || null;
  const sport = club?.sport || clubs[0]?.sport || 'pickleball';
  const { data, error, loading } = useLoad(
    () => (club ? api.get(`/api/player/clubs/${club.club_id}/rankings?period=month`) : api.get(`/api/leaderboard?scope=xeve&period=month&sport=${sport}`)),
    [club?.club_id, sport]
  );
  const isMe = (r) => (club ? r.club_member_id === data?.me : !!r.me);
  const keyOf = (r) => r.club_member_id || r.key;

  const rows = useMemo(() => {
    let list = (data?.rankings || []).filter((r) => band === 'all' || bandOf(r.level, sport) === band);
    if (order === 'level') {
      list = [...list].sort((a, b) => (b.level ?? -1) - (a.level ?? -1) || b.win_rate - a.win_rate || a.full_name.localeCompare(b.full_name, 'vi'));
      let n = 0;
      return list.map((r) => ({ ...r, place: r.level == null ? null : ++n }));
    }
    let n = 0; // rows come ranked by win rate; re-number inside the level group
    return list.map((r) => ({ ...r, place: r.eligible === false ? null : ++n }));
  }, [data, band, order, sport]);
  const placed = rows.filter((r) => r.place != null).length;
  const mine = rows.find(isMe);
  const scopeLabel = club ? (club.kind === 'community' ? t('homeRank.community') : t('homeRank.club')) : t('homeRank.xeveAll');
  const chip = (on) => `inline-flex items-center min-h-[2.75rem] sm:min-h-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${on ? 'border-lime-400 bg-lime-400/15 text-lime-200' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`;
  const small = (on) => `rounded-md px-2.5 py-2 sm:px-2 sm:py-0.5 text-xs sm:text-[11px] transition-colors ${on ? 'bg-navy-600 text-white' : 'text-gray-400 hover:text-gray-200'}`;

  return (
    <section className="mb-6" aria-labelledby="home-rank-title">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 id="home-rank-title" className={showTitle ? 'text-white font-semibold' : 'sr-only'}>{t('homeRank.title')}</h2>
        {club && <Link href={`/c/${club.club_id}`} className="text-lime-400 text-xs hover:underline">{t('homeRank.full')} →</Link>}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2" role="tablist" aria-label={t('homeRank.title')}>
        <button type="button" role="tab" aria-selected={pick === 'xeve'} onClick={() => setPick('xeve')} className={chip(pick === 'xeve')}>{t('homeRank.xeveTab')}</button>
        {clubs.map((c) => (
          <button key={c.club_id} type="button" role="tab" aria-selected={c.club_id === pick} onClick={() => setPick(c.club_id)} className={chip(c.club_id === pick)}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="card !p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-b border-navy-700 text-[11px] text-gray-400">
          <span className="flex items-center gap-0.5" role="group" aria-label={t('homeRank.levelLabel')}>
            <span className="mr-1">{t('homeRank.levelLabel')}:</span>
            {['all', 'low', 'mid', 'high'].map((k) => (
              <button key={k} type="button" aria-pressed={band === k} onClick={() => setBand(k)} className={small(band === k)}>{t(`homeRank.band_${sport === 'badminton' ? 'b_' : ''}${k}`)}</button>
            ))}
          </span>
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
            <div className="px-4 py-3 border-b border-navy-700 bg-navy-900/60">
              <p className="text-gray-400 text-xs">{t('homeRank.month')} · {scopeLabel}</p>
              {mine ? (
                <p className="text-white text-sm mt-0.5">
                  {mine.place == null
                    ? order === 'level'
                      ? t('homeRank.mineNoLevel')
                      : t('homeRank.mineNotYet', { n: data.min_matches - mine.matches_played, m: mine.matches_played })
                    : t('homeRank.mine', { rank: mine.place, total: placed })}
                  <span className="text-gray-400"> · {t('homeRank.mineStats', { w: mine.wins, l: mine.losses, p: mine.win_rate })}</span>
                </p>
              ) : (data.rankings || []).some(isMe) ? (
                <p className="text-gray-300 text-sm mt-0.5">{t('homeRank.otherBand')}</p>
              ) : (
                <p className="text-gray-300 text-sm mt-0.5">{t('homeRank.noMatchesYet', { n: data.min_matches })}</p>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="p-4 text-gray-400 text-sm">{t('rankings.noData')}</p>
            ) : (
              <ol className="divide-y divide-navy-700">
                {rows.map((r) => (
                  <li key={keyOf(r)} className={`flex items-center gap-3 px-4 py-2 text-sm ${isMe(r) ? 'bg-lime-400/10' : ''} ${r.place == null ? 'opacity-60' : ''}`}>
                    <span className={`w-7 text-center tabular-nums ${r.place != null && r.place <= 3 ? 'text-lime-300 font-bold' : 'text-gray-400'}`}>{r.place == null ? '—' : r.place}</span>
                    <span className="min-w-0 flex-1 break-words text-gray-100">
                      {r.full_name}
                      {isMe(r) && <span className="ml-1.5 text-[10px] rounded-full bg-lime-400/20 text-lime-300 px-1.5 py-0.5">{t('rankings.you')}</span>}
                      {!club && r.clubs?.length > 0 && <span className="block text-[10px] text-gray-500 break-words">{r.clubs.join(' · ')}</span>}
                    </span>
                    <span className={`w-10 text-right text-xs tabular-nums ${order === 'level' ? 'text-lime-300 font-semibold' : 'text-gray-400'}`}>{fmtLevel(r.level, sport) || '—'}</span>
                    <span className="text-gray-400 text-xs tabular-nums">{r.wins}-{r.losses}</span>
                    <span className={`w-12 text-right tabular-nums ${order === 'rate' ? 'text-lime-300 font-semibold' : 'text-gray-400 text-xs'}`}>{r.win_rate}%</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="px-4 py-2 border-t border-navy-700">
              <Hint text={order === 'level' ? t('homeRank.ruleLevel') : club ? t('homeRank.rule', { n: data.min_matches }) : t('homeRank.ruleXeve', { n: data.min_matches })} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
