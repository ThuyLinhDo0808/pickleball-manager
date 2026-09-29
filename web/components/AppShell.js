'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

const NAV = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/club/members', key: 'nav.members' },
  { href: '/club/rankings', key: 'nav.rankings' },
  { href: '/club/fund', key: 'nav.fund' },
  { href: '/events', key: 'nav.schedule' },
  { href: '/account', key: 'nav.account' },
];

export default function AppShell({ children }) {
  const { user, loading, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/sign-in');
  }, [loading, user, router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-white">{t('common.loading')}</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-navy-900 border-r border-navy-700 p-4 flex flex-col gap-1">
        <div className="text-lime-400 font-bold text-lg mb-4 px-2">{t('appName')}</div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded-lg text-sm ${
              pathname?.startsWith(item.href) ? 'bg-navy-700 text-lime-400' : 'text-gray-300 hover:bg-navy-800'
            }`}
          >
            {t(item.key)}
          </Link>
        ))}
        <div className="mt-auto flex flex-col gap-2 pt-4">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="input text-xs"
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
          <button onClick={() => signOut()} className="btn-secondary text-sm">
            {t('nav.signOut')}
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
