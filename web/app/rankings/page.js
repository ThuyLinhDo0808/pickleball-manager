'use client';
import PlayerShell from '@/components/PlayerShell';
import HomeRankings from '@/components/HomeRankings';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// "Xếp hạng" (player menu): this month's rankings — xé vé across the web, and each club /
// community I play in. Moved off the home page so it has a page of its own.
export default function PlayerRankingsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, loading } = useLoad(() => (user ? api.get('/api/player/home') : Promise.resolve(null)), [user?.id]);
  return (
    <PlayerShell>
      <h1 className="text-white text-2xl font-bold mb-1">🏆 {t('hub.navRankings')}</h1>
      <p className="text-gray-400 text-sm mb-4">{t('hub.rankingsLead')}</p>
      {loading && !data ? <p className="text-gray-400">{t('common.loading')}</p> : <HomeRankings clubs={data?.member_clubs || []} showTitle={false} />}
    </PlayerShell>
  );
}
