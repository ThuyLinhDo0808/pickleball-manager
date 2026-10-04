'use client';
import Segmented from '@/components/ui/Segmented';
import { useI18n } from '@/context/I18nContext';

// Score by games: value [[a, b], ...] as typed (strings). Optional game format
// ({ points, win_by }): badminton 21 (max 30) / 15 (max 21) / 11 (max 15), pickleball
// 11 / 15 / 21; "win by 2" or "first to the points". The server checks the games
// against the format sent with them.
export const blankGames = () => [['', ''], ['', '']];

export const FORMAT_POINTS = { badminton: [21, 15, 11], pickleball: [11, 15, 21] };
const BADMINTON_CAP = { 21: 30, 15: 21, 11: 15 };

export const defaultFormat = (sport) => ({ points: FORMAT_POINTS[sport === 'badminton' ? 'badminton' : 'pickleball'][0], win_by: 2 });

// The format of games already played (stored with the result, else guessed from the scores).
export function inferFormat(games, sport, stored) {
  if (stored?.points) return { points: stored.points, win_by: stored.win_by || 2, ...(stored.best_of ? { best_of: stored.best_of } : {}) };
  const list = FORMAT_POINTS[sport === 'badminton' ? 'badminton' : 'pickleball'];
  if (!Array.isArray(games) || !games.length) return defaultFormat(sport);
  const tops = games.map(([a, b]) => Math.max(Number(a), Number(b)));
  const low = Math.min(...tops);
  // The smallest format every game reaches.
  const points = [...list].sort((x, y) => y - x).find((p) => low >= p) || list[0];
  const winBy = games.some(([a, b]) => Math.max(a, b) === points && Math.abs(a - b) === 1) ? 1 : 2;
  return { points, win_by: winBy };
}

export function capOf(format, sport) {
  if (format.win_by === 1) return format.points;
  return sport === 'badminton' ? BADMINTON_CAP[format.points] : 99;
}

// Filled games as numbers, e.g. [[21, 18], [19, 21], [21, 15]].
export function gamesPayload(rows) {
  return rows.filter(([a, b]) => a !== '' && b !== '').map(([a, b]) => [Number(a), Number(b)]);
}

// "21-18, 19-21, 21-15" for lists.
export function gamesText(games) {
  return Array.isArray(games) && games.length ? games.map(([a, b]) => `${a}-${b}`).join(', ') : '';
}

// The format picker on its own (points + how a game is won).
export function FormatPicker({ sport, value, onChange }) {
  const { t } = useI18n();
  const list = FORMAT_POINTS[sport === 'badminton' ? 'badminton' : 'pickleball'];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div>
        <span className="text-xs text-gray-400">{t('live.points')}</span>
        <Segmented full items={list} value={value.points} onChange={(points) => onChange({ ...value, points })} label={(n) => t('live.pointsN', { n })} />
      </div>
      <div>
        <span className="text-xs text-gray-400">{t('live.winBy')}</span>
        <Segmented full items={[2, 1]} value={value.win_by} onChange={(win_by) => onChange({ ...value, win_by })} label={(n) => t(`live.winBy_${n}`)} />
      </div>
    </div>
  );
}

export default function GamesInput({ value, onChange, labels = null, sport = 'badminton', format = null, onFormatChange = null, maxGames = 5 }) {
  const { t } = useI18n();
  const fmt = format || defaultFormat(sport);
  const top = capOf(fmt, sport);
  const set = (i, side, v) => onChange(value.map((g, j) => (j === i ? (side === 0 ? [v, g[1]] : [g[0], v]) : g)));
  const num = (i, side) => (
    <input
      className="input text-center font-bold !px-1"
      type="number"
      inputMode="numeric"
      min="0"
      max={top}
      placeholder="0"
      aria-label={`${t('games.game', { n: i + 1 })} · ${labels ? labels[side] : side + 1}`}
      value={value[i][side]}
      onChange={(e) => set(i, side, e.target.value)}
    />
  );
  const hint =
    fmt.win_by === 1
      ? t('games.hintFirstTo', { n: fmt.points })
      : sport === 'badminton'
        ? t('games.hintFmt', { n: fmt.points, cap: top })
        : t('games.hintFmtNoCap', { n: fmt.points });
  return (
    <div className="flex flex-col gap-2">
      {onFormatChange && <FormatPicker sport={sport} value={fmt} onChange={onFormatChange} />}
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
        <p className="text-gray-500 text-xs">{hint}</p>
        <span className="flex gap-3 shrink-0">
          {value.length > 1 && (
            <button type="button" className="text-gray-400 text-xs" onClick={() => onChange(value.slice(0, -1))}>{t('games.removeGame')}</button>
          )}
          {value.length < maxGames && (
            <button type="button" className="text-lime-400 text-xs" onClick={() => onChange([...value, ['', '']])}>{t('games.addGame')}</button>
          )}
        </span>
      </div>
    </div>
  );
}
