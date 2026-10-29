'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import PlayerShell from '@/components/PlayerShell';
import PageHeader from '@/components/ui/PageHeader';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import EmptyState from '@/components/ui/EmptyState';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import MyBookings from '@/components/MyBookings';
import MyCoachClasses, { AssistEntry } from '@/components/coach/MyCoachClasses';
import MyHistory from '@/components/player/MyHistory';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';

const fmtDay = (ymd, lang) => (ymd ? localDate(new Date(`${ymd}T00:00:00`), lang === 'vi' ? 'vi-VN' : 'en-GB') : '—');
const monthKey = (ymd) => String(ymd || '').slice(0, 7);

// Hoạt động: the matches I played (filters like DUPR's: result, order, dates, event name,
// and where — a club, a community or a coach), my sign-ups and coach sessions, and what is
// coming up (bookings, classes).
export default function ActivityPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(() => (user ? api.get('/api/player/activity') : Promise.resolve(null)), [user?.id]);
  const { data: me, reload: reloadMe } = useLoad(() => (user ? api.get('/api/player/me') : Promise.resolve(null)), [user?.id]);
  const [tab, setTab] = useState('matches');
  const [where, setWhere] = useState(''); // '' | 'club:<id>' | 'coach:<id>' | 'kind:club' | 'kind:community' | 'kind:coach'
  const [result, setResult] = useState('');
  const [order, setOrder] = useState('new');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [flash, setFlash] = useState('');

  const matches = data?.matches || [];
  const coach = data?.coach || [];
  const history = me?.history || [];
  // Places to filter by: every club / community and coach seen in my matches, sign-ups, sessions.
  const places = useMemo(() => {
    const m = new Map();
    for (const x of [...matches, ...history]) if (x.club_id) m.set(`club:${x.club_id}`, { key: `club:${x.club_id}`, name: x.club_name || '—', kind: x.club_kind === 'community' ? 'community' : 'club' });
    for (const x of coach) if (x.coach_id) m.set(`coach:${x.coach_id}`, { key: `coach:${x.coach_id}`, name: x.coach_name || '—', kind: 'coach' });
    return [...m.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'vi'));
  }, [matches, history, coach]);
  const inPlace = (x, isCoach = false) => {
    if (!where) return true;
    const [k, v] = where.split(':');
    if (k === 'kind') return v === 'coach' ? isCoach : !isCoach && (x.club_kind === 'community' ? 'community' : 'club') === v;
    if (k === 'coach') return isCoach && x.coach_id === v;
    return !isCoach && x.club_id === v;
  };
  const inDates = (d) => (!from || d >= from) && (!to || d <= to);
  const text = q.trim().toLowerCase();
  const hasText = (s) => !text || String(s || '').toLowerCase().includes(text);
  const sortFn = (a, b) => (order === 'new' ? String(b.date || b.event_date).localeCompare(String(a.date || a.event_date)) : String(a.date || a.event_date).localeCompare(String(b.date || b.event_date)));

  const shownMatches = matches.filter((m) => inPlace(m) && inDates(m.date) && (!result || m.result === result) && hasText(m.title || m.club_name)).sort(sortFn);
  const shownHistory = history.filter((h) => inPlace(h) && inDates(h.event_date) && hasText(h.title)).sort(sortFn);
  const shownCoach = coach.filter((c) => inPlace(c, true) && inDates(c.date) && hasText(c.title || c.coach_name)).sort(sortFn);
  const wins = shownMatches.filter((m) => m.result === 'win').length;
  const filtered = !!(where || result || from || to || text);
  const clear = () => {
    setWhere('');
    setResult('');
    setFrom('');
    setTo('');
    setQ('');
  };
  // Group the matches by month like DUPR's list.
  const months = [];
  for (const m of shownMatches) {
    const k = monthKey(m.date);
    if (!months.length || months[months.length - 1].key !== k) months.push({ key: k, rows: [] });
    months[months.length - 1].rows.push(m);
  }
  const monthLabel = (k) => (k ? localDate(new Date(`${k}-01T00:00:00`), lang === 'vi' ? 'vi-VN' : 'en-GB', { month: 'long', year: 'numeric' }) : '—');
  const names = (list) => list.map((p) => p.name).join(' & ') || '—';

  return (
    <PlayerShell>
      <PageHeader title={t('hub.navActivity')} subtitle={t('pp2.activityLead')} />
      {flash && (
        <div className="card mb-4 border-lime-400/50 text-lime-300 text-sm flex items-center justify-between gap-3" role="status">
          <span>{flash}</span>
          <button type="button" className="text-gray-400 h-11 w-11 text-lg leading-none" aria-label={t('common.close')} onClick={() => setFlash('')}>×</button>
        </div>
      )}
      <MyBookings signedIn />
      <AssistEntry />
      <div id="my-coach"><MyCoachClasses /></div>

      <UnderlineTabs
        tabs={[
          { key: 'matches', label: `${t('pp2.tabMatches')} (${shownMatches.length})` },
          { key: 'sessions', label: `${t('pp2.tabSessions')} (${shownHistory.length + shownCoach.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* Filters in one row above the list (wrap on a phone). */}
      <div className="card !p-3 my-3 grid gap-2 grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_repeat(2,minmax(0,1fr))_minmax(0,1.6fr)_auto] items-end">
        <label className="col-span-2 lg:col-span-1 text-xs text-gray-400">
          {t('pp2.where')}
          <select className="input mt-0.5" value={where} onChange={(e) => setWhere(e.target.value)}>
            <option value="">{t('pp2.whereAll')}</option>
            <option value="kind:club">{t('pp2.allClubs')}</option>
            <option value="kind:community">{t('pp2.allCommunities')}</option>
            <option value="kind:coach">{t('pp2.allCoaches')}</option>
            {places.map((p) => <option key={p.key} value={p.key}>{`${t(`pp2.k_${p.kind}`)} · ${p.name}`}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-400">
          {t('pp2.result')}
          <select className="input mt-0.5" value={result} onChange={(e) => setResult(e.target.value)} disabled={tab !== 'matches'}>
            <option value="">{t('pp2.any')}</option>
            <option value="win">{t('pp2.win')}</option>
            <option value="loss">{t('pp2.loss')}</option>
          </select>
        </label>
        <label className="text-xs text-gray-400">
          {t('pp2.order')}
          <select className="input mt-0.5" value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="new">{t('pp2.newest')}</option>
            <option value="old">{t('pp2.oldest')}</option>
          </select>
        </label>
        <label className="text-xs text-gray-400">
          {t('pp2.from')}
          <input type="date" className="input mt-0.5" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-gray-400">
          {t('pp2.to')}
          <input type="date" className="input mt-0.5" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="col-span-2 lg:col-span-1 text-xs text-gray-400">
          {t('pp2.search')}
          <input type="search" className="input mt-0.5" placeholder={t('pp2.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button type="button" className="col-span-2 lg:col-span-1 text-sm text-gray-300 hover:text-white underline min-h-[44px] px-2 disabled:opacity-40" disabled={!filtered} onClick={clear}>{t('pp2.clear')}</button>
      </div>

      {loading && !data && <LoadingBlock rows={4} className="card" />}
      {error && <ErrorBlock message={error.message} onRetry={reload} />}

      {data && tab === 'matches' && (
        <>
          {shownMatches.length > 0 && (
            <p className="text-gray-400 text-sm mb-2 tabular-nums">{t('pp2.summary', { n: shownMatches.length, w: wins, l: shownMatches.length - wins, pct: Math.round((100 * wins) / shownMatches.length) })}</p>
          )}
          {!shownMatches.length && (
            <EmptyState title={filtered ? t('pp2.noMatchFilter') : t('pp2.noMatches')} action={filtered ? <button type="button" className="btn-secondary" onClick={clear}>{t('pp2.clear')}</button> : <Link href="/discover" className="btn-primary">{t('pp2.findGame')}</Link>}>
              {filtered ? null : t('pp2.noMatchesHint')}
            </EmptyState>
          )}
          {months.map((g) => (
            <section key={g.key} className="mb-4">
              <h2 className="text-white font-semibold mb-2 capitalize">{monthLabel(g.key)}</h2>
              <div className="grid gap-2 lg:grid-cols-2">
                {g.rows.map((m) => (
                  <article key={`${m.kind}:${m.id}`} className="card !p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-[11px] rounded-full px-2 py-0.5 ${m.result === 'win' ? 'bg-lime-400/15 text-lime-300' : 'bg-red-400/15 text-red-200'}`}>{t(`pp2.${m.result}`)}</span>
                      <span className="text-gray-400 text-xs tabular-nums">{fmtDay(m.date, lang)}</span>
                    </div>
                    <div className="text-white font-semibold mt-1 break-words">{m.title || t('pp2.clubMatch')}</div>
                    <div className="text-gray-400 text-xs break-words">{[m.club_name, m.location].filter(Boolean).join(' · ') || '—'}</div>
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
                      <span className={`break-words ${m.result === 'win' ? 'text-white font-medium' : 'text-gray-300'}`}>{names(m.mine)}</span>
                      <span className="tabular-nums text-right text-white">{m.games.map((g) => g[0]).join(' · ') || '—'}</span>
                      <span className={`break-words ${m.result === 'loss' ? 'text-white font-medium' : 'text-gray-300'}`}>{names(m.them)}</span>
                      <span className="tabular-nums text-right text-gray-300">{m.games.map((g) => g[1]).join(' · ') || '—'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {data && tab === 'sessions' && (
        <div className="grid gap-4">
          {shownHistory.length > 0 || !filtered ? <MyHistory history={shownHistory} onChanged={() => { reloadMe(); reload(); }} onFlash={setFlash} /> : null}
          {shownCoach.length > 0 && (
            <section className="card">
              <h2 className="text-white font-semibold mb-2">{t('pp2.coachSessions')}</h2>
              <ul className="divide-y divide-navy-700">
                {shownCoach.map((c, i) => (
                  <li key={`${c.date}${c.start_time}${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block text-white break-words">{c.title || '—'}</span>
                      <span className="block text-gray-400 text-xs tabular-nums">{fmtDay(c.date, lang)}{c.start_time ? ` · ${String(c.start_time).slice(0, 5)}` : ''}{c.coach_name ? ` · ${c.coach_name}` : ''}</span>
                    </span>
                    <span className={`text-xs shrink-0 ${c.status === 'present' ? 'text-lime-400' : c.status === 'absent' ? 'text-red-300' : 'text-gray-400'}`}>{t(`pp2.att_${c.status}`)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {filtered && !shownHistory.length && !shownCoach.length && <EmptyState title={t('pp2.noMatchFilter')} action={<button type="button" className="btn-secondary" onClick={clear}>{t('pp2.clear')}</button>} />}
        </div>
      )}
    </PlayerShell>
  );
}
