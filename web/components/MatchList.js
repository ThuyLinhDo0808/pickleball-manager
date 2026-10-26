'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import GamesInput, { gamesPayload, gamesText, inferFormat } from '@/components/GamesInput';
import { localDate } from '@/lib/dates';
import UiIcon from '@/components/ui/UiIcon';

function playerName(mp) {
  return mp.club_members?.full_name || mp.event_participants?.full_name || '?';
}

const teamNames = (m, n) => (m.match_players || []).filter((p) => p.team === n).map(playerName).join(' & ');
export const isScored = (m) => m.team1_score != null && m.team2_score != null;

// players / idField: who can be picked (the kèo's or the club's players). Without them only
// the score is edited.
function EditMatch({ match, basePath, onSaved, onCancel, badminton, players = null, idField = null }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ team1_score: match.team1_score ?? '', team2_score: match.team2_score ?? '' });
  const canPick = !!(players && idField);
  const idOf = (mp) => mp[idField] || mp.event_participant_id || mp.club_member_id;
  const startSlots = () => {
    const per = Math.max(1, ...[1, 2].map((n) => (match.match_players || []).filter((p) => p.team === n).length));
    return Object.fromEntries([1, 2].map((n) => {
      const ids = (match.match_players || []).filter((p) => p.team === n).map(idOf);
      return [n, [...ids, ...Array(per).fill('')].slice(0, per)];
    }));
  };
  const [slots, setSlots] = useState(startSlots);
  // Everyone who can be picked: the list given, plus players already in this match who are
  // no longer in it (e.g. moved out of the main list) so their names still show.
  const options = (() => {
    const list = [...(players || [])];
    for (const mp of match.match_players || []) {
      const id = idOf(mp);
      if (id && !list.some((p) => p.id === id)) list.push({ id, name: playerName(mp) });
    }
    return list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
  })();
  const nameOfId = (id) => options.find((p) => p.id === id)?.name || '';
  const changed = canPick && JSON.stringify(slots) !== JSON.stringify(startSlots());
  const names = canPick
    ? [1, 2].map((n) => slots[n].filter(Boolean).map(nameOfId).join(' & ') || t(`matches.team${n}`))
    : [teamNames(match, 1) || t('matches.team1'), teamNames(match, 2) || t('matches.team2')];
  const [format, setFormat] = useState(() => inferFormat(match.games, 'badminton'));
  const [games, setGames] = useState(() =>
    Array.isArray(match.games) && match.games.length ? match.games.map(([a, b]) => [String(a), String(b)]) : [['', ''], ['', '']]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const chosen = canPick ? [...slots[1], ...slots[2]] : [];
    if (canPick && chosen.some((id) => !id)) return setError(t('matches.editNeedAll'));
    if (canPick && new Set(chosen).size !== chosen.length) return setError(t('matches.editTwice'));
    setBusy(true);
    setError('');
    try {
      const score = badminton ? { games: gamesPayload(games), format } : { team1_score: Number(form.team1_score || 0), team2_score: Number(form.team2_score || 0) };
      // Changing only the players of a match not scored yet: no score is sent.
      const hasScore = !canPick || (badminton ? score.games.length > 0 : form.team1_score !== '' || form.team2_score !== '');
      const who = changed ? { players: [1, 2].flatMap((n) => slots[n].map((id) => ({ team: n, [idField]: id }))) } : {};
      await api.patch(`${basePath}/${match.id}`, { ...who, ...(isScored(match) || hasScore ? score : {}) });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {canPick && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-semibold text-white mb-1">{t('matches.editPlayers')}</legend>
          {[1, 2].map((n) => (
            <div key={n} className="grid gap-2 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
              <span className="text-xs text-gray-400 sm:w-14">{t(`matches.team${n}`)}</span>
              {slots[n].map((id, i) => (
                <select
                  key={i}
                  className="input"
                  aria-label={`${t(`matches.team${n}`)} ${i + 1}`}
                  value={id}
                  onChange={(e) => setSlots((s) => ({ ...s, [n]: s[n].map((v, j) => (j === i ? e.target.value : v)) }))}
                >
                  <option value="">—</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.id !== id && [...slots[1], ...slots[2]].includes(p.id)}>{p.name}</option>
                  ))}
                </select>
              ))}
            </div>
          ))}
        </fieldset>
      )}
      {canPick && <p className="text-sm font-semibold text-white -mb-1">{t('matches.editScore')}</p>}
      {badminton ? <GamesInput value={games} onChange={setGames} labels={names} format={format} onFormatChange={setFormat} /> : (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((team) => (
          // Names on top, the boxes always on one line even when one name takes two lines.
          <div key={team} className="min-w-0 flex flex-col justify-end gap-1">
            <label htmlFor={`edit-score-${team}`} className="text-sm text-gray-300 block break-words leading-snug" title={names[team - 1]}>
              {names[team - 1]}
            </label>
            <input
              id={`edit-score-${team}`}
              required={!canPick || isScored(match)}
              className="input text-center text-lg font-bold"
              type="number"
              inputMode="numeric"
              min="0"
              max="99"
              value={form[`team${team}_score`]}
              onChange={(e) => setForm({ ...form, [`team${team}_score`]: e.target.value })}
            />
          </div>
        ))}
      </div>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn-primary flex-1" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  );
}

