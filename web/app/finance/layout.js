'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import UiIcon from '@/components/ui/UiIcon';

// Everything money-related lives under /finance, as tabs of one section.
const TABS = {
  club: [
    { href: '/finance', key: 'fin.overview', icon: 'chart' },
    { href: '/finance/ledger', key: 'fin.ledger', icon: 'list' },
    { href: '/finance/plans', key: 'fin.plans', icon: 'ticket' },
    { href: '/finance/inventory', key: 'fin.inventory', icon: 'box' },
  ],
  xeve: [
    { href: '/finance', key: 'fin.overview', icon: 'chart' },
    { href: '/finance/ledger', key: 'fin.ledger', icon: 'list' },
    { href: '/finance/inventory', key: 'fin.inventory', icon: 'box' },
  ],
};

export default function FinanceLayout({ children }) {
  const { t } = useI18n();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const pathname = usePathname() || '';
  // Finance staff see the money tabs only (no ball store).
  // A Social Manager community has the club's tabs (plans too); one-off kèo the short list.
  const space = workspace === 'xeve' && !club ? 'xeve' : 'club';
  const tabs = TABS[space].filter((tab) => !(space === 'club' && club?.role === 'finance' && tab.href === '/finance/inventory'));
  const where = space === 'xeve' ? t('finX.scopeXeve') : club?.name || '';

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 rounded-xl bg-lime-400/15 text-lime-300 flex items-center justify-center text-xl" aria-hidden="true"><UiIcon name="wallet" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></span>
          <div>
            <h1 className="text-white text-2xl font-bold leading-tight">{t('fin.title')}</h1>
            {where && <p className="text-gray-400 text-sm">{where}</p>}
          </div>
        </div>
      </div>
      <nav className="mb-6">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 rounded-full border px-3.5 py-2 text-sm whitespace-nowrap transition ${active ? 'border-lime-400 bg-lime-400/15 text-lime-200 font-semibold' : 'border-navy-600 text-gray-200 hover:border-lime-400 hover:text-white'}`}
              >
                <UiIcon name={tab.icon} className="w-4 h-4" />
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
