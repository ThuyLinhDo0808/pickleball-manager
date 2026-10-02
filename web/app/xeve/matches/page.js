'use client';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import MatchList from '@/components/MatchList';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { exportMatchesJpg } from '@/lib/matchImage';

// Xé Vé: every match of the host's own games, grouped by game. New matches are entered
// on the game's page (its players are the sign-ups).
export default function XeveMatchesPage() {
  const { t, lang } = useI18n();
  const { data, loading, reload } = useLoad(() => api.get('/api/matches?scope=xeve&limit=500'), []);
  const groups = [];
  const byEvent = new Map();
  for (const m of data || []) {
    const e = m.events;
    if (!byEvent.has(e.id)) {
      byEvent.set(e.id, { event: e, matches: [] });
      groups.push(byEvent.get(e.id));
    }
    byEvent.get(e.id).matches.push(m);
  }
  groups.sort((a, b) => String(b.event.event_date).localeCompare(String(a.event.event_date)));

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-1">{t('matches.title')}</h1>
      <p className="text-gray-400 text-sm mb-4">{t('matches.xeveHint')}</p>
      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && groups.length === 0 && <p className="card text-gray-400 text-sm">{t('matches.xeveNone')}</p>}
      <div className="flex flex-col gap-6">
        {groups.map(({ event, matches }) => (
          <section key={event.id}>
            <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
              <div className="min-w-0">
                <Link href={`/events/${event.id}`} className="text-white font-semibold hover:text-lime-400">{event.title}</Link>
                <p className="text-gray-400 text-xs">
                  <span className="capitalize">{formatDay(event.event_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  {event.start_time && ` · ${hhmm(event.start_time)}`}
                  {event.location && ` · ${event.location}`}
                  {` · ${t('matches.countN', { n: matches.length })}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary text-sm" onClick={() => exportMatchesJpg({ event, matches, t, lang })}>🖼 {t('matches.exportJpg')}</button>
                <Link href={`/events/${event.id}`} className="btn-secondary text-sm">+ {t('matches.add')}</Link>
              </div>
            </div>
            <MatchList matches={matches} onChanged={reload} sport="pickleball" />
          </section>
        ))}
      </div>
    </AppShell>
  );
}
