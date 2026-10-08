'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useDefaultClub } from '@/lib/useDefaultClub';

// Everything money-related lives under /finance, as tabs of one section.
const TABS = {
  club: [
    { href: '/finance', key: 'fin.overview', icon: '📊' },
    { href: '/finance/ledger', key: 'fin.ledger', icon: '📒' },
    { href: '/finance/plans', key: 'fin.plans', icon: '🎫' },
    { href: '/finance/inventory', key: 'fin.inventory', icon: '📦' },
  ],
  xeve: [
    { href: '/finance', key: 'fin.overview', icon: '📊' },
    { href: '/finance/ledger', key: 'fin.ledger', icon: '📒' },
    { href: '/finance/inventory', key: 'fin.inventory', icon: '📦' },
  ],
};

export default function FinanceLayout({ children }) {
  const { t } = useI18n();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const pathname = usePathname() || '';
  // Finance staff see the money tabs only (no ball store).
  const tabs = (TABS[workspace] || TABS.club).filter((tab) => !(workspace === 'club' && club?.role === 'finance' && tab.href === '/finance/inventory'));
  const where = workspace === 'xeve' ? t('finX.scopeXeve') : club?.name || '';

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 rounded-xl bg-lime-400/15 text-lime-300 flex items-center justify-center text-xl" aria-hidden="true">💼</span>
          <div>
            <h1 className="text-white text-2xl font-bold leading-tight">{t('fin.title')}</h1>
            {where && <p className="text-gray-400 text-sm">{where}</p>}
          </div>
        </div>
      </div>
      <nav className="-mx-4 px-4 md:mx-0 md:px-0 mb-6 overflow-x-auto border-b border-navy-700">
        <div className="flex gap-1 min-w-max">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
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
      {children}
    </AppShell>
  );
}
