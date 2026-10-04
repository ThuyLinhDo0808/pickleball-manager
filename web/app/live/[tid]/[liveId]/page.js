'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { sportIcon } from '@/lib/live';
import LiveGuide from '@/components/LiveGuide';

// The scorer's pad: tap the side that won the rally. The server keeps the rules (who
// serves, from which side, game / match end); this page shows them and the call to read
// out. Several phones may score the same match: every tap carries the version it saw.
export default function ScorerPage() {
  const { tid, liveId } = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const [live, setLive] = useState(null);
  const [sport, setSport] = useState('pickleball');
  const [tourName, setTourName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingCourt, setEditingCourt] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const b = await api.get(`/api/live/${tid}`);
      setSport(b.tournament.sport);
      setTourName(b.tournament.name);
      const l = b.lives.find((x) => x.id === liveId);
      if (!l) return setError(t('live.gone'));
      setLive((cur) => (busyRef.current ? cur : l));
    } catch (err) {
      setError(err.message);
    }
  }, [tid, liveId, t]);

  useEffect(() => {
    refresh();
    const iv = setInterval(() => document.visibilityState === 'visible' && refresh(), 3000);
    return () => clearInterval(iv);
  }, [refresh]);

  async function send(path, body = {}) {
    if (busyRef.current || !live) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      setLive(await api.post(`/api/live/${tid}/${liveId}/${path}`, { ...body, version: live.version }));
    } catch (err) {
      if (err.payload?.code === 'stale' && err.payload.live) {
        setLive(err.payload.live);
        setError(t('live.stale'));
      } else setError(err.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function stop() {
    if (!window.confirm(t('live.stopConfirm'))) return;
    await api.del(`/api/live/${tid}/${liveId}`).catch(() => {});
    router.push(`/live/${tid}`);
  }

  async function saveCourt(court) {
    setEditingCourt(false);
    try {
      setLive(await api.patch(`/api/live/${tid}/${liveId}`, { court }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!live) {
    return (
      <AppShell>
        <p className="text-gray-400">{error || t('common.loading')}</p>
        <Link href={`/live/${tid}`} className="text-lime-400 text-sm">← {t('live.back')}</Link>
      </AppShell>
    );
  }

  const s = live.state;
  const cfg = live.config;
  // Rows started before scoring systems existed: pickleball side-out, badminton rally.
  const scoring = cfg.scoring || (sport === 'badminton' ? 'rally' : 'sideout');
  const icon = sportIcon(sport);
  const name = (id) => live.names[id] || '?';
  const teamLabel = (side) => (side === 1 ? live.team1 : live.team2);
  const saved = live.status === 'saved';
  const noteKey = s?.note && !s.finished ? `live.note_${s.note}` : null;

  // One team's half of the pad (a plain render helper, not a component, so taps never remount it).
  const half = (side) => {
    const serving = s.serving === side;
    const pos = s.positions[side] || [];
    const tone = side === 1 ? 'from-sky-500/20 border-sky-400/40' : 'from-amber-400/20 border-amber-400/40';
    return (
      <button
        type="button"
        disabled={busy || s.finished || saved}
        onClick={() => send('event', { ev: `r${side}` })}
        aria-label={t('live.rallyTo', { name: teamLabel(side) })}
        className={`relative w-full rounded-2xl border bg-gradient-to-b ${tone} to-navy-900 p-4 text-left transition active:scale-[0.99] disabled:opacity-80 ${serving ? 'ring-2 ring-lime-400' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-white text-lg font-bold truncate">{teamLabel(side)}</div>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm">
              {pos.map((id, i) => (
                <li key={id} className={`flex items-center gap-1.5 ${s.server_id === id ? 'text-lime-300 font-semibold' : 'text-gray-300'}`}>
                  <span className="text-[10px] uppercase rounded bg-navy-950/70 px-1.5 py-0.5 text-gray-400 w-12 text-center">{cfg.doubles ? (i === 0 ? t('live.right') : t('live.left')) : '—'}</span>
                  <span className="truncate">{name(id)}</span>
                  {s.server_id === id && <span aria-label={t('live.serving')}>{icon}</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-right shrink-0">
            <div className="text-6xl sm:text-7xl font-black tabular-nums text-white leading-none">{s.score[side - 1]}</div>
            {cfg.best_of > 1 && (
              <div className="mt-1 flex justify-end gap-1" aria-label={t('live.gamesWon', { n: s.games_won[side - 1] })}>
                {Array.from({ length: Math.ceil(cfg.best_of / 2) }, (_, i) => (
                  <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < s.games_won[side - 1] ? 'bg-lime-400' : 'bg-navy-600'}`} />
                ))}
              </div>
            )}
          </div>
        </div>
        {!s.finished && !saved && <div className="mt-3 text-center text-xs text-gray-400">{t('live.tapWon')}</div>}
        {serving && !s.finished && (
          <span className="absolute -top-2.5 left-4 rounded-full bg-lime-400 text-navy-950 text-[11px] font-bold px-2 py-0.5">
            {icon} {t('live.serving')}{s.server_side ? ` · ${t(`live.${s.server_side}`)}` : ''}
            {s.two_servers ? ` · ${t('live.serverNo', { n: s.server_no })}` : ''}
          </span>
        )}
      </button>
    );
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between gap-2 mb-3">
          <Link href={`/live/${tid}`} className="text-gray-400 text-sm hover:text-white">← {t('live.back')}</Link>
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-gray-400 text-xs truncate">{tourName}</span>
            <LiveGuide sport={sport} scoring={live?.config?.scoring} autoOpen />
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          {editingCourt ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveCourt(e.currentTarget.court.value);
              }}
            >
              <input name="court" className="input !w-40 text-sm" defaultValue={live.court || ''} placeholder={t('live.courtPh')} maxLength={40} autoFocus />
              <button className="btn-secondary text-sm">✓</button>
            </form>
          ) : (
            <button type="button" className="text-white font-semibold" onClick={() => setEditingCourt(true)}>
              <span className="text-red-400">●</span> {live.court || t('live.noCourt')} <span className="text-gray-500 text-sm">✏️</span>
            </button>
          )}
          <span className="text-gray-300 text-sm">
            {t('live.gameN', { n: s?.game_no || 1 })} · {t(`live.scoring_${scoring}`)} · {t('live.pointsN', { n: cfg.points })}{cfg.win_by === 1 ? ` · ${t('live.winBy_1').toLowerCase()}` : ''} · {t(`live.bo${cfg.best_of}`)}{cfg.freeze ? ' · ❄️' : ''}
          </span>
        </div>

        {!s ? (
          <p className="card text-red-400">{t('live.broken')}</p>
        ) : (
          <>
            {s.games.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
                {s.games.map(([a, b], i) => (
                  <span key={i} className="rounded-full bg-navy-900 border border-navy-700 px-2.5 py-1 text-gray-300 tabular-nums">
                    {t('live.gameN', { n: i + 1 })}: <span className={a > b ? 'text-sky-300 font-semibold' : ''}>{a}</span>-<span className={b > a ? 'text-amber-300 font-semibold' : ''}>{b}</span>
                  </span>
                ))}
              </div>
            )}

            {half(1)}

            <div className="my-3 rounded-xl border border-navy-700 bg-navy-950 py-3 text-center">
              {s.finished ? (
                <div className="text-lime-300 text-xl font-bold">🏆 {t('live.winner', { name: teamLabel(s.winner) })}</div>
              ) : (
                <>
                  <div className="text-gray-400 text-[11px] uppercase tracking-wider">{t('live.call')}</div>
                  <div className="text-white text-4xl font-black tabular-nums tracking-wider">{s.call}</div>
                  {s.point && <div className="mt-1 inline-block rounded-full bg-red-500 text-white text-xs font-bold px-3 py-0.5">{s.point.match ? t('live.matchPoint') : t('live.gamePoint')} · {teamLabel(s.point.team)}</div>}
                </>
              )}
              {noteKey && <div className={`mt-2 text-sm font-semibold ${s.note === 'switch_ends' || s.note === 'game_over' ? 'text-amber-300' : 'text-sky-300'}`}>📣 {t(noteKey)}</div>}
            </div>

            {half(2)}

            {s.at_start && !saved && (
              <div className="mt-3 card !p-3 text-sm">
                <p className="text-gray-400 text-xs mb-2">{t('live.atStartHint')}</p>
                <div className="flex flex-wrap gap-2">
                  {[1, 2].map((side) => (
                    <button key={`s${side}`} type="button" disabled={busy || s.serving === side} className="btn-secondary !py-1.5 text-sm disabled:opacity-40" onClick={() => send('event', { ev: `s${side}` })}>
                      {icon} {t('live.setServer', { name: teamLabel(side) })}
                    </button>
                  ))}
                  {cfg.doubles &&
                    [1, 2].map((side) => (
                      <button key={`x${side}`} type="button" disabled={busy} className="btn-secondary !py-1.5 text-sm" onClick={() => send('event', { ev: `x${side}` })}>
                        ⇄ {t('live.swap', { name: teamLabel(side) })}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </>
        )}

        {error && <p className="text-amber-300 text-sm mt-3">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" disabled={busy || saved || !live.events} onClick={() => send('undo')}>↶ {t('live.undo')}</button>
          {s?.finished && !saved ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => send('save')}>💾 {t('live.save')}</button>
          ) : saved ? (
            <Link href={`/live/${tid}`} className="btn-primary text-center">✓ {t('live.saved')}</Link>
          ) : (
            <button type="button" className="rounded-lg px-3 py-2 font-semibold border border-red-500/60 text-red-300 hover:bg-red-500/10" disabled={busy} onClick={stop}>■ {t('live.stop')}</button>
          )}
        </div>
        <p className="text-gray-500 text-xs mt-3">{t(`live.rule_${sport === 'badminton' ? 'badminton' : scoring}`)}</p>
      </div>
    </AppShell>
  );
}
