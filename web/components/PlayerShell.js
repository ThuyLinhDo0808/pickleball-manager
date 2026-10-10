'use client';
import Link from 'next/link';
import FeedbackButton from '@/components/FeedbackButton';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

// The personal side of the app: the home hub (all clubs and roles), my activity
// (QR, history, form) and my profile. Club management lives in AppShell; a club the
// account only plays in opens its member page (/c/<id>) inside this shell.
const NAV = [
  { href: '/home', key: 'hub.navHome', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10', match: (p) => p === '/home' || p.startsWith('/c/') },
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

export default function PlayerShell({ children, requireAuth = true, sport = 'pickleball' }) {
  const { user, loading, signOut } = useAuth();
  const { t, lang, setLang, setSport } = useI18n();
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
      <header className="sticky top-0 z-30 bg-navy-900/95 backdrop-blur border-b border-navy-700 pt-safe">
        <div className="max-w-4xl mx-auto flex items-center gap-3 px-4 h-14">
          <Link href="/home" className="text-lime-400 font-bold shrink-0">{t('appName')}</Link>
          <nav className="hidden sm:flex gap-1 flex-1 min-w-0">
            {user &&
              NAV.map((n) => (
                <Link key={n.href} href={n.href} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${n.match(pathname) ? 'bg-navy-700 text-lime-400' : 'text-gray-300 hover:text-white'}`}>
                  <Icon d={n.icon} className="w-4 h-4" />
                  {t(n.key)}
                </Link>
              ))}
          </nav>
          <span className="flex-1 sm:hidden" />
          <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1 shrink-0">
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
          <FeedbackButton className="hidden sm:inline text-xs text-gray-400 shrink-0" />
          {user && (
            <button onClick={() => signOut()} className="text-xs text-gray-400 shrink-0">
              {t('nav.signOut')}
            </button>
          )}
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-4 pb-tabbar sm:pb-safe-4">{children}</main>

      {/* Phone tab bar */}
      {user && (
        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-navy-900/95 backdrop-blur border-t border-navy-700 pb-safe">
          <div className="grid grid-cols-4">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] ${n.match(pathname) ? 'text-lime-400' : 'text-gray-400'}`}>
                <Icon d={n.icon} />
                <span>{t(n.key)}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
