'use client';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

export default function RankingsPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data: rankings, loading } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/rankings`) : Promise.resolve([])),
    [club?.id]
  );

  const sorted = [...(rankings || [])].sort((a, b) => (b.wins || 0) - (a.wins || 0));

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('nav.rankings')}</h1>
      <div className="card">
        {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
        {!loading && sorted.length === 0 && <p className="text-gray-400 text-sm">—</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left border-b border-navy-700">
              <th className="py-2">#</th>
              <th>{t('common.name')}</th>
              <th>Wins</th>
              <th>Matches</th>
              <th>Win %</th>
              <th>Points +/-</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.club_member_id} className="border-b border-navy-800">
                <td className="py-2 text-gray-400">{i + 1}</td>
                <td className="text-white">{r.full_name}</td>
                <td className="text-gray-300">{r.wins}</td>
                <td className="text-gray-300">{r.matches_played}</td>
                <td className="text-gray-300">
                  {r.matches_played ? `${Math.round((100 * r.wins) / r.matches_played)}%` : '—'}
                </td>
                <td className="text-gray-300">{(r.points_scored || 0) - (r.points_lost || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
