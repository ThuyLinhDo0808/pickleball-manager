'use client';
import { useEffect, useState } from 'react';
import GamesInput, { FormatPicker, gamesPayload, inferFormat } from '@/components/GamesInput';
import Segmented from '@/components/ui/Segmented';
import { useI18n } from '@/context/I18nContext';

// Entering a result after the match. Badminton: games under the chosen format.
// Pickleball: one game (the two scores) or several games (best of 3 / 5) under the chosen
// format. Optional match time in minutes. Calls onChange(body) with what the API expects:
// { format, games } or { format, team1_score, team2_score }, plus duration_min.
export default function ScoreEntry({ sport, labels, initial = {}, onChange, withDuration = true }) {
  const { t } = useI18n();
  const badminton = sport === 'badminton';
  const hasGames = Array.isArray(initial.games) && initial.games.length > 0;
  const [mode, setMode] = useState(badminton || hasGames || (initial.score_format?.best_of || 1) > 1 ? 'games' : 'single');
  const [format, setFormat] = useState(() => inferFormat(initial.games, sport, initial.score_format));
  const [games, setGames] = useState(() => (hasGames ? initial.games.map(([a, b]) => [String(a), String(b)]) : [['', ''], ['', '']]));
  const [s1, setS1] = useState(initial.team1_score != null && !hasGames ? String(initial.team1_score) : '');
  const [s2, setS2] = useState(initial.team2_score != null && !hasGames ? String(initial.team2_score) : '');
  const [minutes, setMinutes] = useState(initial.duration_sec ? String(Math.round(initial.duration_sec / 60)) : '');

  useEffect(() => {
    const fmt = { points: format.points, win_by: format.win_by };
    const duration = withDuration && minutes !== '' ? { duration_min: Number(minutes) } : {};
    if (mode === 'games') onChange({ format: fmt, games: gamesPayload(games), ...duration });
    else onChange({ format: fmt, team1_score: s1 === '' ? null : Number(s1), team2_score: s2 === '' ? null : Number(s2), ...duration });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, format, games, s1, s2, minutes]);

  return (
    <div className="flex flex-col gap-3">
      {!badminton && (
        <Segmented full items={['single', 'games']} value={mode} onChange={setMode} label={(k) => t(`scoreEntry.mode_${k}`)} />
      )}
      {mode === 'games' ? (
        <GamesInput value={games} onChange={setGames} labels={labels} sport={sport} format={format} onFormatChange={setFormat} />
      ) : (
        <>
          <FormatPicker sport={sport} value={format} onChange={setFormat} />
          {[
            [labels?.[0], s1, setS1],
            [labels?.[1], s2, setS2],
          ].map(([name, v, set], i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="flex-1 text-white truncate">{name || t(i === 0 ? 'matches.team1' : 'matches.team2')}</span>
              <div className="w-20 shrink-0">
                <input
                  className="input text-center text-lg font-bold"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="99"
                  required
                  aria-label={name}
                  value={v}
                  onChange={(e) => set(e.target.value)}
                />
              </div>
            </div>
          ))}
        </>
      )}
      {withDuration && (
        <div className="flex items-center gap-3">
          <label htmlFor="score-minutes" className="flex-1 text-sm text-gray-300">
            ⏱ {t('scoreEntry.duration')}
            <span className="block text-gray-500 text-xs">{t('scoreEntry.durationHint')}</span>
          </label>
          <div className="w-24 shrink-0 relative">
            <input id="score-minutes" className="input text-center !pr-9" type="number" inputMode="numeric" min="0" max="600" placeholder="—" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">{t('scoreEntry.min')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
