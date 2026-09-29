'use client';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const STATUS_STYLE = {
  groups: 'bg-navy-700 text-gray-200',
  knockout: 'bg-yellow-500/20 text-yellow-300',
  completed: 'bg-lime-400 text-navy-950',
};

export default function TournamentsPage() {
  const { t, lang } = useI18n();
  const { club } = useDefaultClub();
  const { data: list, loading } = useLoad(
    () => (club ? api.get(`/api/tournaments?club_id=${club.id}`) : Promise.resolve([])),
    [club?.id]
  );

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-white text-2xl font-bold">{t('tournaments.title')}</h1>
        <Link href="/club/tournaments/new" className="btn-primary text-sm">+ {t('tournaments.create')}</Link>
      </div>
      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && (list || []).length === 0 && <p className="text-gray-400 text-sm">{t('tournaments.none')}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(list || []).map((x) => (
          <Link key={x.id} href={`/club/tournaments/${x.id}`} className="card hover:border-lime-400 transition">
            <div className="flex items-start justify-between gap-2">
              <span className="text-white font-semibold">🏆 {x.name}</span>
              <span className={`text-xs rounded-full px-2 py-0.5 font-semibold shrink-0 ${STATUS_STYLE[x.status]}`}>
                {t(`tournaments.status_${x.status}`)}
              </span>
            </div>
            <div className="text-gray-400 text-sm mt-1">
              {t(`matches.${x.format}`)} · {t('tournaments.teamsN', { n: x.team_count })}
              {x.group_count > 0 ? ` · ${x.group_count} ${t('tournaments.groupCount').toLowerCase()}` : ''}
              {' · '}
              {new Date(x.created_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB')}
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
