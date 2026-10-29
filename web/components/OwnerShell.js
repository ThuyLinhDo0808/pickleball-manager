'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';
import { NAV_ACTIVE } from '@/lib/nav';
import LangSelect from '@/components/LangSelect';
import UiIcon from '@/components/ui/UiIcon';
import BrandLogo from '@/components/BrandLogo';

// Line icons (24×24, stroke) for the console menu.
const ICON = {
  overview: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  chart: 'M3 3v18h18M7 15l4-4 3 3 6-7',
  hosts: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  clubs: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6',
  requests: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2zM9 14l2 2 4-4',
  handovers: 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
  payments: 'M2 5h20v14H2zM2 10h20M6 15h4',
  promos: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  feedback: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  announcements: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  system: 'M2 3h20v8H2zM2 13h20v8H2zM6 7h.01M6 17h.01',
  support: 'M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6',
  audit: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M18 6L6 18M6 6l12 12',
  back: 'M19 12H5M12 19l-7-7 7-7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};
export function OwnerIcon({ name, className = 'w-[18px] h-[18px]' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICON[name]} />
    </svg>
  );
}

// The menu, in groups. [href, label, icon, permission a support account needs
// (null = owners only), the `todo` count shown as a badge].
const GROUPS = [
  [null, [['/owner', 'owner.tabOverview', 'overview', 'stats'], ['/owner/analytics', 'owner.tabAnalytics', 'chart', 'stats']]],
  ['owner.grp_customers', [
    ['/owner/hosts', 'owner.tabHosts', 'hosts', 'hosts'],
    ['/owner/clubs', 'owner.tabClubs', 'clubs', 'hosts'],
    ['/owner/club-requests', 'owner.tabClubRequests', 'requests', 'hosts', 'club_requests'],
    ['/owner/featured', 'owner.tabFeatured', 'clubs', null],
    ['/owner/addons', 'owner.tabAddons', 'requests', null],
    ['/owner/coaches', 'owner.tabCoaches', 'hosts', null, 'coach_reports'],
    ['/owner/handovers', 'owner.tabHandovers', 'handovers', null, 'handovers'],
  ]],
  ['owner.grp_revenue', [
    ['/owner/payments', 'owner.tabPayments', 'payments', 'payments', 'payments'],
    ['/owner/promos', 'owner.tabPromos', 'promos', 'promos'],
  ]],
  ['owner.grp_operations', [
    ['/owner/activity', 'owner.tabActivity', 'activity', 'hosts'],
    ['/owner/feedback', 'owner.tabFeedback', 'feedback', 'feedback', 'feedback'],
    ['/owner/announcements', 'owner.tabAnnouncements', 'announcements', 'announcements'],
  ]],
  ['owner.grp_system', [
    ['/owner/system', 'owner.tabSystem', 'system', null],
    ['/owner/support', 'owner.tabSupport', 'support', null],
    ['/owner/audit', 'owner.tabAudit', 'audit', null],
  ]],
];
const TABS = GROUPS.flatMap(([group, items]) => items.map((it) => [...it.slice(0, 4), group, it[4]]));

// Who is using the console: { owner, support, permissions, email, todo }.
const OwnerMeContext = createContext(null);
export const useOwnerMe = () => useContext(OwnerMeContext);
// May this person use this part of the console?
export const consoleCan = (me, perm) => !!me && (me.owner || (!!perm && (me.permissions || []).includes(perm)));

