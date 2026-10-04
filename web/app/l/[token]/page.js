'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { clock, elapsed, matchLabel, minutesText, sportIcon } from '@/lib/live';
import { useNow } from '@/lib/useNow';

// Public live scoreboard (no login): the matches on court now, refreshed every few
// seconds, plus just-finished results and what's next. Works on a phone or a TV at the venue.
export default function LiveBoardPage() {
  const { token } = useParams();
  const { t, lang, setLang } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [at, setAt] = useState(null);
  const now = useNow(1000);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await api.publicGet(`/api/public/live/${token}`);
        if (alive) {
          setData(d);
          setError(null);
          setAt(new Date());
        }
      } catch (err) {
        if (alive) setError(err);
      }
    };
    load();
    const iv = setInterval(() => document.visibilityState === 'visible' && load(), 4000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [token]);

  const langToggle = (
    <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
      {lang === 'vi' ? 'EN' : 'VI'}
    </button>
  );

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-navy-950">
        <p className="text-gray-300">{error ? (error.status === 404 ? t('live.notFound') : t('public.loadError')) : t('common.loading')}</p>
        {langToggle}
      </div>
    );
  }

  const { tournament: tour, lives, matches } = data;
  const icon = sportIcon(tour.sport);
  const running = lives.filter((l) => l.status === 'live');
  const recent = lives.filter((l) => l.status === 'saved').sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);
  const next = matches.filter((m) => !m.played && !m.live).slice(0, 8);
  const label = (l) => {
    const m = matches.find((x) => (l.match_id ? x.match_id === l.match_id : x.sub_match_id === l.sub_match_id));
    return m ? matchLabel(m, matches, t) : '';
  };

  return (
    <div className="min-h-screen bg-navy-950 px-4 py-5 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5 max-w-6xl mx-auto">
        <div className="min-w-0">
          <p className="text-gray-400 text-sm truncate">{tour.club_name}</p>
          <h1 className="text-white text-2xl sm:text-3xl font-bold truncate">{icon} {tour.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 border border-red-500/40 px-3 py-1 text-red-200 text-sm font-semibold">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> {t('live.boardTitle')}
          </span>
          {langToggle}
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        {data.champion && (
          <div className="card mb-5 text-center border-amber-300/60 bg-amber-300/5 py-5">
            <div className="text-4xl">🏆</div>
            <div className="text-gray-400 text-xs uppercase tracking-wide">{t('tournaments.champion')}</div>
            <div className="text-amber-300 text-2xl font-bold">{data.champion}</div>
          </div>
        )}

        {running.length === 0 && <p className="card text-gray-400 text-center py-8 mb-5">{t('live.noneLive')}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
          {running.map((l) => {
            const s = l.state;
            return (
              <article key={l.id} className="rounded-2xl border border-navy-700 bg-navy-900 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-xs">
                  <span className="text-red-200 font-semibold">● {l.court || t('live.noCourt')}</span>
                  <span className="text-gray-300 truncate ml-2">
                    {label(l)} · {t('live.gameN', { n: s?.game_no || 1 })}
                    {s?.timing?.started_at && <span className="text-white tabular-nums"> · ⏱ {clock(elapsed(s.timing, now).match)}</span>}
                  </span>
                </div>
                {[1, 2].map((side) => {
                  const serving = s?.serving === side;
                  return (
                    <div key={side} className={`flex items-center gap-3 px-4 py-3 ${side === 1 ? 'border-b border-navy-700' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-lg ${serving ? 'text-white font-bold' : 'text-gray-300'}`}>{side === 1 ? l.team1 : l.team2}</div>
                        <div className="text-gray-500 text-xs truncate">
                          {(s?.positions?.[side] || []).map((id) => (
                            <span key={id} className={s?.server_id === id ? 'text-lime-300' : ''}>
                              {l.names[id]}
                              {s?.server_id === id ? ` ${icon}` : ''}
                              {'  '}
                            </span>
                          ))}
                        </div>
                      </div>
                      {l.config.best_of > 1 && (
                        <div className="flex gap-1">
                          {(s?.games || []).map(([a, b], i) => (
                            <span key={i} className={`w-7 text-center text-sm tabular-nums rounded ${(side === 1 ? a > b : b > a) ? 'text-lime-300 font-semibold' : 'text-gray-500'}`}>{side === 1 ? a : b}</span>
                          ))}
                        </div>
                      )}
                      <div className={`w-14 text-right text-4xl font-black tabular-nums ${serving ? 'text-lime-300' : 'text-white'}`}>{s?.score[side - 1]}</div>
                    </div>
                  );
                })}
                {s?.point && !s.finished && (
                  <div className="px-4 py-1.5 text-center text-xs font-bold bg-red-500 text-white">{s.point.match ? t('live.matchPoint') : t('live.gamePoint')}</div>
                )}
                {s?.finished && <div className="px-4 py-1.5 text-center text-xs font-bold bg-lime-400 text-navy-950">🏆 {t('live.winner', { name: s.winner === 1 ? l.team1 : l.team2 })}</div>}
              </article>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="card">
            <h2 className="text-white font-semibold mb-2">✅ {t('live.recent')}</h2>
            {recent.length === 0 && <p className="text-gray-500 text-sm">—</p>}
            <ul className="divide-y divide-navy-700">
              {recent.map((l) => (
                <li key={l.id} className="py-2 text-sm">
                  <div className="text-gray-500 text-xs">
                    {label(l)}
                    {l.court ? ` · ${l.court}` : ''}
                    {l.state?.timing?.started_at && l.state?.timing?.ended_at ? ` · ⏱ ${minutesText((l.state.timing.ended_at - l.state.timing.started_at) / 1000, t)}` : ''}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate ${l.state?.winner === 1 ? 'text-white font-semibold' : 'text-gray-400'}`}>{l.team1}</span>
                    <span className="tabular-nums text-gray-300 shrink-0">{(l.state?.games || []).map(([a, b]) => `${a}-${b}`).join(', ')}</span>
                    <span className={`truncate text-right ${l.state?.winner === 2 ? 'text-white font-semibold' : 'text-gray-400'}`}>{l.team2}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2 className="text-white font-semibold mb-2">⏭ {t('live.upcoming')}</h2>
            {next.length === 0 && <p className="text-gray-500 text-sm">—</p>}
            <ul className="divide-y divide-navy-700">
              {next.map((m) => (
                <li key={m.match_id || m.sub_match_id} className="py-2 text-sm">
                  <div className="text-gray-500 text-xs">{matchLabel(m, matches, t)}</div>
                  <div className="text-gray-200 truncate">{m.team1} <span className="text-gray-500">vs</span> {m.team2}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <p className="text-gray-600 text-xs text-center mt-6">
          {t('live.auto')}
          {at ? ` · ${at.toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-GB')}` : ''}
        </p>
      </main>
    </div>
  );
}
