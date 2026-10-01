'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import GamesInput, { gamesPayload, gamesText } from '@/components/GamesInput';

function playerName(mp) {
  return mp.club_members?.full_name || mp.event_participants?.full_name || '?';
}

function EditMatch({ match, basePath, onSaved, onCancel, badminton }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ team1_score: match.team1_score, team2_score: match.team2_score });
  const [games, setGames] = useState(() =>
    Array.isArray(match.games) && match.games.length ? match.games.map(([a, b]) => [String(a), String(b)]) : [['', ''], ['', '']]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.patch(
        `${basePath}/${match.id}`,
        badminton ? { games: gamesPayload(games) } : { team1_score: Number(form.team1_score || 0), team2_score: Number(form.team2_score || 0) }
      );
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {badminton ? <GamesInput value={games} onChange={setGames} /> : (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((team) => (
          <div key={team}>
            <label className="text-xs text-gray-400">{t(`matches.team${team}`)}</label>
            <input
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
export default function MatchList({ matches, onChanged, basePath = '/api/matches', allowDelete = true, sport: sportProp }) {
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

  if (!matches.length) return <p className="text-gray-400 text-sm">{t('matches.none')}</p>;

  return (
    <>
      <div className="flex flex-col gap-3">
        {matches.map((m) => {
          const winner = m.team1_score > m.team2_score ? 1 : m.team2_score > m.team1_score ? 2 : 0;
          const team = (n) => (m.match_players || []).filter((p) => p.team === n).map(playerName).join(' & ');
          return (
            <div key={m.id} className="card">
              <div className="flex items-center justify-between gap-2 text-xs text-gray-400 mb-2">
                <span>
                  {new Date(m.played_at).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  {' · '}
                  {t(`matches.${m.match_type}`)}
                </span>
                {winner === 0 && <span className="text-yellow-400">{t('matches.draw')}</span>}
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center">
                {[1, 2].map((n) => (
                  <div key={n} className="contents">
                    <span className={`truncate ${winner === n ? 'text-lime-400 font-semibold' : 'text-gray-200'}`}>
                      {winner === n && '🏆 '}
                      {team(n)}
                    </span>
                    <span className={`text-xl font-bold tabular-nums text-right ${winner === n ? 'text-lime-400' : 'text-gray-300'}`}>
                      {m[`team${n}_score`]}
                    </span>
                  </div>
                ))}
              </div>
              {gamesText(m.games) && <p className="text-gray-400 text-xs mt-1 tabular-nums">{gamesText(m.games)}</p>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm">
                <button className="text-gray-300" onClick={() => setEditing(m)}>{t('matches.edit')}</button>
                {allowDelete && (
                  <button className="text-red-400/80 ml-auto" onClick={() => remove(m)}>{t('common.delete')}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!editing} title={t('matches.edit')} onClose={() => setEditing(null)}>
        {editing && (
          <EditMatch
            match={editing}
            badminton={badminton || Array.isArray(editing.games)}
            basePath={basePath}
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