function Nav({ me, active, onPick }) {
  const { t } = useI18n();
  return (
    <nav aria-label="Owner" className="flex flex-col gap-5">
      {GROUPS.map(([group, items]) => {
        const shown = items.filter(([, , , perm]) => consoleCan(me, perm));
        if (!shown.length) return null;
        return (
          <div key={group || 'top'}>
            {group && <p className="px-3 mb-1.5 text-xs font-semibold text-gray-400">{t(group)}</p>}
            <ul className="flex flex-col gap-0.5">
              {shown.map(([href, key, icon, , badge]) => {
                const on = active(href);
                const n = badge ? me.todo?.[badge] : 0;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onPick}
                      aria-current={on ? 'page' : undefined}
                      className={`min-h-[44px] lg:min-h-0 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${on ? `${NAV_ACTIVE} font-semibold` : 'text-gray-300 hover:bg-navy-800 hover:text-white'}`}
                    >
                      <OwnerIcon name={icon} className={`w-[18px] h-[18px] shrink-0 ${on ? 'text-lime-300' : 'text-gray-400'}`} />
                      <span className="flex-1 leading-snug break-words">{t(key)}</span>
                      {n > 0 && <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-lime-400 text-navy-950 text-xs font-bold tabular-nums leading-5 text-center" aria-label={t('owner.waitingN', { n })}>{n > 99 ? '99+' : n}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand({ me }) {
  const { t } = useI18n();
  return (
    <Link href="/owner" className="flex items-center gap-3 min-w-0">
      <BrandLogo variant="mark" markClass="h-8" />
      <span className="min-w-0">
        <span className="block text-white font-bold leading-tight">NexusZone</span>
        <span className="block text-xs text-gray-400 font-semibold">
          {me.support ? t('owner.supportBadge') : 'Owner Console'}
        </span>
      </span>
    </Link>
  );
}

// The owner's back office: its own sidebar (grouped menu with "waiting" counts) and page
// header, separate from the club / Xé Vé app. Anyone who is not an owner or support staff
// just sees "not found" (the API answers 404 too). `title`, `description` and `actions`
// make the page header.
// The owner console signs itself out after 30 minutes without a click or key press
// (a shared or forgotten laptop must not stay inside the back office).
const IDLE_MS = 30 * 60 * 1000;
function useIdleSignOut(active, signOut) {
  const out = useRef(signOut);
  out.current = signOut;
  useEffect(() => {
    if (!active) return undefined;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(async () => {
      if (Date.now() - last > IDLE_MS) {
        clearInterval(timer);
        await Promise.resolve(out.current?.()).catch(() => {});
        window.location.href = '/sign-in?idle=1';
      }
    }, 30 * 1000);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [active]);
}

export default function OwnerShell({ children, title, description, actions }) {
  const { t } = useI18n();
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const { data: me, error } = useLoad(() => (user ? api.get('/api/owner/me') : Promise.resolve(null)), [user?.id]);
  useIdleSignOut(!!me, signOut);

  if (loading || (user && !me && !error)) return <div className="min-h-screen bg-navy-950 p-6 text-gray-400 text-sm">{t('common.loading')}</div>;
  // Owners / support staff need two-step sign-in (MfaGate asks for the code).
  const mfaCode = error?.payload?.code;
  if (user && (mfaCode === 'mfa_required' || mfaCode === 'mfa_enroll_required')) {
    return (
      <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <UiIcon name="lock" className="w-8 h-8 text-gray-400" />
        <p className="text-white text-lg font-bold">{t(mfaCode === 'mfa_required' ? 'sec.verifyTitle' : 'sec.enrollTitle')}</p>
        <p className="text-gray-400 text-sm max-w-md">{t(mfaCode === 'mfa_required' ? 'sec.consoleVerify' : 'sec.enrollBody')}</p>
        <div className="flex gap-2">
          <Link href="/home" className="btn-secondary text-sm">{t('owner.backToApp')}</Link>
          {mfaCode === 'mfa_enroll_required' && <Link href="/p/profile#security" className="btn-primary text-sm">{t('sec.goEnable')}</Link>}
        </div>
      </div>
    );
  }
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
  const here = TABS.find(([href]) => active(href));
  const allowed = !here || consoleCan(me, here[3]);
  const first = TABS.find(([, , , perm]) => consoleCan(me, perm));
  // Phone tab bar: the four pages used most (that this account may open), the rest in "More".
  const phoneTabs = ['/owner', '/owner/hosts', '/owner/payments', '/owner/feedback'].map((h) => TABS.find(([href]) => href === h)).filter((tab) => tab && consoleCan(me, tab[3]));
  const otherTodo = TABS.some(([href, , , perm, , badge]) => badge && !phoneTabs.some(([h]) => h === href) && consoleCan(me, perm) && me.todo?.[badge] > 0);
  const footer = (
    <div className="border-t border-navy-700 pt-3 mt-3">
      <p className="px-3 text-gray-400 text-xs break-all" title={me.email}>{me.email}</p>
      <Link href="/home" className="mt-1 min-h-[44px] lg:min-h-0 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-navy-800 hover:text-white">
        <OwnerIcon name="back" className="w-[18px] h-[18px] text-gray-400" />
        {t('owner.backToApp')}
      </Link>
      <div className="px-3 mt-2"><LangSelect className="!w-full" /></div>
    </div>
  );
  return (
    <div className="min-h-screen bg-navy-950 lg:flex">
      {/* Desktop: fixed sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-navy-700 bg-navy-900 h-screen sticky top-0">
        <div className="px-4 py-4 border-b border-navy-700"><Brand me={me} /></div>
        <div className="flex-1 overflow-y-auto px-3 py-4"><Nav me={me} active={active} /></div>
        <div className="px-3 pb-3">{footer}</div>
      </aside>

      {/* Phone / tablet: the same pattern as the manager and player shells — a top bar with
          the brand, a bottom tab bar and a "More" sheet with the whole menu. */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-navy-700 bg-navy-900 px-4 h-14 pt-safe">
        <Brand me={me} />
      </header>
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label={t('owner.close')} onClick={() => setDrawer(false)} />
          <div className="absolute bottom-0 inset-x-0 max-h-[85vh] bg-navy-900 border-t border-navy-700 rounded-t-sheet flex flex-col pb-safe-4">
            <div className="mx-auto w-10 h-1 rounded-full bg-navy-600 mt-3 mb-1" aria-hidden="true" />
            <div className="flex-1 overflow-y-auto px-3 py-3"><Nav me={me} active={active} onPick={() => setDrawer(false)} /></div>
            <div className="px-3">{footer}</div>
          </div>
        </div>
      )}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-navy-900 border-t border-navy-700 pb-safe" aria-label="Owner">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${phoneTabs.length + 1}, minmax(0, 1fr))` }}>
          {phoneTabs.map(([href, key, icon, , , badge]) => {
            const on = active(href);
            const n = badge ? me.todo?.[badge] : 0;
            return (
              <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={`flex flex-col items-center justify-center gap-0.5 min-h-[4rem] py-1.5 text-xs leading-tight ${on ? 'text-lime-300' : 'text-gray-400'}`}>
                <span className="relative">
                  <OwnerIcon name={icon} className="w-5 h-5" />
                  {n > 0 && <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-lime-400" aria-hidden="true" />}
                </span>
                <span className="max-w-full px-0.5 text-center break-words">{t(key)}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setDrawer(true)} className={`flex flex-col items-center justify-center gap-0.5 min-h-[4rem] py-1.5 text-xs leading-tight ${drawer || !phoneTabs.some(([href]) => active(href)) ? 'text-lime-300' : 'text-gray-400'}`}>
            <span className="relative">
              <OwnerIcon name="more" className="w-5 h-5" />
              {otherTodo && <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-lime-400" aria-hidden="true" />}
            </span>
            <span>{t('nav.more')}</span>
          </button>
        </div>
      </nav>

      <main className="flex-1 min-w-0 pb-tabbar-lg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {title && (
            <div className="flex flex-wrap items-end justify-between gap-3 mb-6 pb-5 border-b border-navy-700">
              <div className="min-w-0">
                <p className="text-xs text-gray-400 mb-1">Owner Console{here?.[4] ? ` / ${t(here[4])}` : ''}</p>
                <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
                {description && <p className="text-gray-400 text-sm mt-1 max-w-3xl">{description}</p>}
              </div>
              {actions && <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full">{actions}</div>}
            </div>
          )}
          {allowed ? (
            <OwnerMeContext.Provider value={me}>{children}</OwnerMeContext.Provider>
          ) : (
            <div className="card text-sm text-gray-300">
              {t('owner.supportNoAccess')}
              {first && <Link href={first[0]} className="ml-2 text-lime-300 underline">{t(first[1])}</Link>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// A titled block inside an owner page: heading, optional hint and link / actions.
export function OwnerSection({ title, hint, action, children, className = '' }) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <h2 className="text-white font-semibold">{title}</h2>
          {hint && <p className="text-gray-500 text-xs mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Shared bits for the owner pages.
export const fmtDate = (ymd) => (ymd ? String(ymd).slice(0, 10).split('-').reverse().join('/') : '—');
export const fmtTime = (iso) => (iso ? localDate(new Date(iso), 'vi-VN', { dateStyle: 'short', timeStyle: 'short' }, true) : '—');
export const TIER_BADGE = {
  free: 'bg-navy-700 text-gray-300',
  basic: 'bg-sky-400/20 text-sky-200',
  standard: 'bg-navy-700 text-gray-200',
  advanced: 'bg-emerald-400/20 text-emerald-200',
  pro: 'bg-amber-300 text-navy-950',
};
