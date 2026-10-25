'use client';
import { useMemo, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import Hint from '@/components/ui/Hint';
import Podium from '@/components/Podium';
import { challengePick, eventStandings } from '@/lib/eventStandings';

// Bảng xếp hạng of this kèo only (scored matches): top 3 on a podium with cups, the rest in a
// table (played, won, lost, point difference, win rate). Below it, the challenge suggestion:
// the best player with the last one against a random pair from ranks 2-5 of the same genders;
// the Host sets the reward and starts it as a match (scored in Nhập điểm).
export default function EventStandings({ matches, onChallenge }) {
  const { t } = useI18n();
  const rows = useMemo(() => eventStandings(matches), [matches]);
  const [seed, setSeed] = useState(0);
  const pick = useMemo(() => challengePick(rows), [rows, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const [reward, setReward] = useState('');

  if (!rows.length) return <p className="card text-gray-400 text-sm">{t('estand.none')}</p>;
  const g = (r) => (r.gender ? ` (${t(`members.${r.gender}`)})` : '');
  const names = (team) => team.map((r) => `${r.name}${g(r)}`).join(' & ');
  const sign = (d) => (d > 0 ? `+${d}` : d);
  const rest = rows.length > 3 ? rows.slice(3) : [];
  return (
    <div className="flex flex-col gap-4">
      <section className="card !px-2 sm:!px-4">
        <h3 className="text-white font-semibold mb-3 px-2 sm:px-0">{t('estand.title')} <Hint inline text={t('estand.hint')} /></h3>
        {/* Top 1 · 2 · 3 on the podium (cups), everyone else in the table below. */}
        <Podium
          className="rounded-xl border border-navy-600 bg-navy-900/50 pt-4 mb-4"
          rows={rows.slice(0, 3).map((r) => ({ key: r.id, full_name: r.name, avatar_uid: r.user_id, main: `${r.rate}%`, sub: `${t('cpeople.record', { n: r.played, w: r.won, l: r.lost })} · ${sign(r.diff)}` }))}
        />
        {rest.length > 0 && (
          <div className="rounded-xl border border-navy-600 overflow-hidden">
            <div className="table-wrap">
              <table className="w-full text-sm !min-w-[30rem] border-collapse">
                <thead>
                  <tr className="bg-navy-900/80 text-gray-400 text-xs uppercase tracking-wide">
                    <th className="w-12 text-center py-2.5 font-semibold">#</th>
                    <th className="text-left py-2.5 font-semibold">{t('common.name')}</th>
                    <th className="text-right py-2.5 px-3 font-semibold">{t('estand.played')}</th>
                    <th className="text-right py-2.5 px-3 font-semibold">{t('estand.won')}</th>
                    <th className="text-right py-2.5 px-3 font-semibold">{t('estand.lost')}</th>
                    <th className="text-right py-2.5 px-3 font-semibold">{t('estand.diff')}</th>
                    <th className="text-right py-2.5 px-3 font-semibold">{t('estand.rate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700">
                  {rest.map((r, i) => (
                    <tr key={r.id} className={`${i % 2 ? 'bg-navy-800/40' : ''} ${r.rank === rows.length ? 'bg-red-400/5' : ''}`}>
                      <td className="text-center py-2.5">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-navy-600 text-gray-300 font-bold tabular-nums">{r.rank}</span>
                      </td>
                      <td className="text-white !whitespace-normal py-2.5 font-medium">{r.name}</td>
                      <td className="text-right tabular-nums py-2.5 px-3">{r.played}</td>
                      <td className="text-right tabular-nums py-2.5 px-3 text-lime-300">{r.won}</td>
                      <td className="text-right tabular-nums py-2.5 px-3 text-red-300">{r.lost}</td>
                      <td className={`text-right tabular-nums py-2.5 px-3 ${r.diff < 0 ? 'text-red-300' : 'text-gray-200'}`}>{sign(r.diff)}</td>
                      <td className="text-right tabular-nums py-2.5 px-3 font-semibold text-white">{r.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border-2 border-navy-600 bg-navy-700 p-3 sm:p-4">
        <h3 className="text-gray-200 font-bold">{t('estand.challengeTitle')} <Hint inline text={t('estand.challengeHint')} /></h3>
        {!pick ? (
          <p className="text-gray-300 text-sm mt-1">{t(rows.length < 4 ? 'estand.needMore' : 'estand.noGenderPair')}</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-2 mt-3 text-center">
              <div className="rounded-xl bg-navy-900/80 px-3 py-2">
                <p className="text-xs text-gray-400">{t('estand.topLast')}</p>
                <p className="text-white font-semibold">{names(pick.team1)}</p>
              </div>
              <span className="text-gray-200 font-bold">VS</span>
              <div className="rounded-xl bg-navy-900/80 px-3 py-2">
                <p className="text-xs text-gray-400">{t(pick.wider ? 'estand.randomPairWider' : 'estand.randomPair')}</p>
                <p className="text-white font-semibold">{names(pick.team2)}</p>
              </div>
            </div>
            <label className="block text-xs text-gray-300 mt-3">
              {t('estand.reward')}
              <input className="input mt-1" maxLength={200} placeholder={t('estand.rewardPh')} value={reward} onChange={(e) => setReward(e.target.value)} />
            </label>
            <div className="flex flex-wrap justify-end gap-2 mt-3">
              <button type="button" className="btn-secondary text-sm" onClick={() => setSeed(seed + 1)}>{t('estand.reroll')}</button>
              <button type="button" className="btn-primary text-sm" onClick={() => onChallenge(pick, reward)}>{t('estand.start')}</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
