'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import Segmented from '@/components/ui/Segmented';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, todayYmd } from '@/lib/dates';
import { formatVnd } from '@/lib/format';
import Podium from '@/components/Podium';

const STATUS_STYLE = {
  groups: 'bg-navy-700 text-gray-200',
  knockout: 'bg-yellow-500/20 text-yellow-300',
  completed: 'bg-lime-400 text-navy-950',
};

// The club's tournaments: running ones first, then finished ones with their podium.
export default function TournamentsPage() {
  const { t, lang, sport } = useI18n();
  const { club } = useDefaultClub();
  const [filter, setFilter] = useState('all');
  const { data: list, loading } = useLoad(
    () => (club ? api.get(`/api/tournaments?club_id=${club.id}`) : Promise.resolve([])),
    [club?.id]
  );
  const all = list || [];
  const running = all.filter((x) => x.status !== 'completed');
  const done = all.filter((x) => x.status === 'completed');
  const today = todayYmd();
  const shown = (filter === 'running' ? running : filter === 'completed' ? done : all)
    .slice()
    .sort((a, b) => (a.status === 'completed') - (b.status === 'completed') || (b.event_date || b.created_at).localeCompare(a.event_date || a.created_at));
  const players = all.reduce((n, x) => n + (x.team_count || 0), 0);

  return (
    <AppShell>
      <PageHeader
        icon="🏆"
        title={t('tournaments.title')}
        subtitle={club?.name}
        actions={<Link href="/club/tournaments/new" className="btn-primary text-sm">＋ {t('nav.createTournament')}</Link>}
      />
      <SectionTabs group="activities" />

      <KpiRow cols={4}>
        <StatTile icon="🏆" label={t('tourx.total')} value={all.length} />
        <StatTile icon="🔥" label={t('tourx.running')} value={running.length} tone="text-amber-300" sub={t('tourx.upcomingN', { n: running.filter((x) => (x.event_date || '') >= today).length })} />
        <StatTile icon="🥇" label={t('tourx.completed')} value={done.length} tone="text-lime-300" />
        <StatTile icon="👥" label={t('tourx.teams')} value={players} tone="text-sky-300" sub={t('tourx.teamsSub')} />
      </KpiRow>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Segmented items={['all', 'running', 'completed']} value={filter} onChange={setFilter} label={(k) => t(`tourx.f_${k}`)} />
      </div>

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && all.length === 0 && (
        <div className="card text-center py-10">
          <div className="text-5xl mb-2" aria-hidden="true">🏆</div>
          <p className="text-gray-300 mb-4">{t('tournaments.none')}</p>
          <Link href="/club/tournaments/new" className="btn-primary text-sm">＋ {t('nav.createTournament')}</Link>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {shown.map((x) => (
          <Link key={x.id} href={`/club/tournaments/${x.id}`} className="card !p-0 overflow-hidden hover:border-lime-400 transition flex flex-col">
            <div className={`h-1.5 ${x.status === 'completed' ? 'bg-lime-400' : x.status === 'knockout' ? 'bg-yellow-400' : 'bg-sky-400'}`} />
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <span className="text-white font-semibold leading-snug">{x.kind === 'team' ? '👥' : sport === 'badminton' ? '🏸' : '🏆'} {x.name}</span>
                <span className={`text-xs rounded-full px-2 py-0.5 font-semibold shrink-0 ${STATUS_STYLE[x.status]}`}>
                  {x.kind === 'team' && x.status === 'groups' ? t('league.inProgress') : t(`tournaments.status_${x.status}`)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 text-xs">
                <span className="rounded-full bg-navy-900 border border-navy-700 px-2 py-0.5 text-gray-300">{x.kind === 'team' ? t('tournaments.kind_team') : t('tournaments.kind_pairs')}</span>
                <span className="rounded-full bg-navy-900 border border-navy-700 px-2 py-0.5 text-gray-300">{t('tournaments.teamsN', { n: x.team_count })}</span>
                {x.kind !== 'team' && x.group_count > 0 && (
                  <span className="rounded-full bg-navy-900 border border-navy-700 px-2 py-0.5 text-gray-300">{x.group_count} {t('tournaments.groupCount').toLowerCase()}</span>
                )}
                {Number(x.entry_fee) > 0 && <span className="rounded-full bg-lime-400/10 border border-lime-400/30 px-2 py-0.5 text-lime-200">💰 {formatVnd(x.entry_fee)}</span>}
              </div>
              <div className="text-gray-400 text-sm mt-2">
                📅{' '}
                {x.event_date
                  ? formatDay(x.event_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
                  : new Date(x.created_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB')}
                {x.location ? ` · 📍 ${x.location}` : ''}
              </div>
              <div className="mt-auto pt-2">
                <Podium podium={x.podium} compact />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
