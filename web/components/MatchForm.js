'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import GamesInput, { blankGames, defaultFormat, gamesPayload } from '@/components/GamesInput';
import Hint from '@/components/ui/Hint';
import { timesTogether } from '@/lib/eventStandings';

function nowLocalInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// players: [{ id, name, gender }]; idField: 'club_member_id' | 'event_participant_id';
// parent: { club_id } or { event_id }. `endpoint` lets staff post to their own API.
// `pastMatches`: this kèo's matches so far — two players already paired get a warning.
// `initialSlots` / `extra`: a match set up for the Host (e.g. a challenge) and fields sent with it.
export default function MatchForm({ players, idField, parent, onSaved, onCancel, endpoint = '/api/matches', sport: sportProp, pastMatches = [], initialSlots = null, extra = {} }) {
  const { t, sport: clubSport } = useI18n();
  const badminton = (sportProp || clubSport) === 'badminton'; // badminton: games to 21, best of 3
  const [games, setGames] = useState(blankGames);
  const [format, setFormat] = useState(() => defaultFormat('badminton'));
  const [slots, setSlots] = useState(() => initialSlots || { 1: ['', ''], 2: ['', ''] });
  const [kept, setKept] = useState({}); // pairs the Host chose to keep together anyway
  const [score, setScore] = useState({ 1: '', 2: '' });
  const [playedAt, setPlayedAt] = useState(nowLocalInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // One player per team = singles, two = doubles: no need to pick the type.
  const picked = { 1: slots[1].filter(Boolean), 2: slots[2].filter(Boolean) };
  const chosen = [...picked[1], ...picked[2]];
  const size = picked[1].length === picked[2].length && picked[1].length > 0 ? picked[1].length : 0;
  const kind = size === 1 ? 'singles' : size === 2 ? 'doubles' : null;

  // Partners who already played together in this kèo, and the Host has not said "keep".
  const pairKey = (team) => [...slots[team]].sort().join('|');
  const repeats = [1, 2]
    .map((team) => ({ team, n: slots[team][0] && slots[team][1] ? timesTogether(pastMatches, slots[team][0], slots[team][1]) : 0 }))
    .filter((x) => x.n > 0 && !kept[pairKey(x.team)]);
  const nameOf = (id) => players.find((p) => p.id === id)?.name || '?';

  function setSlot(team, i, id) {
    setSlots((s) => ({ ...s, [team]: s[team].map((v, j) => (j === i ? id : v)) }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!kind) return setError(t('matches.needPlayers'));
    if (repeats.length) return setError(t('matches.pairDecide'));
    // The score can wait: leave it empty to set the match up now and score it later.
    const filled = badminton ? gamesPayload(games) : null;
    const hasScore = badminton ? filled.length > 0 : score[1] !== '' || score[2] !== '';
    setBusy(true);
    setError('');
    try {
      const saved = await api.post(endpoint, {
        ...parent,
        ...extra,
        ...(hasScore ? (badminton ? { games: filled, format } : { team1_score: Number(score[1] || 0), team2_score: Number(score[2] || 0) }) : {}),
        played_at: new Date(playedAt).toISOString(),
        players: [1, 2].flatMap((team) => picked[team].map((id) => ({ team, [idField]: id }))),
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!players.length) return <p className="text-gray-400 text-sm">{t('matches.noPlayers')}</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-gray-400 text-xs -mb-1">
        {t('matches.autoTypeHint')}
        {kind && <span className="ml-1 text-lime-300 font-semibold">→ {t(`matches.${kind}`)}</span>}
      </p>

      {[1, 2].map((team) => (
        <div key={team} className="bg-navy-900 rounded-lg p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-white font-semibold text-sm whitespace-nowrap">{t(`matches.team${team}`)}</span>
            {!badminton && (
              <div className="w-20 shrink-0">
                <input
                  className="input text-center text-lg font-bold"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="99"
                  aria-label={`${t(`matches.team${team}`)} ${t('matches.score')}`}
                  placeholder="–"
                  value={score[team]}
                  onChange={(e) => setScore({ ...score, [team]: e.target.value })}
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <select key={i} className="input" value={slots[team][i]} onChange={(e) => setSlot(team, i, e.target.value)}>
                <option value="">{i === 0 ? t('matches.pickPlayer') : t('matches.pickSecond')}</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id} disabled={chosen.includes(p.id) && slots[team][i] !== p.id}>
                    {p.name}
                    {p.gender ? ` (${t(`members.${p.gender}`)})` : ''}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>
      ))}

      {repeats.map((x) => (
        <div key={x.team} className="rounded-xl border-2 border-amber-400 bg-amber-400/10 p-3 text-sm" role="alert">
          <p className="text-amber-100 font-semibold">⚠️ {t('matches.pairAgain', { a: nameOf(slots[x.team][0]), b: nameOf(slots[x.team][1]), n: x.n })}</p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button type="button" className="btn-secondary text-sm justify-center" onClick={() => setSlot(x.team, 1, '')}>🔄 {t('matches.pairRepick')}</button>
            <button type="button" className="btn-primary text-sm justify-center" onClick={() => setKept({ ...kept, [pairKey(x.team)]: true })}>✓ {t('matches.pairKeep')}</button>
          </div>
        </div>
      ))}

      {badminton && (
        <div className="bg-navy-900 rounded-lg p-3">
          <GamesInput value={games} onChange={setGames} format={format} onFormatChange={setFormat} />
        </div>
      )}
      <Hint text={t('matches.scoreLaterHint')} className="-mt-2" />

      <div>
        <label className="text-xs text-gray-400">{t('matches.playedAt')}</label>
        <input className="input" type="datetime-local" required value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn-primary flex-1" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  );
}
