'use client';
import { useI18n } from '@/context/I18nContext';

// Badminton score: games to 21 (best of 3). value: [[a, b], ...] as typed (strings).
export const blankGames = () => [['', ''], ['', '']];

// Filled games as numbers, e.g. [[21, 18], [19, 21], [21, 15]].
export function gamesPayload(rows) {
  return rows.filter(([a, b]) => a !== '' && b !== '').map(([a, b]) => [Number(a), Number(b)]);
}

// "21-18, 19-21, 21-15" for lists.
export function gamesText(games) {
  return Array.isArray(games) && games.length ? games.map(([a, b]) => `${a}-${b}`).join(', ') : '';
}

export default function GamesInput({ value, onChange, labels = null }) {
  const { t } = useI18n();
  const set = (i, side, v) => onChange(value.map((g, j) => (j === i ? (side === 0 ? [v, g[1]] : [g[0], v]) : g)));
  const num = (i, side) => (
    <input
      className="input text-center font-bold !px-1"
      type="number"
      inputMode="numeric"
      min="0"
      max="30"
      placeholder="0"
      aria-label={`${t('games.game', { n: i + 1 })} · ${labels ? labels[side] : side + 1}`}
      value={value[i][side]}
      onChange={(e) => set(i, side, e.target.value)}
    />
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[4.5rem_1fr_1fr] gap-2 items-center text-xs text-gray-400">
        <span>{t('games.label')}</span>
        <span className="text-center truncate">{labels ? labels[0] : t('matches.team1')}</span>
        <span className="text-center truncate">{labels ? labels[1] : t('matches.team2')}</span>
      </div>
      {value.map((_, i) => (
        <div key={i} className="grid grid-cols-[4.5rem_1fr_1fr] gap-2 items-center">
          <span className="text-gray-300 text-sm">{t('games.game', { n: i + 1 })}</span>
          {num(i, 0)}
          {num(i, 1)}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <p className="text-gray-500 text-xs">{t('games.hint')}</p>
        {value.length < 3 ? (
          <button type="button" className="text-lime-400 text-xs shrink-0" onClick={() => onChange([...value, ['', '']])}>{t('games.addGame')}</button>
        ) : (
          <button type="button" className="text-gray-400 text-xs shrink-0" onClick={() => onChange(value.slice(0, 2))}>{t('games.removeGame')}</button>
        )}
      </div>
    </div>
  );
}
