'use client';
import { useMemo } from 'react';
import { useI18n } from '@/context/I18nContext';

// Points scored by each team: badminton sums the points of every game, other sports
// use the match score.
function points(m) {
  if (Array.isArray(m.games) && m.games.length) return m.games.reduce(([a, b], g) => [a + Number(g[0] || 0), b + Number(g[1] || 0)], [0, 0]);
  return [Number(m.team1_score || 0), Number(m.team2_score || 0)];
}

// Who is doing best in this session, from the matches recorded so far: games played,
// won/lost, point difference. Read-only — for the referee and coordinator on court.
export function standings(participants, matches) {
  const rows = new Map(participants.map((p) => [p.id, { id: p.id, name: p.full_name, played: 0, won: 0, lost: 0, diff: 0 }]));
  for (const m of matches || []) {
    if (m.team1_score == null || m.team2_score == null) continue;
    const winner = m.team1_score > m.team2_score ? 1 : m.team2_score > m.team1_score ? 2 : 0;
    const [p1, p2] = points(m);
    for (const mp of m.match_players || []) {
      const r = rows.get(mp.event_participant_id);
      if (!r) continue;
      r.played += 1;
      if (winner === mp.team) r.won += 1;
      else if (winner) r.lost += 1;
      r.diff += mp.team === 1 ? p1 - p2 : p2 - p1;
    }
  }
  return [...rows.values()]
    .filter((r) => r.played)
    .sort((a, b) => b.won - a.won || b.diff - a.diff || a.played - b.played || a.name.localeCompare(b.name, 'vi'));
}

export default function SessionStandings({ participants, matches }) {
  const { t } = useI18n();
  const rows = useMemo(() => standings(participants, matches), [participants, matches]);
  if (!rows.length) return <p className="card text-gray-400 text-sm">{t('staffX.boardEmpty')}</p>;
  return (
    <div className="card !p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-xs border-b border-navy-700">
            <th className="text-left font-medium px-3 py-2 w-8">#</th>
            <th className="text-left font-medium px-3 py-2">{t('staffX.boardPlayer')}</th>
            <th className="text-right font-medium px-3 py-2">{t('staffX.boardPlayed')}</th>
            <th className="text-right font-medium px-3 py-2">{t('staffX.boardWon')}</th>
            <th className="text-right font-medium px-3 py-2">{t('staffX.boardLost')}</th>
            <th className="text-right font-medium px-3 py-2">{t('staffX.boardDiff')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-b border-navy-800 last:border-0">
              <td className="px-3 py-2 text-gray-400">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
              <td className="px-3 py-2 text-white truncate max-w-[12rem]">{r.name}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-300">{r.played}</td>
              <td className="px-3 py-2 text-right tabular-nums text-lime-300 font-semibold">{r.won}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-400">{r.lost}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${r.diff > 0 ? 'text-lime-300' : r.diff < 0 ? 'text-red-300' : 'text-gray-400'}`}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
