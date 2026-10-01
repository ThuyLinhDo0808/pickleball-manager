'use client';
import Podium from '@/components/Podium';
import GamesInput, { gamesPayload, gamesText } from '@/components/GamesInput';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import TeamLeagueView from '@/components/TeamLeagueView';
import TournamentFees from '@/components/TournamentFees';
import { formatDay, hhmm } from '@/lib/dates';
import { formatVnd } from '@/lib/format';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// Badminton events by format/division (Đơn nam, Đôi nữ, Đôi nam nữ...).
const BADMINTON_CAT = { 'singles/men': 'ms', 'singles/women': 'ws', 'doubles/men': 'md', 'doubles/women': 'wd', 'mixed/open': 'xd' };

function roundLabel(round, rounds, t) {
  const left = rounds - round;
  if (left === 0) return t('tournaments.final');
  if (left === 1) return t('tournaments.semi');
  if (left === 2) return t('tournaments.quarter');
  return t('tournaments.roundOf', { n: 2 ** (left + 1) });
}

function ScoreForm({ match, teamName, onSave, onClear, onCancel }) {
  const { t, sport } = useI18n();
  const badminton = sport === 'badminton'; // games to 21, best of 3
  const [s1, setS1] = useState(match.team1_score ?? '');
  const [s2, setS2] = useState(match.team2_score ?? '');
  const [games, setGames] = useState(() =>
    Array.isArray(match.games) && match.games.length ? match.games.map(([a, b]) => [String(a), String(b)]) : [['', ''], ['', '']]
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(badminton ? { games: gamesPayload(games) } : { team1_score: Number(s1), team2_score: Number(s2) });
      }}
      className="flex flex-col gap-3"
    >
      {badminton && <GamesInput value={games} onChange={setGames} labels={[teamName(match.team1_id), teamName(match.team2_id)]} />}
      {!badminton && [
        [match.team1_id, s1, setS1],
        [match.team2_id, s2, setS2],
      ].map(([id, v, set], i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="flex-1 text-white truncate">{teamName(id)}</span>
          <div className="w-20 shrink-0">
            <input className="input text-center text-lg font-bold" type="number" inputMode="numeric" min="0" max="99" required autoFocus={i === 0} value={v} onChange={(e) => set(e.target.value)} />
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        {match.winner_id && (
          <button type="button" className="btn-secondary text-sm" onClick={onClear}>{t('tournaments.clear')}</button>
        )}
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>{t('common.cancel')}</button>
        <button className="btn-primary flex-1">{t('common.save')}</button>
      </div>
    </form>
  );
}

function MatchRow({ m, teamName, onOpen }) {
  const { t } = useI18n();
  const played = m.winner_id && !m.is_bye;
  const side = (id, score) => (
    <div className={`flex items-center justify-between gap-2 ${m.winner_id && m.winner_id === id ? 'text-lime-400 font-semibold' : 'text-gray-200'}`}>
      <span className="truncate">{id ? teamName(id) : <span className="text-gray-500 italic">{m.is_bye ? t('tournaments.bye') : t('tournaments.tbd')}</span>}</span>
      <span className="tabular-nums shrink-0">{played ? score : ''}</span>
    </div>
  );
  const canScore = m.team1_id && m.team2_id && !m.is_bye;
  return (
    <button type="button" disabled={!canScore} onClick={() => onOpen(m)} className={`w-full text-left bg-navy-900 rounded-lg px-3 py-2 text-sm flex flex-col gap-1 border ${canScore && !played ? 'border-lime-400/40 hover:border-lime-400' : 'border-transparent'}`}>
      {side(m.team1_id, m.team1_score)}
      {side(m.team2_id, m.team2_score)}
      {played && gamesText(m.games) && <span className="text-gray-500 text-[11px] tabular-nums">{gamesText(m.games)}</span>}
    </button>
  );
}

export default function TournamentPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t, lang, sport } = useI18n();
  const { data: tour, loading, setData } = useLoad(() => api.get(`/api/tournaments/${id}`), [id]);
  const [tab, setTab] = useState(null);
  const [scoring, setScoring] = useState(null);
  const [error, setError] = useState('');
  // Knockout: bracket (swipe sideways) or one round at a time as a list — the default on phones.
  const [koView, setKoView] = useState('bracket');
  const [koRound, setKoRound] = useState(null);
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setKoView('list');
  }, []);

  if (loading && !tour) return <AppShell><p className="text-gray-400">{t('common.loading')}</p></AppShell>;
  if (!tour) return <AppShell><p className="text-gray-400">{t('tournaments.none')}</p></AppShell>;

  const teamName = (tid) => tour.teams.find((x) => x.id === tid)?.name || '?';
  const current = tab || (tour.status === 'groups' ? 'groups' : 'ko');
  const ko = tour.matches.filter((m) => m.stage === 'knockout');

  async function run(fn) {
    setError('');
    try {
      setData(await fn());
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveScore(body) {
    const m = scoring;
    setScoring(null);
    await run(() => api.patch(`/api/tournaments/${id}/matches/${m.id}`, body));
  }

  async function clearScore() {
    const m = scoring;
    setScoring(null);
    await run(() => api.patch(`/api/tournaments/${id}/matches/${m.id}`, { clear: true }));
  }

  // Edit = rebuild with the same settings pre-filled (players, pairs, groups…).
  function edit() {
    const played = tour.matches.some((m) => m.winner_id && !m.is_bye) || (tour.matches.some((m) => (m.subs || []).some((x) => x.team1_score != null)));
    if (played && !window.confirm(t('tournaments.editLosesResults'))) return;
    router.push(`/club/tournaments/new?from=${tour.id}`);
  }

  async function remove() {
    if (!window.confirm(t('tournaments.deleteConfirm', { name: tour.name }))) return;
    await api.del(`/api/tournaments/${id}`);
    router.push('/club/tournaments');
  }

  return (
    <AppShell>
      <Link href="/club/tournaments" className="text-gray-400 text-sm hover:text-white inline-block mb-2">← {t('tournaments.allList')}</Link>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h1 className="text-white text-2xl font-bold">🏆 {tour.name}</h1>
          <p className="text-gray-400 text-sm">
            {tour.kind === 'team'
              ? t('tournaments.kind_team')
              : BADMINTON_CAT[`${tour.format}/${tour.division || 'open'}`] && sport === 'badminton'
                ? t(`tournaments.cat_${BADMINTON_CAT[`${tour.format}/${tour.division || 'open'}`]}`)
              : tour.format === 'doubles' && (!tour.division || tour.division === 'open')
                ? t('tournaments.kind_pairs')
                : `${t(`matches.${tour.format}`)}${tour.division && tour.division !== 'open' && tour.format !== 'mixed' ? ` · ${t(`tournaments.div_${tour.division}${tour.format === 'singles' ? 'S' : ''}`)}` : ''}`}
            {' · '}{t('tournaments.teamsN', { n: tour.teams.length })} · {tour.kind === 'team' && tour.status !== 'completed' ? t('league.inProgress') : t(`tournaments.status_${tour.status}`)}
          </p>
          {tour.event_date && (
            <p className="text-lime-400 text-sm capitalize">
              {formatDay(tour.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              {tour.start_time && ` · ${hhmm(tour.start_time)}${tour.end_time ? `–${hhmm(tour.end_time)}` : ''}`}
              {tour.location && <span className="text-gray-300 normal-case"> · 📍 {tour.location}</span>}
            </p>
          )}
          {Number(tour.entry_fee) > 0 && <p className="text-gray-300 text-sm">{t('tournaments.entryFeeShow', { fee: formatVnd(tour.entry_fee) })}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button className="btn-secondary !py-1.5 text-sm" onClick={edit}>✏️ {t('tournaments.edit')}</button>
          <button className="text-red-400 text-sm" onClick={remove}>{t('common.delete')}</button>
        </div>
      </div>

      {tour.champion_id &&
        (tour.podium ? (
          <Podium podium={tour.podium} />
        ) : (
          <div className="card mb-4 border-lime-400 text-center py-5">
            <div className="text-4xl mb-1">🏆</div>
            <div className="text-gray-400 text-xs uppercase tracking-wide">{t('tournaments.champion')}</div>
            <div className="text-lime-400 text-2xl font-bold">{teamName(tour.champion_id)}</div>
          </div>
        ))}

      {error && <p className="card text-red-400 text-sm mb-4">{error}</p>}

      <TournamentFees tour={tour} />

      {tour.kind === 'team' && <TeamLeagueView tour={tour} onChange={setData} />}

      {tour.kind !== 'team' && tour.group_count > 0 && (
        <div className="grid grid-cols-2 bg-navy-900 rounded-lg p-1 text-sm mb-4">
          {['groups', 'ko'].map((k) => (
            <button key={k} disabled={k === 'ko' && !ko.length} onClick={() => setTab(k)} className={`rounded-md py-2 disabled:opacity-30 ${current === k ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400'}`}>
              {k === 'groups' ? t('tournaments.groupTab') : t('tournaments.koTab')}
            </button>
          ))}
        </div>
      )}

      {tour.kind !== 'team' && current === 'groups' && tour.group_count > 0 && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
            {Object.entries(tour.groups).map(([g, rows]) => {
              const fixtures = tour.matches.filter((m) => m.stage === 'group' && m.group_no === Number(g));
              return (
                <div key={g} className="card">
                  <h2 className="text-white font-semibold mb-2">{t('tournaments.group', { g: String.fromCharCode(64 + Number(g)) })}</h2>
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-xs sm:text-sm grid-table compact-cells">
                      <thead>
                        <tr className="text-gray-300 bg-navy-900">
                          <th className="w-8 text-center">#</th>
                          <th className="text-left">{t('tournaments.team')}</th>
                          <th className="text-right hidden sm:table-cell">{t('tournaments.played')}</th>
                          <th className="text-right">{t('tournaments.wins')}</th>
                          <th className="text-right">{t('tournaments.losses')}</th>
                          <th className="text-right">{t('tournaments.diff')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const q = r.position <= tour.advance_per_group;
                          return (
                            <tr key={r.team_id} className={q ? 'bg-lime-400/5' : ''}>
                              <td className={`text-center ${q ? 'text-lime-400 font-bold' : 'text-gray-400'}`}>{r.position}</td>
                              <td className="text-white w-full min-w-[8rem] leading-snug">{teamName(r.team_id)}</td>
                              <td className="text-right tabular-nums text-gray-300 hidden sm:table-cell">{r.played}</td>
                              <td className="text-right tabular-nums text-gray-300">{r.wins}</td>
                              <td className="text-right tabular-nums text-gray-300">{r.losses}</td>
                              <td className={`text-right tabular-nums ${r.diff > 0 ? 'text-lime-400' : r.diff < 0 ? 'text-red-400' : 'text-gray-300'}`}>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-2">
                    {[...new Set(fixtures.map((m) => m.round))].map((rd) => (
                      <div key={rd}>
                        <div className="text-gray-500 text-xs mb-1">{t('tournaments.round', { n: rd })}</div>
                        <div className="grid grid-cols-1 gap-2">
                          {fixtures.filter((m) => m.round === rd).map((m) => (
                            <MatchRow key={m.id} m={m} teamName={teamName} onOpen={tour.status === 'groups' ? setScoring : () => {}} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {tour.status === 'groups' && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button className="btn-primary" disabled={!tour.group_stage_done} onClick={() => run(async () => {
                const res = await api.post(`/api/tournaments/${id}/knockout`, {});
                setTab('ko');
                return res;
              })}>
                {t('tournaments.startKo')}
              </button>
              {!tour.group_stage_done && <span className="text-gray-500 text-xs">{t('tournaments.startKoHint')}</span>}
            </div>
          )}
        </>
      )}

      {tour.kind !== 'team' && current === 'ko' && ko.length > 0 && (() => {
        const rounds = Array.from({ length: tour.rounds }, (_, i) => i + 1);
        const pending = (rd) => ko.filter((m) => m.round === rd && !m.is_bye && m.team1_id && m.team2_id && m.winner_id == null).length;
        const shownRound = koRound || rounds.find((rd) => pending(rd) > 0) || rounds[rounds.length - 1];
        return (
        <>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="grid grid-cols-2 bg-navy-900 rounded-lg p-1 text-xs" role="tablist">
              {['list', 'bracket'].map((v) => (
                <button key={v} type="button" role="tab" aria-selected={koView === v} onClick={() => setKoView(v)} className={`rounded-md px-3 py-1.5 ${koView === v ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400'}`}>
                  {t(`bracket.${v}`)}
                </button>
              ))}
            </div>
            {koView === 'bracket' && <span className="md:hidden text-gray-500 text-xs">{t('bracket.swipe')}</span>}
          </div>

          {koView === 'list' ? (
            <>
              <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2 mb-2">
                {rounds.map((rd) => {
                  const total = ko.filter((m) => m.round === rd && !m.is_bye).length;
                  const left = pending(rd);
                  return (
                    <button
                      key={rd}
                      type="button"
                      onClick={() => setKoRound(rd)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${shownRound === rd ? 'border-lime-400 bg-lime-400/10 text-lime-300' : 'border-navy-600 text-gray-300'}`}
                    >
                      {roundLabel(rd, tour.rounds, t)}
                      <span className="ml-1.5 text-xs text-gray-500">{total ? `${total - left}/${total}` : ''}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col gap-2">
                {ko.filter((m) => m.round === shownRound).map((m) => (
                  <MatchRow key={m.id} m={m} teamName={teamName} onOpen={setScoring} />
                ))}
              </div>
              <div className="flex justify-between mt-3 text-sm">
                <button type="button" className="text-gray-400 disabled:opacity-30" disabled={shownRound <= 1} onClick={() => setKoRound(shownRound - 1)}>
                  ← {shownRound > 1 ? roundLabel(shownRound - 1, tour.rounds, t) : ''}
                </button>
                <button type="button" className="text-lime-400 disabled:opacity-30" disabled={shownRound >= tour.rounds} onClick={() => setKoRound(shownRound + 1)}>
                  {shownRound < tour.rounds ? roundLabel(shownRound + 1, tour.rounds, t) : ''} →
                </button>
              </div>
            </>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory">
              <div className="flex gap-4 min-w-max">
                {rounds.map((rd) => (
                  <div key={rd} className="w-[78vw] max-w-[15rem] sm:w-60 flex flex-col snap-start">
                    <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">{roundLabel(rd, tour.rounds, t)}</div>
                    <div className="flex flex-col justify-around flex-1 gap-3">
                      {ko.filter((m) => m.round === rd).map((m) => (
                        <MatchRow key={m.id} m={m} teamName={teamName} onOpen={setScoring} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tour.group_count > 0 && (
            <button className="text-gray-400 text-sm underline mt-4" onClick={() => {
              if (window.confirm(t('tournaments.resetKoConfirm'))) {
                run(async () => {
                  const res = await api.del(`/api/tournaments/${id}/knockout`);
                  setTab('groups');
                  return res;
                });
              }
            }}>
              {t('tournaments.resetKo')}
            </button>
          )}
        </>
        );
      })()}

      <Modal open={!!scoring} title={t('tournaments.enterScore')} onClose={() => setScoring(null)}>
        {scoring && <ScoreForm match={scoring} teamName={teamName} onSave={saveScore} onClear={clearScore} onCancel={() => setScoring(null)} />}
      </Modal>
    </AppShell>
  );
}
