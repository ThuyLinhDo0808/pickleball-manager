'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const TABS = [
  ['/owner', 'owner.tabOverview', '📊'],
  ['/owner/hosts', 'owner.tabHosts', '👥'],
  ['/owner/payments', 'owner.tabPayments', '💳'],
  ['/owner/activity', 'owner.tabActivity', '🏓'],
  ['/owner/feedback', 'owner.tabFeedback', '💬'],
  ['/owner/announcements', 'owner.tabAnnouncements', '📣'],
  ['/owner/system', 'owner.tabSystem', '🩺'],
  ['/owner/audit', 'owner.tabAudit', '📜'],
];

// The owner's back office: its own header and tabs, separate from the club/Xé Vé
// app. Anyone who is not an owner just sees "not found" (the API answers 404 too).
export default function OwnerShell({ children, title }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { data: me, error } = useLoad(() => (user ? api.get('/api/owner/me') : Promise.resolve(null)), [user?.id]);

  if (loading || (user && !me && !error)) return <div className="min-h-screen bg-navy-950 p-6 text-gray-400 text-sm">{t('common.loading')}</div>;
  if (!user || error) {
    return (
      <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-white text-xl font-bold">404</p>
        <p className="text-gray-400 text-sm">{t('owner.notFound')}</p>
        <Link href="/home" className="btn-secondary text-sm">{t('owner.backToApp')}</Link>
      </div>
    );
  }
  const active = (href) => (href === '/owner' ? pathname === '/owner' : pathname.startsWith(href));
  return (
    <div className="min-h-screen bg-navy-950">
      <header className="sticky top-0 z-30 border-b border-navy-700 bg-navy-950/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 pt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-amber-300 font-bold">Owner Console</p>
            <p className="text-white font-bold truncate">Pickleball Manager</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-gray-500 text-xs">{me.email}</span>
            <Link href="/home" className="text-gray-300 hover:text-white text-sm">← {t('owner.backToApp')}</Link>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl px-2 sm:px-4 flex gap-1 overflow-x-auto" aria-label="Owner">
          {TABS.map(([href, key, icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? 'page' : undefined}
              className={`shrink-0 px-3 py-2.5 text-sm border-b-2 ${active(href) ? 'border-amber-300 text-white font-semibold' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            >
              <span aria-hidden="true">{icon}</span> {t(key)}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">
        {title && <h1 className="text-2xl font-bold text-white mb-4">{title}</h1>}
        {children}
      </main>
    </div>
  );
}

// Shared bits for the owner pages.
export const fmtDate = (ymd) => (ymd ? String(ymd).slice(0, 10).split('-').reverse().join('/') : '—');
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const TIER_BADGE = {
  free: 'bg-navy-700 text-gray-300',
  basic: 'bg-sky-400/20 text-sky-200',
  standard: 'bg-violet-400/20 text-violet-200',
  advanced: 'bg-emerald-400/20 text-emerald-200',
  pro: 'bg-amber-300 text-navy-950',
};
