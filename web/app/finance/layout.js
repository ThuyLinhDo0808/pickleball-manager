'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';

// Everything money-related lives under /finance, as tabs of one section.
const TABS = {
  club: [
    { href: '/finance', key: 'fin.overview' },
    { href: '/finance/ledger', key: 'fin.ledger' },
    { href: '/finance/plans', key: 'fin.plans' },
    { href: '/finance/inventory', key: 'fin.inventory' },
  ],
  xeve: [
    { href: '/finance', key: 'fin.overview' },
    { href: '/finance/ledger', key: 'fin.ledger' },
  ],
};

export default function FinanceLayout({ children }) {
  const { t } = useI18n();
  const { workspace } = useWorkspace();
  const pathname = usePathname() || '';
  const tabs = TABS[workspace] || TABS.club;

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-3">{t('fin.title')}</h1>
      <nav className="-mx-4 px-4 md:mx-0 md:px-0 mb-5 overflow-x-auto">
        <div className="inline-flex gap-1 bg-navy-900 rounded-lg p-1 min-w-max">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-4 py-1.5 text-sm whitespace-nowrap ${active ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400 hover:text-white'}`}
              >
                {t(tab.key)}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </AppShell>
  );
}
