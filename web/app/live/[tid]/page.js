'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import PageHeader from '@/components/ui/PageHeader';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import Segmented from '@/components/ui/Segmented';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { matchLabel, sportIcon } from '@/lib/live';

// Live scoring hub of one tournament: matches being played (tap to keep scoring), the
// ones still to play (start one), and — for the club managers — the public board link.
export default function LiveHubPage() {
  const { tid } = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { data, loading, error, reload, setData } = useLoad(() => api.get(`/api/live/${tid}`), [tid]);
  const [starting, setStarting] = useState(null);
  const [filter, setFilter] = useState('todo');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  // Scores on this page follow the courts (another scorer may be pressing).
  useEffect(() => {
    const iv = setInterval(() => document.visibilityState === 'visible' && reload(), 5000);
    return () => clearInterval(iv);
  }, [reload]);

  if (loading && !data) return <AppShell><p className="text-gray-400">{t('common.loading')}</p></AppShell>;
  if (!data) return <AppShell><p className="text-gray-400">{error ? t('live.noAccess') : t('common.loading')}</p></AppShell>;

  const { tournament: tour, lives, matches, role } = data;
  const running = lives.filter((l) => l.status === 'live');
  const todo = matches.filter((m) => !m.played && !m.live && !m.locked);
  const done = matches.filter((m) => m.played);
  const shown = filter === 'todo' ? todo : done;
  const publicUrl = tour.live_token ? `${window.location.origin}/l/${tour.live_token}` : null;

  async function togglePublic(on) {
    setBusy(true);
    try {
      const r = await api.post(`/api/live/${tid}/public`, { on });
      setData({ ...data, tournament: { ...tour, live_token: r.live_token } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        icon="🔴"
        title={t('live.title')}
        subtitle={`${sportIcon(tour.sport)} ${tour.name}`}
        actions={role === 'manager' ? <Link href={`/club/tournaments/${tid}`} className="btn-secondary text-sm">🏆 {t('live.toTournament')}</Link> : null}
      />

      <KpiRow cols={4}>
        <StatTile icon="🔴" label={t('live.liveNow')} value={running.length} tone="text-red-300" />
        <StatTile icon="⏳" label={t('live.notStarted')} value={todo.length} />
        <StatTile icon="✅" label={t('live.played')} value={done.length} tone="text-lime-300" />
        <StatTile icon="🏆" label={t('tournaments.champion')} value={data.champion || '—'} tone="text-amber-300" />
      </KpiRow>

      {role === 'manager' && (
        <section className="card mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-white font-semibold">📺 {t('live.publicTitle')}</h2>
              <p className="text-gray-400 text-xs mt-0.5">{t('live.publicHint')}</p>
            </div>
            {publicUrl ? (
              <button type="button" className="text-red-300 text-sm" disabled={busy} onClick={() => togglePublic(false)}>{t('live.publicOff')}</button>
            ) : (
              <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => togglePublic(true)}>{t('live.publicOn')}</button>
            )}
          </div>
          {publicUrl && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-lg bg-navy-950 border border-navy-700 px-3 py-2 text-sm text-lime-200">{publicUrl}</code>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  navigator.clipboard?.writeText(publicUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? `✓ ${t('live.copied')}` : `📋 ${t('live.copy')}`}
              </button>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="btn-secondary text-sm">↗ {t('live.openBoard')}</a>
            </div>
          )}
        </section>
      )}

      {running.length > 0 && (
        <section className="mb-5">
          <h2 className="text-gray-300 text-sm font-semibold mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> {t('live.liveNow')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {running.map((l) => {
              const m = matches.find((x) => (l.match_id ? x.match_id === l.match_id : x.sub_match_id === l.sub_match_id));
              return (
                <Link key={l.id} href={`/live/${tid}/${l.id}`} className="card !p-0 overflow-hidden hover:border-red-400 transition">
                  <div className="flex items-center justify-between px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-xs">
                    <span className="text-red-200 font-semibold">● {l.court || t('live.noCourt')}</span>
                    <span className="text-gray-300">{m ? matchLabel(m, matches, t) : ''} · {t('live.gameN', { n: l.state?.game_no || 1 })}</span>
                  </div>
                  {[1, 2].map((side) => (
                    <div key={side} className="flex items-center justify-between gap-2 px-4 py-2">
                      <span className={`truncate ${l.state?.serving === side ? 'text-white font-semibold' : 'text-gray-300'}`}>
                        {l.state?.serving === side && <span className="mr-1">{sportIcon(tour.sport)}</span>}
                        {side === 1 ? l.team1 : l.team2}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        {l.config.best_of > 1 && <span className="text-gray-500 text-xs">{l.state?.games_won[side - 1]}</span>}
                        <span className="text-2xl font-bold text-white w-10 text-right">{l.state?.score[side - 1]}</span>
                      </span>
                    </div>
                  ))}
                  <div className="px-4 py-2 border-t border-navy-700 text-lime-300 text-sm font-semibold">{t('live.resume')} →</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex items-center gap-2 mb-3">
        <Segmented items={['todo', 'done']} value={filter} onChange={setFilter} label={(k) => (k === 'todo' ? `${t('live.notStarted')} (${todo.length})` : `${t('live.played')} (${done.length})`)} />
      </div>
      {shown.length === 0 && <p className="text-gray-400 text-sm card">{filter === 'todo' ? t('live.none') : '—'}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {shown.map((m) => (
          <div key={m.match_id || m.sub_match_id} className="card !p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-gray-400 text-xs">{matchLabel(m, matches, t)}</div>
              <div className="text-white text-sm truncate">{m.team1} <span className="text-gray-500">vs</span> {m.team2}</div>
              {m.played && <div className="text-lime-300 text-xs tabular-nums">{m.score?.join(' - ')}{m.games ? ` (${m.games.map((g) => g.join('-')).join(', ')})` : ''}</div>}
            </div>
            {!m.played && (
              <button type="button" className="btn-primary text-sm shrink-0" onClick={() => setStarting(m)}>▶ {t('live.score')}</button>
            )}
          </div>
        ))}
      </div>

      <StartModal
        match={starting}
        sport={tour.sport}
        kind={tour.kind}
        rosters={data.rosters}
        label={starting ? matchLabel(starting, matches, t) : ''}
        onClose={() => setStarting(null)}
        onStarted={(live) => router.push(`/live/${tid}/${live.id}`)}
        tid={tid}
        reload={reload}
      />
    </AppShell>
  );
}

function StartModal({ match, sport, kind, rosters, label, onClose, onStarted, tid }) {
  const { t } = useI18n();
  const [court, setCourt] = useState('');
  const [points, setPoints] = useState(11);
  const [bestOf, setBestOf] = useState(sport === 'badminton' ? 3 : 1);
  const [first, setFirst] = useState(1);
  const [lineup, setLineup] = useState({ 1: ['', ''], 2: ['', ''] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!match) return null;
  const size = match.format === 'singles' ? 1 : 2;
  const pickLineup = kind === 'team';

  async function start() {
    setBusy(true);
    setError('');
    try {
      const players = pickLineup ? { 1: lineup[1].slice(0, size).filter(Boolean), 2: lineup[2].slice(0, size).filter(Boolean) } : undefined;
      const live = await api.post(`/api/live/${tid}/start`, { match_id: match.match_id, sub_match_id: match.sub_match_id, court, points, best_of: bestOf, first_server: first, players });
      onStarted(live);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const teamName = (side) => (side === 1 ? match.team1 : match.team2);
  return (
    <Modal open={!!match} title={`▶ ${t('live.startTitle')}`} onClose={() => !busy && onClose()}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="rounded-lg bg-navy-900 border border-navy-700 px-3 py-2">
          <div className="text-gray-400 text-xs">{label}</div>
          <div className="text-white font-semibold">{match.team1} <span className="text-gray-500 font-normal">vs</span> {match.team2}</div>
        </div>
        <div>
          <label className="text-xs text-gray-400" htmlFor="live-court">{t('live.court')}</label>
          <input id="live-court" className="input" placeholder={t('live.courtPh')} value={court} maxLength={40} onChange={(e) => setCourt(e.target.value)} />
        </div>
        {sport === 'pickleball' && (
          <div>
            <label className="text-xs text-gray-400">{t('live.points')}</label>
            <Segmented full items={[11, 15, 21]} value={points} onChange={setPoints} label={(n) => t('live.pointsN', { n })} />
          </div>
        )}
        <div>
          <label className="text-xs text-gray-400">{t('live.bestOf')}</label>
          <Segmented full items={[1, 3]} value={bestOf} onChange={setBestOf} label={(n) => (n === 1 ? t('live.bo1') : t('live.bo3'))} />
          {sport === 'badminton' && <p className="text-gray-500 text-xs mt-1">{t('live.badmintonRule')}</p>}
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('live.firstServer')}</label>
          <Segmented full items={[1, 2]} value={first} onChange={setFirst} label={(s) => teamName(s)} />
        </div>
        {pickLineup && rosters && (
          <div>
            <label className="text-xs text-gray-400">{t('live.lineup')}</label>
            <p className="text-gray-500 text-xs mb-1">{t('live.lineupHint')}</p>
            {[1, 2].map((side) => (
              <div key={side} className="grid grid-cols-[5rem_1fr_1fr] gap-2 items-center mb-1.5">
                <span className="text-gray-300 truncate">{teamName(side)}</span>
                {Array.from({ length: size }, (_, i) => (
                  <select
                    key={i}
                    className="input text-sm"
                    value={lineup[side][i]}
                    onChange={(e) => setLineup({ ...lineup, [side]: lineup[side].map((x, j) => (j === i ? e.target.value : x)) })}
                    aria-label={`${teamName(side)} ${i === 0 ? t('live.right') : t('live.left')}`}
                  >
                    <option value="">{i === 0 ? t('live.right') : t('live.left')}…</option>
                    {(rosters[side === 1 ? match.team1_id : match.team2_id] || []).map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                ))}
              </div>
            ))}
          </div>
        )}
        {!pickLineup && size === 2 && <p className="text-gray-500 text-xs">{t('live.positionsHint')}</p>}
        {error && <p className="text-red-400">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={start}>▶ {t('live.start')}</button>
        </div>
      </div>
    </Modal>
  );
}
