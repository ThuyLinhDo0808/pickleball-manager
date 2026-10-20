'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { useScope } from '@/lib/useScope';

// The pages of one menu group as tabs, so the Host can move between them in one tap.
// Club and community (Social Manager) only: in one-off Xé Vé these pages stand alone.
const GROUPS = {
  activities: [
    { href: '/events', key: 'nav.schedule', icon: '🗓', match: (p) => p === '/events' },
    { href: '/events/create/weekly', key: 'nav.createWeekly', icon: '🔁', match: (p) => p === '/events/create/weekly' },
    { href: '/club/tournaments', key: 'nav.tournaments', icon: '🏆', match: (p) => p.startsWith('/club/tournaments') },
    { href: '/events/create', key: 'nav.createGame', icon: '🏓', match: (p) => p === '/events/create' },
  ],
  stats: [
    { href: '/club/attendance', key: 'nav.memberStats', icon: '📋', match: (p) => p.startsWith('/club/attendance') },
    { href: '/club/rankings', key: 'nav.rankings', icon: '🏅', match: (p) => p.startsWith('/club/rankings') },
    { href: '/club/race', key: 'nav.race', icon: '🏆', match: (p) => p.startsWith('/club/race'), community: true },
    { href: '/club/dupr', key: 'nav.dupr', icon: '📈', match: (p) => p.startsWith('/club/dupr'), sport: 'pickleball' },
    { href: '/club/reviews', key: 'nav.reviews', icon: '⭐', match: (p) => p.startsWith('/club/reviews') },
    { href: '/club/insights', key: 'nav.insights', icon: '🔬', match: (p) => p.startsWith('/club/insights') },
  ],
};

export default function SectionTabs({ group }) {
  const { t } = useI18n();
  const { scoped, community, club } = useScope();
  const pathname = usePathname() || '';
  if (!scoped) return null;
  return (
    // Wraps onto two lines on a phone rather than hiding tabs off the edge of the screen.
    <nav className="mb-5">
      <div className="flex flex-wrap gap-2">
        {GROUPS[group].filter((tab) => (!tab.community || community) && (!tab.sport || (club?.sport || 'pickleball') === tab.sport)).map((tab) => {
          const active = tab.match(pathname);
          // Social Manager: the schedule tab reads like its menu entry ("Lịch xé vé").
          const key = community && tab.key === 'nav.schedule' ? 'nav.kevents' : tab.key;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full border px-3.5 py-2 text-sm whitespace-nowrap transition ${active ? 'border-lime-400 bg-lime-400/15 text-lime-200 font-semibold' : 'border-navy-600 text-gray-200 hover:border-lime-400 hover:text-white'}`}
            >
              <span aria-hidden="true" className="mr-1.5">{tab.icon}</span>
              {t(key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
