'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { useWorkspace, WORKSPACE_HOME } from '@/context/WorkspaceContext';
import CreateClubForm from '@/components/CreateClubForm';
import ContextSwitcher from '@/components/ContextSwitcher';
import { SocialManagerPanel } from '@/components/PlanModals';
import FeedbackButton from '@/components/FeedbackButton';
import SchemaBanner from '@/components/SchemaBanner';
import BirthdayBanner from '@/components/BirthdayBanner';
import { api } from '@/lib/api';

const ICONS = {
  dashboard: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  members: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  rankings: 'M8 21V11M16 21V7M12 21V3M4 21h16',
  fund: 'M3 7h18v12H3zM3 11h18M7 15h3',
  schedule: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  clubs: 'M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z',
  account: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  collapse: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  expand: 'M13 17l5-5-5-5M6 17l5-5-5-5',
  signOut: 'M15 12H3M11 8l4 4-4 4M15 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4',
  plans: 'M4 5h16v14H4zM4 9h16M8 13h4',
  matches: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8 9h.01M12 7h.01M16 9h.01M9 13h.01M15 13h.01M12 16h.01',
  ticket: 'M4 7h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4zM12 7v10',
  whistle: 'M3 11a5 5 0 1010 0 5 5 0 00-10 0zM8 6V4h13v4l-8 3',
  key: 'M15 7a4 4 0 11-3.9 5H3v3h3v-2h2v2h3',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  chat: 'M4 5h16v11H9l-5 4z',
};

// Each workspace has its own menu, grouped by segment. A group ({ key, icon, children })
// is a collapsible sub-folder in the sidebar and a titled block in the phone's "More" sheet.
const NAV_BY_WORKSPACE = {
  club: [
    { href: '/dashboard', key: 'nav.dashboard', icon: 'dashboard' },
    { href: '/club/members', key: 'nav.members', icon: 'members', badge: 'memberRequests' },
    {
      key: 'nav.groupActivities',
      icon: 'schedule',
      children: [
        // The calendar only shows; each kind of activity has its own create page.
        { href: '/events', key: 'nav.schedule', icon: 'schedule', exclude: ['/events/create'] },
        { href: '/events/create/weekly', key: 'nav.createWeekly', icon: 'plans' },
        { href: '/club/tournaments/new', key: 'nav.createTournament', icon: 'trophy', also: ['/club/tournaments'] },
        { href: '/events/create', key: 'nav.createGame', icon: 'ticket', exact: true },
      ],
    },
    {
      key: 'nav.groupStats',
      icon: 'chart',
      children: [
        { href: '/club/attendance', key: 'nav.memberStats', icon: 'members' },
        { href: '/club/rankings', key: 'nav.rankings', icon: 'rankings' },
      ],
    },
    {
      key: 'nav.groupFinance',
      icon: 'fund',
      children: [
        { href: '/finance', key: 'nav.finOverview', icon: 'fund', exact: true },
        { href: '/finance/ledger', key: 'nav.ledger', icon: 'plans' },
        { href: '/finance/plans', key: 'nav.plans', icon: 'plans' },
        { href: '/finance/inventory', key: 'nav.inventory', icon: 'box' },
      ],
    },
    {
      key: 'nav.groupSettings',
      icon: 'clubs',
      children: [
        { href: '/clubs', key: 'nav.clubs', icon: 'clubs' },
        { href: '/staff-access', key: 'nav.staffAccess', icon: 'key' },
        { href: '/account', key: 'nav.account', icon: 'account' },
      ],
    },
  ],
  xeve: [
    { href: '/events', key: 'nav.kevents', icon: 'ticket', exclude: ['/events/create'] },
    { href: '/events/create', key: 'nav.createGame', icon: 'plans', exact: true },
    { href: '/xeve/matches', key: 'nav.matches', icon: 'matches' },
    { href: '/leaderboard', key: 'nav.globalRank', icon: 'rankings' },
    {
      key: 'nav.groupFinance',
      icon: 'fund',
      children: [
        { href: '/finance', key: 'nav.finOverview', icon: 'fund', exact: true },
        { href: '/finance/ledger', key: 'nav.ledger', icon: 'plans' },
      ],
    },
    {
      key: 'nav.groupSettings',
      icon: 'clubs',
      children: [
        { href: '/staff-access', key: 'nav.staffAccess', icon: 'key' },
        { href: '/account', key: 'nav.account', icon: 'account' },
      ],
    },
  ],
  // Referees / coordinators: only their assigned events. No finance, no members.
  staff: [{ href: '/staff', key: 'nav.staffEvents', icon: 'whistle' }],
};

