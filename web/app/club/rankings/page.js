'use client';
import AppShell from '@/components/AppShell';
import ClubLeaderboard from '@/components/ClubLeaderboard';
import ChallengeRankings from '@/components/ChallengeRankings';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';

export default function RankingsPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  return (
    <AppShell>
      <PageHeader icon="medal" title={t('nav.rankings')} subtitle={club?.name} />
      <SectionTabs group="stats" />
      <ClubLeaderboard statsUrl={club ? `/api/clubs/${club.id}/stats` : null} clubName={club?.name || ''} settingsUrl={club && (!club.role || ['owner', 'co_admin'].includes(club.role)) ? `/api/clubs/${club.id}/rank-settings` : null} />
      {/* Communities: who wins the challenge matches (Thách thức) of the kèo. */}
      {club?.kind === 'community' && <ChallengeRankings clubId={club.id} />}
    </AppShell>
  );
}
