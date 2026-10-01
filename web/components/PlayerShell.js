'use client';
import RoleSwitch, { rememberMode } from '@/components/RoleSwitch';
import Link from 'next/link';
import FeedbackButton from '@/components/FeedbackButton';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

const NAV = [
  { href: '/p', key: 'player.home' },
  { href: '/p/profile', key: 'player.profile' },
];

// Layout for the player portal: no Host menus, just the player's own pages.
export default function PlayerShell({ children, requireAuth = true }) {
  const { user, loading, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const pathname = usePathname() || '';
  const router = useRouter();

  // Opening the player portal makes it the mode the app reopens in.
  useEffect(() => {
    if (user) rememberMode('player');
  }, [user]);

  useEffect(() => {
    if (requireAuth && !loading && !user) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [requireAuth, loading, user, router, pathname]);

  if (requireAuth && (loading || !user)) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('common.loading')}</div>;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-navy-900/95 backdrop-blur border-b border-navy-700 pt-safe">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 h-14">
          <Link href="/p" className="text-lime-400 font-bold shrink-0">PB</Link>
          <nav className="flex gap-1 flex-1 min-w-0">
            {user &&
              NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-3 py-1.5 rounded-lg text-sm ${pathname === n.href ? 'bg-navy-700 text-lime-400' : 'text-gray-300'}`}
                >
                  {t(n.key)}
                </Link>
              ))}
          </nav>
          {user && (
            <div className="hidden sm:block w-56 shrink-0">
              <RoleSwitch current="player" />
            </div>
          )}
          <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1 shrink-0">
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
          <FeedbackButton className="text-xs text-gray-400 shrink-0" />
          {user && (
            <button onClick={() => signOut()} className="text-xs text-gray-400 shrink-0">
              {t('nav.signOut')}
            </button>
          )}
        </div>
      </header>
      {user && (
        <div className="sm:hidden max-w-3xl mx-auto px-4 pt-3">
          <RoleSwitch current="player" />
        </div>
      )}
      <main className="max-w-3xl mx-auto p-4 pb-safe-4">{children}</main>
    </div>
  );
}
