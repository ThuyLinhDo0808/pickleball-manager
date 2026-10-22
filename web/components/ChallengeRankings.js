'use client';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import Hint from '@/components/ui/Hint';

// Thách thức: top players of the challenge matches (started from a kèo's rankings).
export default function ChallengeRankings({ clubId }) {
  const { t } = useI18n();
  const { data } = useLoad(() => (clubId ? api.get(`/api/clubs/${clubId}/challenge-rankings`) : Promise.resolve(null)), [clubId]);
  if (!data) return null;
  return (
    <section className="card !px-2 sm:!px-4 mt-4">
      <h2 className="text-white font-semibold mb-1 px-2 sm:px-0">{t('chrank.title')} <Hint inline text={t('chrank.hint')} /></h2>
      {!data.rows.length ? (
        <p className="text-gray-400 text-sm px-2 sm:px-0">{t('chrank.none')}</p>
      ) : (
        <div className="table-wrap">
          <table className="w-full text-sm grid-table !min-w-[30rem]">
            <thead>
              <tr className="text-left">
                <th className="w-10 text-center">#</th>
                <th>{t('common.name')}</th>
                <th className="text-right">{t('chrank.matches')}</th>
                <th className="text-right">{t('estand.won')}</th>
                <th className="text-right">{t('estand.lost')}</th>
                <th className="text-right">{t('estand.rate')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 20).map((r) => (
                <tr key={r.key}>
                  <td className="text-center font-bold"><span className={r.rank <= 3 ? 'text-lime-300' : ''}>{r.rank}</span></td>
                  <td className="text-white !whitespace-normal">{r.name}<span className="block text-gray-500 text-xs">{t('chrank.sessions', { n: r.sessions })}</span></td>
                  <td className="text-right tabular-nums">{r.played}</td>
                  <td className="text-right tabular-nums text-lime-300">{r.won}</td>
                  <td className="text-right tabular-nums text-red-300">{r.lost}</td>
                  <td className="text-right tabular-nums font-semibold">{r.win_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
