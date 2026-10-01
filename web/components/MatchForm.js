'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import GamesInput, { blankGames, gamesPayload } from '@/components/GamesInput';

const TEAM_SIZE = { singles: 1, doubles: 2, mixed: 2 };

function nowLocalInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// players: [{ id, name, gender }]; idField: 'club_member_id' | 'event_participant_id';
// parent: { club_id } or { event_id }. `endpoint` lets staff post to their own API.
export default function MatchForm({ players, idField, parent, onSaved, onCancel, endpoint = '/api/matches', sport: sportProp }) {
  const { t, sport: clubSport } = useI18n();
  const badminton = (sportProp || clubSport) === 'badminton'; // badminton: games to 21, best of 3
  const [games, setGames] = useState(blankGames);
  const [type, setType] = useState('doubles');
  const [slots, setSlots] = useState({ 1: ['', ''], 2: ['', ''] });
  const [score, setScore] = useState({ 1: '', 2: '' });
  const [playedAt, setPlayedAt] = useState(nowLocalInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const size = TEAM_SIZE[type];
  const chosen = [...slots[1].slice(0, size), ...slots[2].slice(0, size)].filter(Boolean);

  function setSlot(team, i, id) {
    setSlots((s) => ({ ...s, [team]: s[team].map((v, j) => (j === i ? id : v)) }));
  }

  async function submit(e) {
    e.preventDefault();
    if (chosen.length !== size * 2) return setError(t('matches.needPlayers'));
    setBusy(true);
    setError('');
    try {
      const saved = await api.post(endpoint, {
        ...parent,
        match_type: type,
        ...(badminton ? { games: gamesPayload(games) } : { team1_score: Number(score[1] || 0), team2_score: Number(score[2] || 0) }),
        played_at: new Date(playedAt).toISOString(),
        players: [1, 2].flatMap((team) => slots[team].slice(0, size).map((id) => ({ team, [idField]: id }))),
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
      <div className="grid grid-cols-3 bg-navy-950 rounded-lg p-1 text-sm">
        {Object.keys(TEAM_SIZE).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setType(k)}
            className={`rounded-md py-1.5 ${type === k ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400'}`}
          >
            {t(`matches.${k}`)}
          </button>
        ))}
      </div>
      {type === 'mixed' && <p className="text-gray-500 text-xs -mt-2">{t('matches.mixedHint')}</p>}

      {[1, 2].map((team) => (
        <div key={team} className="bg-navy-900 rounded-lg p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-white font-semibold text-sm whitespace-nowrap">{t(`matches.team${team}`)}</span>
            {!badminton && <div className="w-20 shrink-0">
            <input
              className="input text-center text-lg font-bold"
              type="number"
              inputMode="numeric"
              min="0"
              max="99"
              required
              aria-label={`${t(`matches.team${team}`)} ${t('matches.score')}`}
              placeholder="0"
              value={score[team]}
              onChange={(e) => setScore({ ...score, [team]: e.target.value })}
            />
            </div>}
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: size }, (_, i) => (
              <select key={i} className="input" value={slots[team][i]} onChange={(e) => setSlot(team, i, e.target.value)}>
                <option value="">{t('matches.pickPlayer')}</option>
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

      {badminton && (
        <div className="bg-navy-900 rounded-lg p-3">
          <GamesInput value={games} onChange={setGames} />
        </div>
      )}

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
