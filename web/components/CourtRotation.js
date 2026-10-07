'use client';
import { useMemo, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { levelTag } from '@/lib/levels';

// Games each player has played in this session (from the matches already recorded).
function gamesPlayed(matches) {
  const n = new Map();
  for (const m of matches || []) for (const p of m.match_players || []) if (p.event_participant_id) n.set(p.event_participant_id, (n.get(p.event_participant_id) || 0) + 1);
  return n;
}

// One round on the courts: who played least goes on first; players of a similar level
// share a court, paired strongest + weakest against the middle two.
function makeRound(players, matches, courts) {
  const played = gamesPlayed(matches);
  const lvl = (p) => (p.dupr_level == null ? 3 : Number(p.dupr_level));
  const order = [...players].sort((a, b) => (played.get(a.id) || 0) - (played.get(b.id) || 0) || Math.random() - 0.5);
  const n = Math.min(courts, Math.floor(order.length / 4));
  const on = order.slice(0, n * 4).sort((a, b) => lvl(b) - lvl(a));
  const rest = order.slice(n * 4);
  const round = Array.from({ length: n }, (_, i) => {
    const [a, b, c, d] = on.slice(i * 4, i * 4 + 4);
    return { court: i + 1, team1: [a, d], team2: [b, c], s1: '', s2: '', saved: false };
  });
  return { round, rest, played };
}

// Coordinator's court board: set up a round across the courts (balanced, fair turns),
// then type each court's score as it finishes — it is saved as a match of the session.
export default function CourtRotation({ players, matches, defaultCourts = 2, endpoint, sport, onSaved }) {
  const { t } = useI18n();
  const [courts, setCourts] = useState(Math.max(1, defaultCourts || 2));
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const played = useMemo(() => gamesPlayed(matches), [matches]);

  const deal = () => {
    setError('');
    setState(makeRound(players, matches, courts));
  };
  const setScore = (i, k, v) => setState((s) => ({ ...s, round: s.round.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));

  async function save(i) {
    const c = state.round[i];
    const s1 = Number(c.s1);
    const s2 = Number(c.s2);
    if (c.s1 === '' || c.s2 === '' || s1 === s2) return setError(t('courts.needScore'));
    setBusy(i);
    setError('');
    try {
      const players4 = [...c.team1.map((p) => ({ team: 1, event_participant_id: p.id })), ...c.team2.map((p) => ({ team: 2, event_participant_id: p.id }))];
      await api.post(endpoint, sport === 'badminton' ? { players: players4, games: [[s1, s2]] } : { players: players4, team1_score: s1, team2_score: s2 });
      setState((s) => ({ ...s, round: s.round.map((x, j) => (j === i ? { ...x, saved: true } : x)) }));
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const name = (p) => (
    <span className="block truncate">
      {p.full_name}
      {p.dupr_level != null && <span className="text-gray-500 text-[11px]"> · {levelTag(p.dupr_level, sport, t)}</span>}
    </span>
  );

  return (
    <div>
      <div className="card mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-gray-400">{t('courts.count')}</label>
          <input className="input !w-24" type="number" min="1" max="20" value={courts} onChange={(e) => setCourts(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <div className="text-sm text-gray-300 flex-1 min-w-[12rem]">
          {t('courts.here', { n: players.length })}
          <span className="block text-gray-500 text-xs">{t('courts.hint')}</span>
        </div>
        <button type="button" className="btn-primary" disabled={players.length < 4} onClick={deal}>
          🔀 {state ? t('courts.next') : t('courts.deal')}
        </button>
      </div>
      {players.length < 4 && <p className="text-gray-400 text-sm mb-3">{t('courts.needFour')}</p>}
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}

      {state && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {state.round.map((c, i) => (
              <div key={c.court} className={`rounded-2xl border p-4 ${c.saved ? 'border-lime-400/50 bg-lime-400/5' : 'border-navy-600 bg-navy-800'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-bold">🏟 {t('courts.court', { n: c.court })}</span>
                  {c.saved && <span className="text-lime-300 text-xs">✓ {t('courts.saved')}</span>}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-center text-sm">
                  <div className="rounded-lg bg-navy-900 px-3 py-2 text-gray-100">{c.team1.map((p) => <span key={p.id}>{name(p)}</span>)}</div>
                  <input className="input !w-16 text-center font-bold" type="number" min="0" inputMode="numeric" aria-label={`${t('courts.court', { n: c.court })} · 1`} disabled={c.saved} value={c.s1} onChange={(e) => setScore(i, 's1', e.target.value)} />
                  <div className="rounded-lg bg-navy-900 px-3 py-2 text-gray-100">{c.team2.map((p) => <span key={p.id}>{name(p)}</span>)}</div>
                  <input className="input !w-16 text-center font-bold" type="number" min="0" inputMode="numeric" aria-label={`${t('courts.court', { n: c.court })} · 2`} disabled={c.saved} value={c.s2} onChange={(e) => setScore(i, 's2', e.target.value)} />
                </div>
                {!c.saved && (
                  <button type="button" className="btn-secondary w-full mt-3 !py-1.5 text-sm" disabled={busy === i} onClick={() => save(i)}>{t('courts.saveScore')}</button>
                )}
              </div>
            ))}
          </div>
          {state.rest.length > 0 && (
            <div className="card mt-3">
              <div className="text-gray-400 text-xs mb-1">⏸ {t('courts.resting', { n: state.rest.length })}</div>
              <div className="flex flex-wrap gap-1.5">
                {state.rest.map((p) => (
                  <span key={p.id} className="rounded-full bg-navy-900 border border-navy-600 px-2.5 py-1 text-sm text-gray-200">
                    {p.full_name} <span className="text-gray-500 text-xs">· {t('courts.gamesN', { n: played.get(p.id) || 0 })}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
