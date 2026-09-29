'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import CreateClubForm from '@/components/CreateClubForm';

const ICONS = {
  dashboard: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  members: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  rankings: 'M8 21V11M16 21V7M12 21V3M4 21h16',
  fund: 'M3 7h18v12H3zM3 11h18M7 15h3',
  schedule: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  clubs: 'M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z',
  account: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

const NAV = [
  { href: '/dashboard', key: 'nav.dashboard', icon: 'dashboard' },
  { href: '/club/members', key: 'nav.members', icon: 'members' },
  { href: '/club/rankings', key: 'nav.rankings', icon: 'rankings' },
  { href: '/club/fund', key: 'nav.fund', icon: 'fund' },
  { href: '/events', key: 'nav.schedule', icon: 'schedule' },
  { href: '/clubs', key: 'nav.clubs', icon: 'clubs' },
  { href: '/account', key: 'nav.account', icon: 'account' },
];

// Bottom tab bar on phones: the most-used pages; the rest live under "More".
const TABS = ['/dashboard', '/club/members', '/events', '/club/fund'];

// Pages that work without a club; everything else prompts to create one first.
const NO_CLUB_OK = ['/clubs', '/account'];

function Icon({ name, className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function ClubSwitcher({ className = '' }) {
  const { t } = useI18n();
  const { clubs, club, selectClub } = useClubs();
  const router = useRouter();
  if (!clubs.length) return null;
  return (
    <select
      aria-label={t('clubs.switcher')}
      value={club?.id || ''}
      onChange={(e) => (e.target.value === '__new' ? router.push('/clubs') : selectClub(e.target.value))}
      className={`input text-sm truncate ${className}`}
    >
      {clubs.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
      <option value="__new">+ {t('clubs.create')}</option>
    </select>
  );
}

function LangSelect() {
  const { lang, setLang, t } = useI18n();
  return (
    <select aria-label={t('nav.language')} value={lang} onChange={(e) => setLang(e.target.value)} className="input text-sm">
      <option value="vi">Tiếng Việt</option>
      <option value="en">English</option>
    </select>
  );
}

export default function AppShell({ children }) {
  const { user, loading, signOut } = useAuth();
  const { t } = useI18n();
  const { clubs, loading: clubsLoading } = useClubs();
  const pathname = usePathname() || '';
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/sign-in');
  }, [loading, user, router]);

  useEffect(() => setMoreOpen(false), [pathname]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-white">{t('common.loading')}</div>;
  if (!user) return null;

  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`);
  const needsClub = !clubsLoading && clubs.length === 0 && !NO_CLUB_OK.some(isActive);
  const moreItems = NAV.filter((n) => !TABS.includes(n.href));
  const moreActive = moreItems.some((n) => isActive(n.href));

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-navy-900 border-r border-navy-700 p-4 flex-col gap-1 sticky top-0 h-screen overflow-y-auto">
        <div className="text-lime-400 font-bold text-lg mb-3 px-2">{t('appName')}</div>
        <div className="mb-3 px-1">
          <ClubSwitcher />
        </div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
              isActive(item.href) ? 'bg-navy-700 text-lime-400' : 'text-gray-300 hover:bg-navy-800'
            }`}
          >
            <Icon name={item.icon} className="w-4 h-4" />
            {t(item.key)}
          </Link>
        ))}
        <div className="mt-auto flex flex-col gap-2 pt-4">
          <LangSelect />
          <button onClick={() => signOut()} className="btn-secondary text-sm">
            {t('nav.signOut')}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-navy-900/95 backdrop-blur border-b border-navy-700 pt-safe">
        <div className="flex items-center gap-3 px-4 h-14">
          <span className="text-lime-400 font-bold shrink-0">PB</span>
          <div className="flex-1 min-w-0">
            {clubs.length > 0 ? (
              <ClubSwitcher className="py-1.5" />
            ) : (
              <span className="text-white text-sm font-semibold">{t('appName')}</span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-w-0 p-4 md:p-6 pb-tabbar">
        {needsClub ? (
          <div className="max-w-md mx-auto card mt-4">
            <h1 className="text-white text-xl font-bold mb-1">{t('clubs.createFirst')}</h1>
            <p className="text-gray-400 text-sm mb-4">{t('clubs.createFirstHint')}</p>
            <CreateClubForm autoFocus />
          </div>
        ) : (
          children
        )}
      </main>

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button aria-label={t('common.cancel')} className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-navy-900 border-t border-navy-700 rounded-t-2xl p-4 pb-safe-4 flex flex-col gap-1">
            <div className="mx-auto w-10 h-1 rounded-full bg-navy-600 mb-3" />
            {moreItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg ${
                  isActive(item.href) ? 'bg-navy-700 text-lime-400' : 'text-gray-200'
                }`}
              >
                <Icon name={item.icon} />
                {t(item.key)}
              </Link>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-3 mt-2 border-t border-navy-700">
              <LangSelect />
              <button onClick={() => signOut()} className="btn-secondary text-sm">
                {t('nav.signOut')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-navy-900/95 backdrop-blur border-t border-navy-700 pb-safe">
        <div className="grid grid-cols-5">
          {TABS.map((href) => {
            const item = NAV.find((n) => n.href === href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] ${
                  isActive(href) ? 'text-lime-400' : 'text-gray-400'
                }`}
              >
                <Icon name={item.icon} />
                <span className="truncate max-w-full px-1">{t(item.key)}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] ${
              moreOpen || moreActive ? 'text-lime-400' : 'text-gray-400'
            }`}
          >
            <Icon name="more" />
            <span>{t('nav.more')}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