// Phone bottom bar (plus "More", which holds the full grouped menu).
const TABS_BY_WORKSPACE = {
  club: [
    { href: '/dashboard', key: 'nav.dashboard', icon: 'dashboard' },
    { href: '/club/members', key: 'nav.members', icon: 'members', badge: 'memberRequests' },
    { href: '/events', key: 'nav.schedule', icon: 'schedule', exclude: ['/events/create'] },
    { href: '/finance', key: 'nav.groupFinance', icon: 'fund' },
  ],
  xeve: [
    { href: '/events', key: 'nav.kevents', icon: 'ticket' },
    { href: '/finance', key: 'nav.groupFinance', icon: 'fund' },
  ],
  staff: [{ href: '/staff', key: 'nav.staffEvents', icon: 'whistle' }],
};

const GROUPS_KEY = 'pickleball_nav_groups';

const COLLAPSE_KEY = 'pickleball_nav_collapsed';

// Pages that work without a club; everything else prompts to create one first.
const NO_CLUB_OK = ['/clubs', '/account', '/staff-access'];

function Badge({ n, className = '' }) {
  if (!n) return null;
  return (
    <span className={`min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold leading-5 text-center ${className}`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

// How many accounts wait for the Host to confirm them as club members.
function useMemberRequestCount(clubId, enabled, pathname) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled || !clubId) {
      setN(0);
      return undefined;
    }
    let alive = true;
    const load = () =>
      api
        .get(`/api/clubs/${clubId}/member-requests`)
        .then((rows) => alive && setN(Array.isArray(rows) ? rows.length : 0))
        .catch(() => alive && setN(0));
    load();
    window.addEventListener('member-requests-changed', load);
    return () => {
      alive = false;
      window.removeEventListener('member-requests-changed', load);
    };
  }, [clubId, enabled, pathname]);
  return n;
}