// basePath: where edits go ('/api/matches' for hosts, the staff API for referees).
// players / idField: who can be picked when editing (then "Sửa trận" also changes the players).
export default function MatchList({ matches, onChanged, basePath = '/api/matches', allowDelete = true, sport: sportProp, emptyText = '', players = null, idField = null }) {
  const { t, lang, sport: clubSport } = useI18n();
  const badminton = (sportProp || clubSport) === 'badminton';
  const [editing, setEditing] = useState(null);

  async function remove(m) {
    if (!window.confirm(t('matches.deleteConfirm'))) return;
    try {
      await api.del(`${basePath}/${m.id}`);
      onChanged();
    } catch (err) {
      window.alert(err.message);
    }
  }

  if (!matches.length) return <p className="text-gray-400 text-sm">{emptyText || t('matches.none')}</p>;

  return (
    <>
      <div className="flex flex-col gap-3">
        {matches.map((m) => {
          const scored = isScored(m);
          const winner = !scored ? -1 : m.team1_score > m.team2_score ? 1 : m.team2_score > m.team1_score ? 2 : 0;
          const team = (n) => teamNames(m, n);
          return (
            <div key={m.id} className="card">
              <div className="flex items-center justify-between gap-2 text-xs text-gray-400 mb-2">
                <span>
                  {localDate(new Date(m.played_at), lang === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }, true)}
                  {' · '}
                  {t(`matches.${m.match_type}`)}
                </span>
                {winner === 0 && <span className="text-yellow-400">{t('matches.draw')}</span>}
                {m.is_challenge && <span className="rounded border border-navy-600 text-gray-200 px-1.5">{t('matches.challenge')}{m.challenge_reward ? ` · ${m.challenge_reward}` : ''}</span>}
                {!scored && <span className="rounded border border-amber-400/60 text-amber-300 px-1.5">{t('matches.notScored')}</span>}
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
                {[1, 2].map((n) => (
                  <div key={n} className="contents">
                    <span className={`break-words ${winner === n ? 'text-lime-400 font-semibold' : 'text-gray-200'}`}>
                      {winner === n && <UiIcon name="trophy" className="inline-block w-4 h-4 mr-1 -mt-0.5 text-lime-300" />}
                      {team(n)}
                    </span>
                    <span className={`text-xl font-bold tabular-nums text-right ${winner === n ? 'text-lime-400' : 'text-gray-300'}`}>
                      {scored ? m[`team${n}_score`] : '–'}
                    </span>
                  </div>
                ))}
              </div>
              {gamesText(m.games) && <p className="text-gray-400 text-xs mt-1 tabular-nums">{gamesText(m.games)}</p>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm">
                <button className={scored ? 'text-gray-300' : 'text-lime-400 font-semibold'} onClick={() => setEditing(m)}>
                  {players && idField ? t('matches.editMatch') : scored ? t('matches.edit') : t('matches.enterScore')}
                </button>
                {allowDelete && (
                  <button className="text-red-400/80 ml-auto" onClick={() => remove(m)}>{t('common.delete')}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!editing} title={players && idField ? t('matches.editMatch') : t('matches.edit')} onClose={() => setEditing(null)}>
        {editing && (
          <EditMatch
            match={editing}
            badminton={badminton || Array.isArray(editing.games)}
            basePath={basePath}
            players={players}
            idField={idField}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              onChanged();
            }}
          />
        )}
      </Modal>
    </>
  );
}
