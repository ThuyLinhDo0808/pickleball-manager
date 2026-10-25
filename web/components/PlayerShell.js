'use client';
import Link from 'next/link';
import PlayerBell from '@/components/PlayerBell';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import BackButton from '@/components/BackButton';
import LangSelect from '@/components/LangSelect';
import { NAV_ACTIVE } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';

// The personal side of the app: the home hub (all clubs and roles), my activity
// (QR, history, form) and my profile. Club management lives in AppShell; a club the
// account only plays in opens its member page (/c/<id>) inside this shell.
const NAV = [
  { href: '/home', key: 'hub.navHome', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10', match: (p) => p === '/home' || p.startsWith('/c/') },
  { href: '/rankings', key: 'hub.navRankings', icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3', match: (p) => p.startsWith('/rankings') },
  { href: '/discover', key: 'hub.navDiscover', icon: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35', match: (p) => p.startsWith('/discover') },
  { href: '/p', key: 'hub.navActivity', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', match: (p) => p === '/p' },
  { href: '/p/profile', key: 'hub.navProfile', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', match: (p) => p.startsWith('/p/profile') },
];

function Icon({ d, className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// back: false = page has its own way back (or is a step-by-step flow); a string = where to go
// when there is no history. Tab pages (Trang chủ, Tìm CLB, Xếp hạng, Hoạt động, Hồ sơ) have none.
export default function PlayerShell({ children, requireAuth = true, sport = 'pickleball', back }) {
  const { user, loading } = useAuth();
  const { t, setSport } = useI18n();
  // Personal pages speak the sport of the club shown (member page) or the default one;
  // not whichever club was last open on the manager side.
  useEffect(() => setSport(sport), [sport, setSport]);
  const pathname = usePathname() || '';
  const router = useRouter();

  useEffect(() => {
    if (requireAuth && !loading && !user) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [requireAuth, loading, user, router, pathname]);

  if (requireAuth && (loading || !user)) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('common.loading')}</div>;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-navy-900 border-b border-navy-700 pt-safe">
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 h-14">
          <Link href="/home" aria-label={t('appName')} className="min-w-0 flex-1 lg:flex-none flex items-center min-h-[44px]"><BrandLogo markClass="h-7" wordClass="h-4" /></Link>
          <nav className="hidden lg:flex gap-1 flex-1 min-w-0">
            {user &&
              NAV.map((n) => (
                <Link key={n.href} href={n.href} className={`flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap ${n.match(pathname) ? NAV_ACTIVE : 'text-gray-300 hover:text-white hover:bg-navy-800'}`}>
                  <Icon d={n.icon} className="w-4 h-4" />
                  {t(n.key)}
                </Link>
              ))}
          </nav>
          {/* Same language box as the manager and owner shells. */}
          <LangSelect className="shrink-0" />
          {/* Bell last, at the right edge, so its panel opens inside the screen. Sign out is
              on Hồ sơ (/p/profile). */}
          {user && <PlayerBell className="shrink-0" />}
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4 pb-tabbar-lg">
        {back !== false && !NAV.some((n) => n.href === pathname) && <BackButton fallback={typeof back === 'string' ? back : '/home'} />}
        <AnnouncementBanner className="mb-4" />
        {children}
      </main>

      {/* Phone tab bar */}
      {user && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-navy-900 border-t border-navy-700 pb-safe">
          <div className="grid grid-cols-5">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`flex flex-col items-center justify-center gap-0.5 min-h-[4rem] py-1.5 text-xs leading-tight ${n.match(pathname) ? 'text-lime-300' : 'text-gray-400'}`}>
                <Icon d={n.icon} />
                <span className="max-w-full px-0.5 text-center break-words">{t(n.key)}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
