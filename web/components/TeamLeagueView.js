'use client';
import GamesInput, { gamesPayload } from '@/components/GamesInput';
import { levelText } from '@/lib/levels';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

const SIZE = { mens: 2, womens: 2, mixed: 2, doubles: 2, singles: 1 };
const GENDER = { mens: 'male', womens: 'female' };

// One sub-match: pick each side's line-up (from that team's roster, fitting the format) and the score.
function SubMatchForm({ tour, fixture, sub, onSaved, onClose }) {
  const { t, sport } = useI18n();
  const team = (id) => tour.teams.find((x) => x.id === id);
  const size = SIZE[sub.format];
  const [p1, setP1] = useState([sub.team1_p1 || '', sub.team1_p2 || ''].slice(0, size));
  const [p2, setP2] = useState([sub.team2_p1 || '', sub.team2_p2 || ''].slice(0, size));
  const [s1, setS1] = useState(sub.team1_score ?? '');
  const [s2, setS2] = useState(sub.team2_score ?? '');
  const badminton = sport === 'badminton'; // games to 21, best of 3
  const [games, setGames] = useState(() =>
    Array.isArray(sub.games) && sub.games.length ? sub.games.map(([a, b]) => [String(a), String(b)]) : [['', ''], ['', '']]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Mixed: slot 1 a man, slot 2 a woman. Men's/women's: that gender only.
  const eligible = (roster, slot) =>
    roster.filter((p) => {
      if (GENDER[sub.format]) return p.gender === GENDER[sub.format];
      if (sub.format === 'mixed') return p.gender === (slot === 0 ? 'male' : 'female');
      return true;
    });

  async function send(body) {
    setBusy(true);
    setError('');
    try {
      onSaved(await api.patch(`/api/tournaments/${tour.id}/sub-matches/${sub.id}`, body));
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    const score = badminton ? { games: gamesPayload(games) } : { team1_score: Number(s1), team2_score: Number(s2) };
    send({ ...score, team1_players: p1.filter(Boolean), team2_players: p2.filter(Boolean) });
  }

  const side = (tid, ids, setIds, score, setScore, i) => {
    const roster = team(tid)?.players || [];
    return (
      <div className="rounded-lg bg-navy-900 p-3">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex-1 text-white font-semibold truncate">{team(tid)?.name}</span>
          {!badminton && <input
            className="input !w-20 text-center text-lg font-bold"
            type="number"
            inputMode="numeric"
            min="0"
            max="99"
            required
            autoFocus={i === 0}
            aria-label={t('league.score')}
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />}
        </div>
        <div className={`grid gap-2 ${size === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {ids.map((id, k) => (
            <select key={k} className="input text-sm" value={id} onChange={(e) => setIds(ids.map((x, j) => (j === k ? e.target.value : x)))}>
              <option value="">{t('league.pickPlayer')}</option>
              {eligible(roster, k).map((p) => (
                <option key={p.id} value={p.id} disabled={ids.includes(p.id) && p.id !== id}>
                  {p.full_name} · {levelText(p.dupr_level, sport, t) ?? '—'}
                </option>
              ))}
            </select>
          ))}
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-lime-400 text-sm font-semibold">{t(`league.sub_${sub.format}`)}</p>
      {side(fixture.team1_id, p1, setP1, s1, setS1, 0)}
      {side(fixture.team2_id, p2, setP2, s2, setS2, 1)}
      {badminton && <GamesInput value={games} onChange={setGames} labels={[team(fixture.team1_id)?.name, team(fixture.team2_id)?.name]} />}
      <p className="text-gray-500 text-xs">{t('league.lineupHint')}</p>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-2">
        {sub.team1_score != null && (
          <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => send({ clear: true })}>{t('tournaments.clear')}</button>
        )}
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary flex-1" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  );
}

export default function TeamLeagueView({ tour, onChange }) {
  const { t, sport } = useI18n();
  const [editing, setEditing] = useState(null); // { fixture, sub }
  const [round, setRound] = useState(null);
  const teamName = (id) => tour.teams.find((x) => x.id === id)?.name || '?';
  const names = Object.fromEntries(tour.teams.flatMap((tm) => tm.players.map((p) => [p.id, p.full_name])));
  const rounds = Array.from({ length: tour.rounds }, (_, i) => i + 1);
  const firstOpen = rounds.find((rd) => tour.matches.some((f) => f.round === rd && !f.result.done)) || rounds[0];
  const shown = round || firstOpen;
  const signed = (n) => (n > 0 ? `+${n}` : n);

  return (
    <>
      <div className="card mb-4 !py-3 text-sm text-gray-300">
        <span className="text-gray-400">{t('league.subTitle')}:</span> {(tour.sub_formats || []).map((f) => t(`league.sub_${f}`)).join(' · ')}
        <span className="block sm:inline sm:ml-3">
          <span className="text-gray-400">{t('league.winRule')}:</span> {t(`league.rule_${tour.win_rule}`)}
        </span>
      </div>

      <div className="card mb-4">
        <h2 className="text-white font-semibold mb-2">{t('league.table')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm grid-table compact-cells">
            <thead>
              <tr className="text-gray-300 bg-navy-900">
                <th className="w-8 text-center">#</th>
                <th className="text-left">{t('tournaments.team')}</th>
                <th className="text-right">{t('tournaments.played')}</th>
                <th className="text-right">{t('tournaments.wins')}</th>
                <th className="text-right hidden sm:table-cell">{t('league.draws')}</th>
                <th className="text-right">{t('tournaments.losses')}</th>
                <th className="text-right" title={t('league.subDiffHint')}>{t('league.subDiff')}</th>
                <th className="text-right hidden sm:table-cell">{t('tournaments.diff')}</th>
                <th className="text-right">{t('league.pts')}</th>
              </tr>
            </thead>
            <tbody>
              {tour.standings.map((r) => (
                <tr key={r.team_id} className={r.position === 1 && r.played ? 'bg-lime-400/5' : ''}>
                  <td className={`text-center ${r.position === 1 && r.played ? 'text-lime-400 font-bold' : 'text-gray-400'}`}>{r.position}</td>
                  <td className="text-white w-full min-w-[7rem]">{teamName(r.team_id)}</td>
                  <td className="text-right tabular-nums text-gray-300">{r.played}</td>
                  <td className="text-right tabular-nums text-gray-300">{r.won}</td>
                  <td className="text-right tabular-nums text-gray-300 hidden sm:table-cell">{r.drawn}</td>
                  <td className="text-right tabular-nums text-gray-300">{r.lost}</td>
                  <td className="text-right tabular-nums text-gray-300">{signed(r.sub_diff)}</td>
                  <td className="text-right tabular-nums text-gray-300 hidden sm:table-cell">{signed(r.diff)}</td>
                  <td className="text-right tabular-nums text-lime-400 font-bold">{r.league_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-gray-500 text-xs mt-2">{t('league.tableHint')}</p>
      </div>

      <h2 className="text-white font-semibold mb-2">{t('league.fixtures')}</h2>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2 mb-2">
        {rounds.map((rd) => {
          const list = tour.matches.filter((f) => f.round === rd);
          const done = list.filter((f) => f.result.done).length;
          return (
            <button
              key={rd}
              type="button"
              onClick={() => setRound(rd)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${shown === rd ? 'border-lime-400 bg-lime-400/10 text-lime-300' : 'border-navy-600 text-gray-300'}`}
            >
              {t('tournaments.round', { n: rd })}
              <span className="ml-1.5 text-xs text-gray-500">{done}/{list.length}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        {tour.matches.filter((f) => f.round === shown).map((f) => {
          const r = f.result;
          const win = (side) => (r.done && r.winner === side ? 'text-lime-400' : 'text-white');
          return (
            <div key={f.id} className="card !p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className={`flex-1 truncate font-semibold ${win(1)}`}>{teamName(f.team1_id)}</span>
                <span className="tabular-nums text-lg font-bold text-white shrink-0">
                  {r.played ? `${r.sub_wins[0]} – ${r.sub_wins[1]}` : 'vs'}
                </span>
                <span className={`flex-1 truncate font-semibold text-right ${win(2)}`}>{teamName(f.team2_id)}</span>
              </div>
              {tour.win_rule === 'points' && r.played > 0 && (
                <p className="text-gray-400 text-xs text-center -mt-1 mb-2">{t('league.totalPoints', { a: r.points[0], b: r.points[1] })}</p>
              )}
              {r.done && r.winner === 0 && <p className="text-gray-400 text-xs text-center -mt-1 mb-2">{t('league.draw')}</p>}
              <div className="flex flex-col gap-1">
                {f.subs.map((s) => {
                  const played = s.team1_score != null;
                  const lineup = (a, b) => [a, b].filter(Boolean).map((id) => names[id] || '?').join(' & ');
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setEditing({ fixture: f, sub: s })}
                      className={`w-full text-left rounded-lg bg-navy-900 px-3 py-2 text-sm border ${played ? 'border-transparent' : 'border-lime-400/40 hover:border-lime-400'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-400 text-xs">{t(`league.sub_${s.format}`)}</span>
                        <span className="tabular-nums font-semibold text-white">{played ? `${s.team1_score} – ${s.team2_score}` : t('league.enter')}</span>
                      </div>
                      {(s.team1_p1 || s.team2_p1) && (
                        <div className="text-gray-300 text-xs mt-0.5 grid grid-cols-2 gap-2">
                          <span className={`truncate ${played && s.team1_score > s.team2_score ? 'text-lime-300' : ''}`}>{lineup(s.team1_p1, s.team1_p2) || '—'}</span>
                          <span className={`truncate text-right ${played && s.team2_score > s.team1_score ? 'text-lime-300' : ''}`}>{lineup(s.team2_p1, s.team2_p2) || '—'}</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="text-white font-semibold mb-2">{t('league.rosters')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {tour.teams.map((tm) => (
          <div key={tm.id} className="card !p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-white font-semibold truncate">{tm.name}</span>
              <span className="text-lime-400 text-xs shrink-0">Σ {t('level.sumLabel')} {Math.round(tm.players.reduce((s, p) => s + Number(p.dupr_level ?? 3), 0) * 100) / 100}</span>
            </div>
            <ul className="text-sm text-gray-300">
              {tm.players.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate">{p.full_name} {p.gender === 'male' ? '♂' : p.gender === 'female' ? '♀' : ''}</span>
                  <span className="text-gray-500 tabular-nums">{levelText(p.dupr_level, sport, t) ?? '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Modal open={!!editing} title={editing ? `${teamName(editing.fixture.team1_id)} vs ${teamName(editing.fixture.team2_id)}` : ''} onClose={() => setEditing(null)}>
        {editing && <SubMatchForm tour={tour} fixture={editing.fixture} sub={editing.sub} onSaved={onChange} onClose={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
