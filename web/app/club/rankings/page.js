'use client';
import AppShell from '@/components/AppShell';
import ClubLeaderboard from '@/components/ClubLeaderboard';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';

export default function RankingsPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  return (
    <AppShell>
      <PageHeader icon="🏅" title={t('nav.rankings')} subtitle={club?.name} />
      <SectionTabs group="stats" />
      <ClubLeaderboard statsUrl={club ? `/api/clubs/${club.id}/stats` : null} clubName={club?.name || ''} />
    </AppShell>
  );
}
