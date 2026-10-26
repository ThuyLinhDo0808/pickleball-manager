'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { useScope } from '@/lib/useScope';
import { SHOW_TOURNAMENTS } from '@/lib/hidden';
import UiIcon from '@/components/ui/UiIcon';

// The pages of one menu group as tabs, so the Host can move between them in one tap.
// Club and community (Social Manager) only: in one-off Xé Vé these pages stand alone.
const GROUPS = {
  activities: [
    { href: '/events', key: 'nav.schedule', icon: 'calendar', match: (p) => p === '/events' },
    { href: '/events/create/weekly', key: 'nav.createWeekly', icon: 'repeat', match: (p) => p === '/events/create/weekly' },
    { href: '/club/tournaments', key: 'nav.tournaments', icon: 'trophy', match: (p) => p.startsWith('/club/tournaments') , hidden: !SHOW_TOURNAMENTS },
    { href: '/events/create', key: 'nav.createGame', icon: 'paddle', match: (p) => p === '/events/create' },
  ],
  stats: [
    { href: '/club/attendance', key: 'nav.memberStats', icon: 'members', match: (p) => p.startsWith('/club/attendance') },
    { href: '/club/rankings', key: 'nav.rankings', icon: 'medal', match: (p) => p.startsWith('/club/rankings') },
    { href: '/club/race', key: 'nav.race', icon: 'trophy', match: (p) => p.startsWith('/club/race'), community: true },
    { href: '/club/dupr', key: 'nav.dupr', icon: 'chart', match: (p) => p.startsWith('/club/dupr'), sport: 'pickleball' },
    { href: '/club/reviews', key: 'nav.reviews', icon: 'star', match: (p) => p.startsWith('/club/reviews') },
    { href: '/club/insights', key: 'nav.insights', icon: 'chart', match: (p) => p.startsWith('/club/insights') },
  ],
};

// Social Manager: Thống kê is business numbers; Bảng xếp hạng stands on its own.
const COMMUNITY_GROUPS = {
  stats: [
    { href: '/club/business', key: 'nav.bizPlayers', icon: 'chart', match: (p) => p === '/club/business' },
    { href: '/club/race', key: 'nav.race', icon: 'trophy', match: (p) => p.startsWith('/club/race') },
    { href: '/club/dupr', key: 'nav.dupr', icon: 'chart', match: (p) => p.startsWith('/club/dupr'), sport: 'pickleball' },
    { href: '/club/reviews', key: 'nav.reviews', icon: 'star', match: (p) => p.startsWith('/club/reviews') },
  ],
  rankings: [
    { href: '/club/rankings', key: 'nav.rankings', icon: 'medal', match: (p) => p.startsWith('/club/rankings') },
  ],
};

export default function SectionTabs({ group }) {
  const { t } = useI18n();
  const { scoped, community, club } = useScope();
  const pathname = usePathname() || '';
  if (!scoped) return null;
  const rankingsPage = pathname.startsWith('/club/rankings') || pathname.startsWith('/leaderboard');
  const tabsOf = community ? COMMUNITY_GROUPS[rankingsPage ? 'rankings' : group] || GROUPS[group] : GROUPS[group];
  const shown = tabsOf.filter((tab) => !tab.hidden && (!tab.community || community) && (!tab.sport || (club?.sport || 'pickleball') === tab.sport));
  if (shown.length < 2) return null; // one page alone needs no tabs
  return (
    // Phone: one row of equal cells (icon over the word), like a segmented control; up to 3
    // tabs per row, more wrap to a second row. Wider screens: pills.
    <nav className="mb-4 sm:mb-5">
      <div className={`grid gap-1 rounded-xl border border-navy-700 bg-navy-900 p-1 sm:flex sm:flex-wrap sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 ${shown.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {shown.map((tab) => {
          const active = tab.match(pathname);
          // Social Manager: the schedule tab reads like its menu entry ("Lịch xé vé").
          const key = community && tab.key === 'nav.schedule' ? 'nav.kevents' : tab.key;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[3.5rem] flex-col items-center justify-start gap-0.5 rounded-lg px-1 pt-1.5 pb-1 text-center text-xs leading-tight transition-colors active:bg-navy-700 sm:min-h-0 sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:border sm:px-3.5 sm:py-2 sm:text-sm sm:whitespace-nowrap ${active ? 'bg-lime-400 text-navy-950 font-semibold sm:border-lime-400 sm:bg-lime-400/15 sm:text-lime-200' : 'text-gray-300 sm:border-navy-600 sm:text-gray-200 hover:text-white sm:hover:border-lime-400'}`}
            >
              <UiIcon name={tab.icon} className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-1.5" />
              <span className="h-8 sm:h-auto flex items-start sm:items-center justify-center">{t(key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
