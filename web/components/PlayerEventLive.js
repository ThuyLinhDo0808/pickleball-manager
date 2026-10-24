'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import Podium from '@/components/Podium';
import UiIcon from '@/components/ui/UiIcon';
import { Avatar } from '@/components/PlayerChip';
import { api } from '@/lib/api';
import { eventStandings } from '@/lib/eventStandings';

const POLL_MS = 20000;
const scored = (m) => m.team1_score != null && m.team2_score != null && m.team1_score !== m.team2_score;
const nameOf = (mp) => mp.event_participants?.full_name || mp.club_members?.full_name || '?';
const teamNames = (m, team) => (m.match_players || []).filter((mp) => mp.team === team).map(nameOf).join(' & ') || '—';

// "Lịch chơi" of a kèo for a player who has a place in it (like Reclub): who plays on which
// court (refreshed every 20 s, with a notice when the Host moves someone), the scores, the
// session rankings and the challenge matches. Hidden for everyone else.
export default function PlayerEventLive({ token, sport = 'pickleball' }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('players');
  const [toast, setToast] = useState('');
  const lastMove = useRef(null);

  const courtName = useCallback((groups, id) => {
    const i = (groups || []).findIndex((g) => g.id === id);
    return i < 0 ? t('egroups.noCourt') : t('egroups.courtN', { n: groups[i].courts || i + 1 });
  }, [t]);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/api/events/public/${token}/live`);
      setData(r);
      // The Host changed the kèo's time since the last look: say so. (Court moves before
      // the kèo are the Host arranging people — no notice.)
      const at = r.event?.schedule_changed_at || null;
      if (at && lastMove.current && at > lastMove.current) setToast(t('elive.timeChanged', { time: [r.event.start_time, r.event.end_time].filter(Boolean).map((x) => String(x).slice(0, 5)).join('–') }));
      lastMove.current = at || lastMove.current || '0';
    } catch {
      setData(null); // not playing in this kèo (or signed out): nothing to show
    }
  }, [token, t]);
  useEffect(() => {
    if (!user) return undefined;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [user, load]);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 8000);
    return () => clearTimeout(id);
  }, [toast]);

  const matches = data?.matches || [];
  const rows = useMemo(() => eventStandings(matches), [matches]);
  if (!user || !data) return null;

  const groups = data.groups || [];
  const boards = groups.length
    ? [
        ...groups.map((g, i) => ({ key: g.id, title: t('egroups.courtN', { n: g.courts || i + 1 }), sub: [g.play_format ? t(`fmt.${g.play_format}`) : null, `${g.start_time}–${g.end_time}`].filter(Boolean).join(' · '), slots: g.slots, people: data.players.filter((p) => p.group_id === g.id) })),
        ...(data.players.some((p) => !groups.some((g) => g.id === p.group_id)) ? [{ key: 'none', title: t('egroups.noCourt'), people: data.players.filter((p) => !groups.some((g) => g.id === p.group_id)) }] : []),
      ]
    : [{ key: 'all', title: t('elive.allPlayers'), slots: data.event?.slots || null, people: data.players }];
  const results = matches.filter(scored);
  const challenges = matches.filter((m) => m.is_challenge);
  const myId = data.me?.id;

  return (
    <section className="card mb-4" aria-label={t('elive.title')}>
      <h2 className="text-white font-semibold mb-1 flex items-center gap-2"><UiIcon name="calendar" className="w-4 h-4 text-gray-400" />{t('elive.title')}</h2>
      {groups.length > 0 && data.me && (
        <p className="text-lime-300 text-sm mb-2 flex items-center gap-2"><UiIcon name="court" className="w-4 h-4" />{t('elive.myCourt', { court: courtName(groups, data.me.group_id) })}</p>
      )}
      {data.event?.schedule_changed_at && data.event.status !== 'cancelled' && Date.now() - Date.parse(data.event.schedule_changed_at) < 3 * 86400000 && !toast && (
        <p className="mb-2 rounded-lg border border-amber-300/60 bg-amber-300/10 px-3 py-2 text-amber-100 text-sm flex items-start gap-2"><UiIcon name="clock" className="w-4 h-4 mt-0.5" /><span>{t('elive.timeChanged', { time: [data.event.start_time, data.event.end_time].filter(Boolean).map((x) => String(x).slice(0, 5)).join('–') })}</span></p>
      )}
      {toast && <p role="status" className="mb-2 rounded-lg border border-amber-300/60 bg-amber-300/10 px-3 py-2 text-amber-100 text-sm flex items-start gap-2"><UiIcon name="bell" className="w-4 h-4 mt-0.5" /><span>{toast}</span></p>}
      <UnderlineTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'players', label: t('elive.tabPlayers'), icon: 'users', count: data.players.length },
          { key: 'results', label: t('elive.results'), icon: 'clipboard', count: results.length },
          { key: 'standings', label: t('estand.title'), icon: 'medal' },
          { key: 'challenges', label: t('elive.challenges'), icon: 'swords', count: challenges.length },
        ]}
      />

      {tab === 'players' && (
        <div className="flex flex-col gap-3">
          {boards.map((b) => (
            <div key={b.key} className={`rounded-xl border p-2.5 ${b.people.some((p) => p.id === myId) ? 'border-lime-400/60' : 'border-navy-700'}`}>
              <p className="text-white text-sm font-semibold mb-2">
                {b.title}
                {b.sub && <span className="text-gray-400 font-normal"> · {b.sub}</span>}
                {b.slots ? <span className="text-gray-400 font-normal tabular-nums"> · {b.people.length}/{b.slots}</span> : null}
              </p>
              {b.people.length === 0 && !b.slots ? (
                <p className="text-gray-500 text-xs">{t('elive.empty')}</p>
              ) : (
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {b.people.map((p) => (
                    <li key={p.id} className={`rounded-lg px-2 py-2 text-center ${p.id === myId ? 'bg-lime-400/15 ring-1 ring-lime-400/60' : 'bg-navy-900'}`}>
                      <span className="mb-1 flex justify-center"><Avatar uid={p.avatar_uid} v={p.avatar_v} name={p.full_name} size={36} /></span>
                      <span className="block text-white text-xs font-semibold break-words">{p.full_name}{p.id === myId ? ` (${t('elive.you')})` : ''}</span>
                      <span className="block text-gray-400 text-[11px]">
                        {p.gender ? `${t(`members.${p.gender}`)} · ` : ''}
                        {sport === 'pickleball' ? (p.dupr != null ? `DUPR ${Number(p.dupr).toFixed(2)}` : 'DUPR NR') : ''}
                      </span>
                      {sport === 'pickleball' && p.dupr != null && p.dupr_rel != null && <span className="block text-gray-300 text-[11px]">{t('public.reliability')} {Math.round(Number(p.dupr_rel))}%</span>}
                    </li>
                  ))}
                  {/* Places nobody has taken yet on this court. */}
                  {Array.from({ length: Math.max((b.slots || 0) - b.people.length, 0) }, (_, i) => (
                    <li key={`free-${i}`} aria-label={t('egroups.freeSlot')} className="flex min-h-[6.5rem] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-navy-600 px-2 py-2 text-center text-gray-500">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-navy-500" aria-hidden>+</span>
                      <span className="text-[11px]">{t('egroups.freeSlot')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'results' && (
        <div>
          <div>
            {results.length === 0 ? (
              <p className="text-gray-400 text-sm">{t('elive.noResults')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {results.map((m, i) => {
                  const w = m.team1_score > m.team2_score ? 1 : 2;
                  return (
                    <li key={m.id} className="grid grid-cols-[1.5rem_1fr_auto_1fr] items-center gap-2 rounded-lg bg-navy-900 px-2 py-1.5 text-sm">
                      <span className="text-gray-500 text-xs tabular-nums">{m.is_challenge ? <UiIcon name="swords" className="w-3.5 h-3.5 text-gray-200" /> : i + 1}</span>
                      <span className={`text-right break-words ${w === 1 ? 'text-lime-200 font-semibold' : 'text-gray-300'}`}>{teamNames(m, 1)}</span>
                      <span className="text-white font-bold tabular-nums">{m.team1_score} – {m.team2_score}</span>
                      <span className={`break-words ${w === 2 ? 'text-lime-200 font-semibold' : 'text-gray-300'}`}>{teamNames(m, 2)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

        </div>
      )}
      {tab === 'standings' && (
        <div>
          <div>
            <p className="text-gray-500 text-xs mb-1">{t('elive.standingsHint')}</p>
            {rows.length === 0 ? (
              <p className="text-gray-400 text-sm">{t('estand.none')}</p>
            ) : (
              <>
              <Podium className="rounded-xl border border-navy-700 bg-navy-900/40 pt-3 mb-3" rows={rows.slice(0, 3).map((r) => { const pl = data.players.find((x) => x.id === r.id) || {}; return { key: r.id, full_name: r.name, avatar_uid: pl.avatar_uid, avatar_v: pl.avatar_v, main: `${r.rate}%`, sub: `${r.won}-${r.lost} · ${r.diff > 0 ? `+${r.diff}` : r.diff}` }; })} />
              {rows.length > 3 && (
                <ol className="rounded-xl border border-navy-700 divide-y divide-navy-700">
                  {rows.slice(3).map((r) => (
                    <li key={r.id} className={`flex items-center gap-3 px-3 py-2.5 ${r.id === myId ? 'bg-lime-400/10' : ''}`}>
                      <span className="w-6 text-center text-gray-400 font-bold tabular-nums">{r.rank}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-white text-sm font-semibold break-words">{r.name}</span>
                        <span className="block text-gray-400 text-xs tabular-nums">{t('cpeople.record', { n: r.played, w: r.won, l: r.lost })}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-lime-300 font-bold tabular-nums">{r.rate}%</span>
                        <span className={`block text-xs tabular-nums ${r.diff < 0 ? 'text-red-300' : 'text-gray-400'}`}>{r.diff > 0 ? `+${r.diff}` : r.diff}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              </>
            )}
          </div>

        </div>
      )}
      {tab === 'challenges' && (
          <div className="rounded-xl border border-navy-600 bg-navy-700 p-2.5">
            {challenges.length === 0 ? (
              <p className="text-gray-300 text-sm">{t('elive.noChallenges')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {challenges.map((m) => (
                  <li key={m.id} className="rounded-lg bg-navy-900/80 px-2 py-1.5 text-sm">
                    <span className="text-white">{teamNames(m, 1)}</span>
                    <span className="text-gray-200 font-bold tabular-nums"> {scored(m) ? `${m.team1_score} – ${m.team2_score}` : 'VS'} </span>
                    <span className="text-white">{teamNames(m, 2)}</span>
                    {m.challenge_reward && <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-200"><UiIcon name="gift" className="w-3.5 h-3.5" />{m.challenge_reward}</span>}
                    {!scored(m) && <span className="block text-xs text-gray-400">{t('elive.challengeOpen')}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
      )}
    </section>
  );
}
