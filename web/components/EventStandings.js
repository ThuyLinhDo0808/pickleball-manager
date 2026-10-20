'use client';
import { useMemo, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import Hint from '@/components/ui/Hint';
import { challengePick, eventStandings } from '@/lib/eventStandings';

// Bảng xếp hạng of this kèo only (scored matches): played, won, lost, point difference, win
// rate — nobody has to remember their matches. Below it, the challenge suggestion: the best
// player with the last one against a random pair from ranks 2-5; the Host sets the reward
// and starts it as a match (scored in Nhập điểm).
export default function EventStandings({ matches, onChallenge }) {
  const { t } = useI18n();
  const rows = useMemo(() => eventStandings(matches), [matches]);
  const [seed, setSeed] = useState(0);
  const pick = useMemo(() => challengePick(rows), [rows, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const [reward, setReward] = useState('');

  if (!rows.length) return <p className="card text-gray-400 text-sm">{t('estand.none')}</p>;
  const names = (team) => team.map((r) => r.name).join(' & ');
  return (
    <div className="flex flex-col gap-4">
      <section className="card !px-2 sm:!px-4">
        <h3 className="text-white font-semibold mb-1 px-2 sm:px-0">🏅 {t('estand.title')} <Hint inline text={t('estand.hint')} /></h3>
        <div className="table-wrap">
          <table className="w-full text-sm grid-table !min-w-[30rem]">
            <thead>
              <tr className="text-gray-300 text-left bg-navy-900">
                <th className="w-10 text-center">#</th>
                <th>{t('common.name')}</th>
                <th className="text-right">{t('estand.played')}</th>
                <th className="text-right">{t('estand.won')}</th>
                <th className="text-right">{t('estand.lost')}</th>
                <th className="text-right">{t('estand.diff')}</th>
                <th className="text-right">{t('estand.rate')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.rank === 1 ? 'bg-lime-400/5' : r.rank === rows.length ? 'bg-red-400/5' : ''}>
                  <td className="text-center font-bold">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}</td>
                  <td className="text-white !whitespace-normal">{r.name}</td>
                  <td className="text-right tabular-nums">{r.played}</td>
                  <td className="text-right tabular-nums text-lime-300">{r.won}</td>
                  <td className="text-right tabular-nums text-red-300">{r.lost}</td>
                  <td className={`text-right tabular-nums ${r.diff < 0 ? 'text-red-300' : 'text-gray-200'}`}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                  <td className="text-right tabular-nums font-semibold">{r.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-violet-400/70 bg-violet-400/10 p-3 sm:p-4">
        <h3 className="text-violet-100 font-bold">⚔️ {t('estand.challengeTitle')} <Hint inline text={t('estand.challengeHint')} /></h3>
        {!pick ? (
          <p className="text-gray-300 text-sm mt-1">{t('estand.needMore')}</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-2 mt-3 text-center">
              <div className="rounded-xl bg-navy-900/80 px-3 py-2">
                <p className="text-xs text-gray-400">{t('estand.topLast')}</p>
                <p className="text-white font-semibold">{names(pick.team1)}</p>
              </div>
              <span className="text-violet-200 font-bold">VS</span>
              <div className="rounded-xl bg-navy-900/80 px-3 py-2">
                <p className="text-xs text-gray-400">{t('estand.randomPair')}</p>
                <p className="text-white font-semibold">{names(pick.team2)}</p>
              </div>
            </div>
            <label className="block text-xs text-gray-300 mt-3">
              🎁 {t('estand.reward')}
              <input className="input mt-1" maxLength={200} placeholder={t('estand.rewardPh')} value={reward} onChange={(e) => setReward(e.target.value)} />
            </label>
            <div className="flex flex-wrap justify-end gap-2 mt-3">
              <button type="button" className="btn-secondary text-sm" onClick={() => setSeed(seed + 1)}>🎲 {t('estand.reroll')}</button>
              <button type="button" className="btn-primary text-sm" onClick={() => onChallenge(pick, reward)}>⚔️ {t('estand.start')}</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
