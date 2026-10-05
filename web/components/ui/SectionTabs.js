'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';

// The pages of one menu group as tabs, so the Host can move between them in one tap.
// Club workspace only: in Xé Vé these pages stand alone.
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
  ],
};

export default function SectionTabs({ group }) {
  const { t } = useI18n();
  const { workspace } = useWorkspace();
  const pathname = usePathname() || '';
  if (workspace !== 'club') return null;
  return (
    <nav className="-mx-4 px-4 md:mx-0 md:px-0 mb-5 overflow-x-auto border-b border-navy-700">
      <div className="flex gap-1 min-w-max">
        {GROUPS[group].map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm whitespace-nowrap transition ${active ? 'border-lime-400 text-lime-300 font-semibold' : 'border-transparent text-gray-400 hover:text-white hover:border-navy-500'}`}
            >
              <span aria-hidden="true" className="mr-1.5">{tab.icon}</span>
              {t(tab.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
