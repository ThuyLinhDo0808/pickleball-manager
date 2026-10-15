'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const MEDALS = ['🥇', '🥈', '🥉'];

// Home page: this month's leaderboard of each club / community I play in — my place first,
// then every player (ranked by win rate; under the Host's minimum of matches = no place yet).
// Clubs count their weekly sessions only; a community counts all its kèo.
export default function HomeRankings({ clubs }) {
  const { t } = useI18n();
  const [pick, setPick] = useState(clubs[0]?.club_id || null);
  const club = clubs.find((c) => c.club_id === pick) || clubs[0];
  const { data, error, loading } = useLoad(() => (club ? api.get(`/api/player/clubs/${club.club_id}/rankings?period=month`) : Promise.resolve(null)), [club?.club_id]);
  if (!clubs.length) return null;
  const rows = data?.rankings || [];
  const ranked = rows.filter((r) => r.eligible !== false);
  const mine = rows.find((r) => r.club_member_id === data?.me);

  return (
    <section className="mb-6" aria-labelledby="home-rank-title">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 id="home-rank-title" className="text-white font-semibold">🏆 {t('homeRank.title')}</h2>
        {club && <Link href={`/c/${club.club_id}`} className="text-lime-400 text-xs hover:underline">{t('homeRank.full')} →</Link>}
      </div>
      {clubs.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2" role="tablist" aria-label={t('homeRank.title')}>
          {clubs.map((c) => (
            <button key={c.club_id} type="button" role="tab" aria-selected={c.club_id === club?.club_id} onClick={() => setPick(c.club_id)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${c.club_id === club?.club_id ? 'border-lime-400 bg-lime-400/15 text-lime-200' : 'border-navy-600 text-gray-300'}`}>
              {c.kind === 'community' ? '🎟 ' : '🏠 '}{c.name}
            </button>
          ))}
        </div>
      )}
      <div className="card !p-0 overflow-hidden">
        {loading && !data && <p className="p-4 text-gray-400 text-sm">{t('common.loading')}</p>}
        {error?.status === 402 && <p className="p-4 text-gray-400 text-sm">💎 {t('plan.rankingsOff')}</p>}
        {data && (
          <>
            <div className="px-4 py-3 border-b border-navy-700 bg-navy-900/60">
              <p className="text-gray-400 text-xs">{t('homeRank.month')} · {club.kind === 'community' ? t('homeRank.community') : t('homeRank.club')}</p>
              {mine ? (
                <p className="text-white text-sm mt-0.5">
                  {mine.eligible === false
                    ? t('homeRank.mineNotYet', { n: data.min_matches - mine.matches_played, m: mine.matches_played })
                    : t('homeRank.mine', { rank: mine.rank, total: ranked.length })}
                  <span className="text-gray-400"> · {t('homeRank.mineStats', { w: mine.wins, l: mine.losses, p: mine.win_rate })}</span>
                </p>
              ) : (
                <p className="text-gray-300 text-sm mt-0.5">{t('homeRank.noMatchesYet', { n: data.min_matches })}</p>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="p-4 text-gray-400 text-sm">{t('rankings.noData')}</p>
            ) : (
              <ol className="max-h-80 overflow-y-auto divide-y divide-navy-700">
                {rows.map((r) => (
                  <li key={r.club_member_id} className={`flex items-center gap-3 px-4 py-2 text-sm ${r.club_member_id === data.me ? 'bg-lime-400/10' : ''} ${r.eligible === false ? 'opacity-60' : ''}`}>
                    <span className="w-7 text-center text-gray-400 tabular-nums">{r.eligible === false ? '—' : r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-100">
                      {r.full_name}
                      {r.club_member_id === data.me && <span className="ml-1.5 text-[10px] rounded-full bg-lime-400/20 text-lime-300 px-1.5 py-0.5">{t('rankings.you')}</span>}
                    </span>
                    <span className="text-gray-400 text-xs tabular-nums">{r.wins}-{r.losses}</span>
                    <span className="w-12 text-right text-lime-300 font-semibold tabular-nums">{r.win_rate}%</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-navy-700">{t('homeRank.rule', { n: data.min_matches })}</p>
          </>
        )}
      </div>
    </section>
  );
}
