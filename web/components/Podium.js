'use client';
import { useI18n } from '@/context/I18nContext';

// champion, runner-up, third (two teams share it when there is no third-place match).
export default function Podium({ podium, compact = false }) {
  const { t } = useI18n();
  if (!podium?.first) return null;
  const third = podium.third || [];
  const rows = [
    ['medal', t('tournaments.champion'), podium.first ? [podium.first] : [], 'text-amber-300'],
    ['medal', t('tournaments.runnerUp'), podium.second ? [podium.second] : [], 'text-gray-200'],
    ['medal', third.length > 1 ? t('tournaments.thirdShared') : t('tournaments.third'), third, 'text-orange-300'],
  ].filter((r) => r[2].length);

  if (compact) {
    return (
      <ul className="mt-2 flex flex-col gap-0.5 text-sm">
        {rows.map(([icon, label, teams, color]) => (
          <li key={label} className="flex gap-2 min-w-0">
            
            <span className="text-gray-400 shrink-0">{label}:</span>
            <span className={`font-semibold break-words ${color}`}>{teams.map((x) => x.name).join(', ')}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="card mb-4 border-lime-400 py-5">
      <div className="grid gap-3 sm:grid-cols-3 text-center items-end">
        {rows.map(([icon, label, teams, color], i) => (
          <div key={label} className={`rounded-lg bg-navy-900 px-3 ${i === 0 ? 'py-5 sm:order-2' : i === 1 ? 'py-4 sm:order-1' : 'py-3 sm:order-3'}`}>
            <div className={`font-bold tabular-nums ${i === 0 ? 'text-3xl text-lime-300' : 'text-2xl text-gray-300'}`}>{i + 1}</div>
            <div className="text-gray-400 text-xs mt-1">{label}</div>
            {teams.map((x) => (
              <div key={x.id} className={`font-bold ${i === 0 ? 'text-2xl text-lime-400' : `text-lg ${color}`}`}>{x.name}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