function Icon({ name, className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
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

const SIDEBAR_SCROLL_KEY = 'pickleball_sidebar_scroll';

export default function AppShell({ children }) {
  const { user, loading, signOut } = useAuth();
  const { t } = useI18n();
  const { clubs, club, isCoAdmin, loading: clubsLoading } = useClubs();
  // Each page mounts its own shell: put the sidebar back where it was scrolled to,
  // instead of jumping to the top after every click.
  const sideRef = useRef(null);
  useLayoutEffect(() => {
    if (!sideRef.current) return;
    try {
      const y = Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY) || 0);
      if (y) sideRef.current.scrollTop = y;
    } catch {}
  });
  const { workspace, ready: wsReady, plan } = useWorkspace();
  const pathname = usePathname() || '';
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const requestCount = useMemberRequestCount(club?.id, !!user && workspace === 'club', pathname);
  const badges = { memberRequests: requestCount };

  // No space chosen yet (first visit, or the saved one is gone): the home hub lists them.
  useEffect(() => {
    if (user && wsReady && !workspace) router.replace('/home');
  }, [user, wsReady, workspace, router]);

  useEffect(() => {
    try {
      setOpenGroups(JSON.parse(window.localStorage.getItem(GROUPS_KEY) || '{}'));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleGroup(key, isOpen) {
    setOpenGroups((g) => {
      const next = { ...g, [key]: !isOpen };
      try {
        window.localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  useEffect(() => {
    if (!loading && !user) router.replace('/sign-in');
  }, [loading, user, router]);

  useEffect(() => setMoreOpen(false), [pathname]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-white">{t('common.loading')}</div>;
  if (!user) return null;

  const isActive = (href, exact = false) => pathname === href || (!exact && pathname.startsWith(`${href}/`));
  // An item may also light up for related pages (`also`) and skip sub-pages that have their own item (`exclude`).
  const navActive = (item) =>
    pathname === item.href ||
    (isActive(item.href, item.exact) && !(item.exclude || []).some((p) => isActive(p))) ||
    (item.also || []).some((p) => isActive(p));
  const itemActive = (item) => (item.children ? item.children.some(navActive) : navActive(item));
  const coAdmin = workspace === 'club' && isCoAdmin;
  // A co-admin works on the owner's club with the full menu (only deleting the club is
  // left to the owner).
  const NAV = NAV_BY_WORKSPACE[workspace] || [];
  const tabs = TABS_BY_WORKSPACE[workspace] || [];
  const needsClub = workspace === 'club' && !clubsLoading && clubs.length === 0 && !NO_CLUB_OK.some((p) => isActive(p));
  const moreActive = !tabs.some((tab) => navActive(tab));
  // A group is open if the Host opened it, or (until they close it) when it holds the current page.
  const groupOpen = (g) => openGroups[g.key] ?? itemActive(g);

  const linkClass = (active, extra = '') =>
    `flex items-center gap-3 rounded-lg text-sm ${extra} ${active ? 'bg-navy-700 text-lime-400' : 'text-gray-300 hover:bg-navy-800'}`;

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside
        ref={sideRef}
        onScroll={(e) => {
          try {
            sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(e.currentTarget.scrollTop));
          } catch {}
        }}
        className={`hidden md:flex shrink-0 bg-navy-900 border-r border-navy-700 flex-col gap-1 sticky top-0 h-screen overflow-y-auto transition-[width] duration-200 ${
          collapsed ? 'w-16 p-2' : 'w-64 p-4'
        }`}
      >
        <div className={`flex items-center mb-3 ${collapsed ? 'justify-center' : 'justify-between pl-2'}`}>
          {!collapsed && <span className="text-lime-400 font-bold text-lg truncate">{t('appName')}</span>}
          <button
            onClick={toggleCollapsed}
            aria-label={t(collapsed ? 'nav.expand' : 'nav.collapse')}
            title={t(collapsed ? 'nav.expand' : 'nav.collapse')}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:bg-navy-800 hover:text-lime-400"
          >
            <Icon name={collapsed ? 'expand' : 'collapse'} />
          </button>
        </div>
        {workspace && (
          <div className="mb-3 px-1 flex flex-col gap-2">
            <ContextSwitcher iconOnly={collapsed} />
            {!collapsed && (
              <Link href="/home" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-navy-800">
                <Icon name="dashboard" className="w-3.5 h-3.5" />
                {t('hub.backHomeShort')}
              </Link>
            )}
          </div>
        )}
        {NAV.map((item) => {
          if (collapsed) {
            // Icon rail: a group icon opens its first page.
            const href = item.children ? item.children[0].href : item.href;
            return (
              <Link key={item.key} href={href} title={t(item.key)} className={linkClass(itemActive(item), 'justify-center h-10 relative')}>
                <Icon name={item.icon} className="w-5 h-5" />
                <Badge n={badges[item.badge]} className="absolute -top-1 -right-1" />
              </Link>
            );
          }
          if (!item.children) {
            return (
              <Link key={item.key} href={item.href} className={linkClass(itemActive(item), 'px-3 py-2')}>
                <Icon name={item.icon} className="w-4 h-4" />
                <span className="flex-1">{t(item.key)}</span>
                <Badge n={badges[item.badge]} />
              </Link>
            );
          }
          const open = groupOpen(item);
          return (
            <div key={item.key}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleGroup(item.key, open)}
                className={`w-full flex items-center gap-3 rounded-lg text-sm px-3 py-2 hover:bg-navy-800 ${itemActive(item) ? 'text-lime-400' : 'text-gray-300'}`}
              >
                <Icon name={item.icon} className="w-4 h-4" />
                <span className="flex-1 text-left">{t(item.key)}</span>
                <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
              {open && (
                <div className="ml-5 pl-3 border-l border-navy-700 flex flex-col gap-0.5 my-0.5">
                  {item.children.map((c) => (
                    <Link key={c.href} href={c.href} className={linkClass(navActive(c), 'px-3 py-1.5')}>
                      {t(c.key)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="mt-auto flex flex-col gap-2 pt-4">
          {collapsed ? (
            <button
              onClick={() => signOut()}
              title={t('nav.signOut')}
              aria-label={t('nav.signOut')}
              className="h-10 flex items-center justify-center rounded-lg text-gray-300 hover:bg-navy-800"
            >
              <Icon name="signOut" />
            </button>
          ) : (
            <>
              <FeedbackButton className="text-gray-300 text-sm flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-navy-800">
                <Icon name="chat" className="w-4 h-4" />
                {t('feedback.button')}
              </FeedbackButton>
              <LangSelect />
              <button onClick={() => signOut()} className="btn-secondary text-sm">
                {t('nav.signOut')}
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-navy-900/95 backdrop-blur border-b border-navy-700 pt-safe">
        <div className="flex items-center gap-3 px-4 h-14">
          <Link href="/home" aria-label={t('hub.backHome')} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-lime-400 bg-navy-800">
            <Icon name="dashboard" className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">{workspace && <ContextSwitcher compact />}</div>
        </div>
      </header>

      <main className="flex-1 min-w-0 p-4 md:p-6 pb-tabbar">
        {workspace && workspace !== 'staff' && <SchemaBanner />}
        {!wsReady || !workspace ? null : workspace === 'xeve' && plan && !plan.social_manager && !NO_CLUB_OK.some((p) => isActive(p)) ? (
          <div className="max-w-lg mx-auto card mt-4">
            <SocialManagerPanel />
          </div>
        ) : needsClub ? (
          <div className="max-w-md mx-auto card mt-4">
            <h1 className="text-white text-xl font-bold mb-1">{t('clubs.createFirst')}</h1>
            <p className="text-gray-400 text-sm mb-4">{t('clubs.createFirstHint')}</p>
            <CreateClubForm autoFocus />
          </div>
        ) : (
          <>
            {coAdmin && (
              <p className="mb-3 text-xs text-sky-300">
                {t('coadmin.banner', { name: club?.name || '', owner: club?.owner_email || '—' })}
              </p>
            )}
            {workspace === 'club' && <BirthdayBanner clubId={club?.id} />}
            {children}
          </>
        )}
      </main>

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button aria-label={t('common.cancel')} className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-navy-900 border-t border-navy-700 rounded-t-2xl p-4 pb-safe-4 flex flex-col gap-1">
            <div className="mx-auto w-10 h-1 rounded-full bg-navy-600 mb-3" />
            <div className="max-h-[60vh] overflow-y-auto flex flex-col gap-1">
              {NAV.map((item) =>
                item.children ? (
                  <div key={item.key} className="mt-2">
                    <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide px-3 mb-1">{t(item.key)}</div>
                    <div className="grid grid-cols-2 gap-1">
                      {item.children.map((c) => (
                        <Link
                          key={c.href}
                          href={c.href}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${navActive(c) ? 'bg-navy-700 text-lime-400' : 'text-gray-200 bg-navy-800/60'}`}
                        >
                          <Icon name={c.icon} className="w-4 h-4 shrink-0" />
                          <span className="leading-tight">{t(c.key)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg ${navActive(item) ? 'bg-navy-700 text-lime-400' : 'text-gray-200'}`}
                  >
                    <Icon name={item.icon} />
                    <span className="flex-1">{t(item.key)}</span>
                    <Badge n={badges[item.badge]} />
                  </Link>
                )
              )}
            </div>
            <FeedbackButton className="flex items-center gap-3 px-3 py-3 rounded-lg text-gray-200 w-full text-left">
              <Icon name="chat" />
              {t('feedback.button')}
            </FeedbackButton>
            <Link href="/home" className="flex items-center gap-3 px-3 py-3 rounded-lg text-gray-200">
              <Icon name="dashboard" />
              {t('hub.backHome')}
            </Link>
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
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((item) => {
            const href = item.href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] ${
                  navActive(item) ? 'text-lime-400' : 'text-gray-400'
                }`}
              >
                <span className="relative">
                  <Icon name={item.icon} />
                  <Badge n={badges[item.badge]} className="absolute -top-2 -right-3" />
                </span>
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
