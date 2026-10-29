'use client';
import BackButton from '@/components/BackButton';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { useWorkspace, WORKSPACE_HOME } from '@/context/WorkspaceContext';
import CreateClubForm from '@/components/CreateClubForm';
import ContextSwitcher from '@/components/ContextSwitcher';
import { SocialManagerPanel, UpgradeModal } from '@/components/PlanModals';
import SignupBell from '@/components/SignupBell';
import SchemaBanner from '@/components/SchemaBanner';
import { api } from '@/lib/api';
import LockedFeature from '@/components/LockedFeature';
import PlanLimitNotice from '@/components/PlanLimitNotice';
import { featureForPath, planFor, hasFeature } from '@/lib/planFeatures';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import LangSelect from '@/components/LangSelect';
import ThemeToggle from '@/components/ThemeToggle';
import UiIcon from '@/components/ui/UiIcon';
import { NAV_ACTIVE } from '@/lib/nav';
import BrandLogo from '@/components/BrandLogo';

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
// Thành viên ▸ one page per tab (tổng quan, cố định, giao lưu, Danh sách chờ, Danh sách đen, DUPR).
const membersGroup = (key) => ({
  key,
  icon: 'members',
  badge: 'memberRequests',
  children: [
    { href: '/club/members/all', key: 'nav.memAll', icon: 'members' },
    { href: '/club/members', key: 'nav.memFixed', icon: 'members', exact: true },
    { href: '/club/members/new', key: 'nav.memNew', icon: 'members', community: true },
    { href: '/club/members/guests', key: 'nav.memGuests', icon: 'members' },
    { href: '/club/members/requests', key: 'nav.memRequests', icon: 'members', badge: 'memberRequests' },
    { href: '/club/members/review', key: 'nav.memReview', icon: 'members' },
    { href: '/club/members/dupr', key: 'nav.memDupr', icon: 'rankings', sport: 'pickleball' },
    { href: '/club/coaches', key: 'nav.clubCoaches', icon: 'users', coachLink: true },
  ],
});

const NAV_BY_WORKSPACE = {
  club: [
    { href: '/dashboard', key: 'nav.dashboard', icon: 'dashboard' },
    membersGroup('nav.members'),
    {
      key: 'nav.groupActivities',
      icon: 'schedule',
      children: [
        // The calendar only shows; each kind of activity has its own create page.
        // Giải đấu and Lịch trực are hidden from the menu for now (their pages stay).
        { href: '/events', key: 'nav.schedule', icon: 'schedule', exclude: ['/events/create'] },
        { href: '/events/create/weekly', key: 'nav.createWeekly', icon: 'plans' },
        { href: '/events/create', key: 'nav.createGame', icon: 'ticket', exact: true },
        // Tournament Manager: only for a Host the Ban quản trị switched it on for.
        { href: '/club/tournaments', key: 'nav.tournaments', icon: 'trophy', addon: 'tournament_manager' },
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
      key: 'nav.groupStats',
      icon: 'chart',
      children: [
        { href: '/club/attendance', key: 'nav.memberStats', icon: 'members' },
        { href: '/club/rankings', key: 'nav.rankings', icon: 'rankings' },
        { href: '/club/dupr', key: 'nav.dupr', icon: 'rankings', sport: 'pickleball' },
        { href: '/club/reviews', key: 'nav.reviews', icon: 'chat' },
        { href: '/club/insights', key: 'nav.insights', icon: 'chart' },
      ],
    },
    {
      key: 'nav.groupSettings',
      icon: 'clubs',
      children: [
        { href: '/clubs', key: 'nav.clubs', icon: 'clubs' },
        { href: '/staff-access', key: 'nav.staffAccess', icon: 'key' },
        { href: '/club/activity-log', key: 'nav.activityLog', icon: 'plans' },
        { href: '/account', key: 'nav.account', icon: 'account' },
      ],
    },
  ],
  // Social Manager with no community yet: only the account (the page asks to create one).
  // The old one-off kèo space (no community) is gone — every kèo belongs to a community.
  xeve: [{ href: '/account', key: 'nav.account', icon: 'account' }],
  // Referees / coordinators: only their assigned events. No finance, no members.
  staff: [
    { href: '/staff', key: 'nav.staffEvents', icon: 'whistle' },
    { href: '/account', key: 'nav.account', icon: 'account' },
  ],
  // Coach Manager: its own product (no plan, no club). Classes, students and money come
  // in later batches; the menu grows with them.
  coach: [
    { href: '/coach', key: 'nav.coachOverview', icon: 'dashboard', exact: true },
    { href: '/coach/schedule', key: 'nav.coachSchedule', icon: 'schedule' },
    { href: '/coach/classes', key: 'nav.coachClasses', icon: 'plans', also: ['/coach/sessions'] },
    { href: '/coach/students', key: 'nav.coachStudents', icon: 'users' },
    { href: '/coach/hours', key: 'nav.coachHours', icon: 'clock' },
    { href: '/coach/packages', key: 'nav.coachPackages', icon: 'ticket' },
    { href: '/coach/money', key: 'nav.coachMoney', icon: 'wallet' },
    { href: '/coach/stats', key: 'nav.coachStats', icon: 'chart' },
    { href: '/coach/clubs', key: 'nav.coachClubs', icon: 'clubs' },
    { href: '/coach/profile', key: 'nav.coachProfile', icon: 'user' },
    { href: '/account', key: 'nav.account', icon: 'account' },
  ],
};
// Social Manager with a community (cụm sân) picked: every Club Manager page, for the
// community (no meetings / round robin), plus the app-wide leaderboard.
NAV_BY_WORKSPACE.community = [
  { href: '/dashboard', key: 'nav.commOverview', icon: 'dashboard' },
  membersGroup('nav.commMembers'),
  {
    key: 'nav.groupActivities',
    icon: 'schedule',
    children: [
      { href: '/events', key: 'nav.kevents', icon: 'schedule', exclude: ['/events/create'] },
      { href: '/events/create/weekly', key: 'nav.createWeekly', icon: 'plans' },
      { href: '/events/create', key: 'nav.createGame', icon: 'ticket', exact: true },
      { href: '/club/tournaments', key: 'nav.tournaments', icon: 'trophy', addon: 'tournament_manager' },
    ],
  },
  NAV_BY_WORKSPACE.club.find((g) => g.key === 'nav.groupFinance'),
  // Thống kê of a community = business numbers (players, money); no attendance grid.
  {
    key: 'nav.groupStats',
    icon: 'chart',
    children: [
      { href: '/club/business', key: 'nav.bizPlayers', icon: 'members', exact: true },
      { href: '/club/dupr', key: 'nav.dupr', icon: 'rankings', sport: 'pickleball' },
      { href: '/club/reviews', key: 'nav.reviews', icon: 'chat' },
    ],
  },
  // Bảng xếp hạng: its own menu item — only this community's players.
  { href: '/club/rankings', key: 'nav.rankings', icon: 'rankings' },
  {
    key: 'nav.groupSettings',
    icon: 'clubs',
    children: [
      { href: '/club/community-settings', key: 'nav.commPanel', icon: 'chart' },
      { href: '/clubs', key: 'nav.communities', icon: 'clubs' },
      { href: '/staff-access', key: 'nav.staffAccess', icon: 'key' },
      { href: '/club/activity-log', key: 'nav.activityLog', icon: 'plans' },
      { href: '/account', key: 'nav.account', icon: 'account' },
    ],
  },
];

// Phone bottom bar (plus "More", which holds the full grouped menu).
const TABS_BY_WORKSPACE = {
  club: [
    { href: '/dashboard', key: 'nav.dashboard', icon: 'dashboard' },
    { href: '/club/members', key: 'nav.members', icon: 'members', badge: 'memberRequests' },
    { href: '/events', key: 'nav.schedule', icon: 'schedule', exclude: ['/events/create'] },
    { href: '/finance', key: 'nav.groupFinance', icon: 'fund' },
  ],
  xeve: [{ href: '/account', key: 'nav.account', icon: 'account' }],
  staff: [{ href: '/staff', key: 'nav.staffEvents', icon: 'whistle' }],
  coach: [
    { href: '/coach', key: 'nav.coachOverview', icon: 'dashboard', exact: true },
    { href: '/coach/schedule', key: 'nav.coachSchedule', icon: 'schedule' },
    { href: '/coach/classes', key: 'nav.coachClasses', icon: 'plans', also: ['/coach/sessions'] },
    { href: '/coach/students', key: 'nav.coachStudents', icon: 'users' },
  ],
  community: [
    { href: '/dashboard', key: 'nav.commOverview', icon: 'dashboard' },
    { href: '/club/members', key: 'nav.commMembers', icon: 'members', badge: 'memberRequests' },
    { href: '/events', key: 'nav.kevents', icon: 'ticket', exclude: ['/events/create'] },
    { href: '/finance', key: 'nav.groupFinance', icon: 'fund' },
  ],
};

// Club staff with a limited role see only their pages (the API refuses the rest anyway).
const ROLE_PAGES = {
  finance: ['/finance', '/finance/ledger', '/finance/plans', '/club/roster', '/account'],
  operator: ['/club/members', '/club/dupr', '/events', '/club/attendance', '/club/rankings', '/club/reviews', '/finance/inventory', '/club/roster', '/account'],
};
// With custom permissions (Pro) the menu follows the person's permission groups.
const GROUP_PAGES = {
  members: ['/club/members', '/club/attendance'],
  events: ['/events', '/club/reviews'],
  matches: ['/events'],
  rankings: ['/club/rankings', '/club/dupr'],
  inventory: ['/finance/inventory'],
  finance_view: ['/finance', '/finance/ledger', '/finance/plans'],
  finance_edit: ['/finance', '/finance/ledger', '/finance/plans'],
};
// A co-host (đồng quản trị) never sees money (overview, ledger, plans / debts — the ball
// stock stays), the club / community settings or staff access.
const COHOST_HIDDEN = ['/finance', '/finance/ledger', '/finance/plans', '/club/community-settings', '/staff-access', '/club/business/finance'];
function pagesFor(club) {
  if (!club || !['finance', 'operator'].includes(club.role)) return null;
  if (!Array.isArray(club.groups)) return ROLE_PAGES[club.role] || null;
  return [...new Set([...club.groups.flatMap((g) => GROUP_PAGES[g] || []), '/club/roster', '/account'])];
}

const GROUPS_KEY = 'pickleball_nav_groups';

const COLLAPSE_KEY = 'pickleball_nav_collapsed';

// Pages that work without a club; everything else prompts to create one first.
const NO_CLUB_OK = ['/clubs', '/account', '/staff-access'];
// Whole days from today (local) to a 'YYYY-MM-DD' date.
const daysLeft = (ymd) => {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.parse(`${ymd}T00:00:00Z`) - today) / 86400000);
};

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


const SIDEBAR_SCROLL_KEY = 'pickleball_sidebar_scroll';

// A club / community whose plan has ended: nothing to manage until it is renewed. The
// owner renews here (same plans as on the Account page); staff are told to ask the owner.
function ExpiredPlan({ product, owner, until }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const sm = product === 'social_manager';
  return (
    <div className="max-w-lg mx-auto card mt-4 text-center border-red-400/50" role="alert">
      <h1 className="text-white text-xl font-bold">{t(sm ? 'plan.expiredTitleSm' : 'plan.expiredTitle')}</h1>
      <p className="text-gray-300 text-sm mt-2">{t(sm ? 'plan.expiredBodySm' : 'plan.expiredBody', { date: until ? until.split('-').reverse().join('/') : '' })}</p>
      {owner ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/home" className="btn-secondary">{t('owner.suspendedHome')}</Link>
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>{t('plan.renewNow')}</button>
        </div>
      ) : (
        <p className="text-gray-400 text-sm mt-3">{t('plan.expiredAskOwner')}</p>
      )}
      <UpgradeModal open={open} onClose={() => setOpen(false)} product={product} />
    </div>
  );
}

// Pages reached from the menu or the phone tab bar: no "← Quay lại" there.
const TOP_LEVEL = new Set(
  [
    ...Object.values(NAV_BY_WORKSPACE).flatMap((items) => items.flatMap((i) => (i.children ? i.children : [i]))),
    ...Object.values(TABS_BY_WORKSPACE).flat(),
  ].flatMap((i) => [i.href, ...(i.also || [])])
);
TOP_LEVEL.add('/dashboard');
// Where "← Quay lại" goes when there is no page to go back to: the nearest menu page above.
function backFallback(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  while (parts.length > 1) {
    parts.pop();
    const p = `/${parts.join('/')}`;
    if (TOP_LEVEL.has(p)) return p;
  }
  return '/dashboard';
}

// back: false = page has its own way back; a string = where to go when there is no history.
export default function AppShell({ children, back }) {
  const { user, loading, signOut } = useAuth();
  const { t, setSpace } = useI18n();
  const { clubs, club, isCoAdmin, loading: clubsLoading, reload: reloadClubs } = useClubs();
  // Set when the API says the app owner suspended this account (see lib/api.js).
  const [suspended, setSuspended] = useState(null);
  useEffect(() => {
    const on = (e) => setSuspended(e.detail || {});
    window.addEventListener('pb:suspended', on);
    return () => window.removeEventListener('pb:suspended', on);
  }, []);
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
  const { workspace, ready: wsReady, plan, setWorkspace, coachInfo } = useWorkspace();
  // 'community' = Social Manager with a community picked (club pages for that community);
  // 'xeve' alone = the older one-off kèo. `scoped`: the pages work on a club / community.
  const pathname = usePathname() || '';
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const requestCount = useMemberRequestCount(club?.id, !!user && (workspace === 'club' || (workspace === 'xeve' && !!club)), pathname);
  const badges = { memberRequests: requestCount };

  // A coach page opened by its address (bookmark, link) switches the space to Coach, so the
  // switcher and the menu say where you are.
  useEffect(() => {
    if (user && coachInfo?.has_profile && workspace !== 'coach' && (pathname === '/coach' || pathname.startsWith('/coach/'))) setWorkspace('coach');
  }, [user, coachInfo?.has_profile, workspace, pathname, setWorkspace]);

  // No space chosen yet (first visit, or the saved one is gone): the home hub lists them.
  useEffect(() => {
    if (user && wsReady && !workspace) router.replace('/home');
  }, [user, wsReady, workspace, router]);

  // Finance / Operations staff opening a page outside their role go to their first page.
  useEffect(() => {
    const pages = workspace === 'club' || (workspace === 'xeve' && club) ? pagesFor(club) : null;
    if (!pages || !pathname) return;
    const inside = pages.some((p) => pathname === p || (p !== '/finance' && pathname.startsWith(`${p}/`))) || pathname.startsWith('/events/');
    if (!inside) router.replace(pages[0]);
  }, [workspace, club, pathname, router]);

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

  // Before saying "create your first club", ask the server once more: a club shared
  // with this account (co-admin) after sign-in is not in the first list.
  const [clubsChecked, setClubsChecked] = useState(false);
  useEffect(() => {
    if (workspace !== 'club' || clubsLoading || clubs.length || clubsChecked) return;
    reloadClubs().finally(() => setClubsChecked(true));
  }, [workspace, clubsLoading, clubs.length, clubsChecked, reloadClubs]);

  // Running a community: the club pages' words say "cộng đồng" instead of "CLB".
  const communityMode = workspace === 'xeve' && !!club;
  useLayoutEffect(() => {
    setSpace(communityMode ? 'community' : null);
    return () => setSpace(null);
  }, [communityMode, setSpace]);

  const [renewOpen, setRenewOpen] = useState(false);
  // Finance overview (charts) is a Standard page; the ledger is in every plan, so a plan
  // without the charts opens the ledger instead of an upgrade card titled "Thống kê".
  const financeLocked =
    pathname === '/finance' && (workspace === 'club' || communityMode) && !hasFeature(planFor(club, plan), featureForPath('/finance', 'club'));
  useEffect(() => {
    if (wsReady && financeLocked) router.replace('/finance/ledger');
  }, [wsReady, financeLocked, router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-white">{t('common.loading')}</div>;
  if (!user) return null;

  const isActive = (href, exact = false) => pathname === href || (!exact && pathname.startsWith(`${href}/`));
  // An item may also light up for related pages (`also`) and skip sub-pages that have their own item (`exclude`).
  const navActive = (item) =>
    pathname === item.href ||
    (isActive(item.href, item.exact) && !(item.exclude || []).some((p) => isActive(p))) ||
    (item.also || []).some((p) => isActive(p));
  const itemActive = (item) => (item.children ? item.children.some(navActive) : navActive(item));
  // Coach Manager pages carry their own menu whatever space was open (the profile is
  // created from the club / community side, before the coach space exists).
  const onCoachPage = pathname === '/coach' || pathname.startsWith('/coach/');
  const mode = onCoachPage ? 'coach' : workspace === 'xeve' && club ? 'community' : workspace;
  const scoped = workspace === 'club' || mode === 'community';
  const coAdmin = scoped && isCoAdmin;
  // A co-admin works on the owner's club with the full menu, except granting access to
  // others (and deleting the club), which stay with the owner.
  const clubRole = scoped ? club?.role : null;
  const rolePages = clubRole ? pagesFor(club) : null;
  // A listed page also allows its sub-pages (e.g. /club/members → /club/members/guests).
  const roleOk = (href) => !(coAdmin && COHOST_HIDDEN.includes(href)) && (!rolePages || rolePages.some((p) => href === p || (p !== '/finance' && href.startsWith(`${p}/`))));
  const NAV = (NAV_BY_WORKSPACE[mode] || [])
    .map((g) => (coAdmin && g.children ? { ...g, children: g.children.filter((c) => c.href !== '/staff-access') } : g))
    .map((g) => (g.children ? { ...g, children: g.children.filter((c) => roleOk(c.href) && (!c.sport || (club?.sport || 'pickleball') === c.sport) && (!c.community || mode === 'community') && (!c.coachLink || !!coachInfo?.enabled || coachInfo?.host_links > 0) && (!c.addon || c.showLocked || !!planFor(scoped ? club : null, plan)?.addons?.[c.addon])) } : g))
    .filter((g) => (g.children ? g.children.length > 0 : roleOk(g.href)));
  const tabs = (TABS_BY_WORKSPACE[mode] || []).map((tab) => (coAdmin && tab.href === '/finance' ? { href: '/finance/inventory', key: 'nav.inventory', icon: 'box' } : tab)).filter((tab) => roleOk(tab.href));
  // Staff / finance see one or two pages: put their account beside them, so the bar is not
  // one lonely icon next to "Thêm".
  if (tabs.length < 3 && !tabs.some((tab) => tab.href === '/account')) tabs.push({ href: '/account', key: 'nav.account', icon: 'account' });
  const needsClub = workspace === 'club' && !onCoachPage && !clubsLoading && clubs.length === 0 && !NO_CLUB_OK.some((p) => isActive(p)) && clubsChecked;
  const moreActive = !tabs.some((tab) => navActive(tab));
  // A group is open if the Host opened it, or (until they close it) when it holds the current page.
  const groupOpen = (g) => openGroups[g.key] ?? itemActive(g);

  // Pages the club's plan doesn't include: a in the menu, an upgrade card instead of the page.
  const clubPlan = planFor(scoped ? club : null, plan);
  const lockedHref = (href) => !hasFeature(clubPlan, featureForPath(href, scoped ? 'club' : workspace));
  const pageFeature = featureForPath(pathname, scoped ? 'club' : workspace);
  const pageLocked = !!pageFeature && !hasFeature(clubPlan, pageFeature);
  // The plan of the club / community being managed has ended (not the account / list pages).
  const spaceExpired = scoped && !!club && !!clubPlan?.no_plan && clubPlan.features_enforced !== false && !['/account', '/clubs'].some((p) => isActive(p));
  const Gem = ({ href }) => (lockedHref(href) ? <span className="text-gray-400" title={t('plan.locked')} aria-label={t('plan.locked')}><UiIcon name="lock" className="w-3.5 h-3.5" /></span> : null);

  // One way to mark the current page in every shell (manager, player, owner): lime text on
  // a faint lime fill (NAV_ACTIVE). Main menu items (groups and top-level pages) are in CAPITALS, never cut off.
  const linkClass = (active, extra = '') =>
    `flex items-center gap-3 rounded-lg text-sm ${extra} ${active ? NAV_ACTIVE : 'text-gray-300 hover:bg-navy-800'}`;
  const tileClass = (active) => `shrink-0 w-6 h-6 flex items-center justify-center transition-colors ${active ? 'text-lime-300' : 'text-gray-400 group-hover:text-white'}`;
  const headClass = (active) => `group w-full flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${active ? 'text-white' : 'text-gray-200 hover:bg-navy-800/70 hover:text-white'}`;
  const pageClass = (active) => `group w-full flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${active ? NAV_ACTIVE : 'text-gray-200 hover:bg-navy-800/70 hover:text-white'}`;
  const subClass = (active) => `flex items-center gap-2 rounded-lg pl-3 pr-2 py-1.5 text-sm leading-snug transition-colors ${active ? `${NAV_ACTIVE} font-medium` : 'text-gray-400 hover:text-gray-100 hover:bg-navy-800/60'}`;

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside
        ref={sideRef}
        onScroll={(e) => {
          try {
            sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(e.currentTarget.scrollTop));
          } catch {}
        }}
        className={`hidden lg:flex shrink-0 bg-navy-900 border-r border-navy-700 flex-col gap-1 sticky top-0 h-screen overflow-y-auto overflow-x-hidden transition-[width] duration-200 ${
          collapsed ? 'w-16 p-2' : 'w-64 p-4'
        }`}
      >
        <div className={`flex items-center mb-3 ${collapsed ? 'justify-center' : 'justify-between pl-2'}`}>
          {!collapsed && <BrandLogo markClass="h-7" wordClass="h-4" />}
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
              <Link key={item.key} href={item.href} className={pageClass(itemActive(item))} aria-current={itemActive(item) ? 'page' : undefined}>
                <span className={tileClass(itemActive(item))}><Icon name={item.icon} className="w-[18px] h-[18px]" /></span>
                <span className="flex-1 leading-snug break-words">{t(item.key)}</span>
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
                className={headClass(itemActive(item))}
              >
                <span className={tileClass(itemActive(item))}><Icon name={item.icon} className="w-[18px] h-[18px]" /></span>
                <span className="flex-1 text-left leading-snug break-words">{t(item.key)}</span>
                {!open && <Badge n={badges[item.badge]} />}
                <svg viewBox="0 0 24 24" className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
              {open && (
                <div className="ml-[19px] pl-3 border-l border-navy-700 flex flex-col gap-0.5 mt-0.5 mb-2">
                  {item.children.map((c) => (
                    <Link key={c.href} href={c.href} className={subClass(navActive(c))} aria-current={navActive(c) ? 'page' : undefined}>
                      <span className="flex-1">{t(c.key)}</span>
                      <Badge n={badges[c.badge]} />
                      <Gem href={c.href} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="mt-auto flex flex-col gap-2 pt-4">
          {/* Account corner: the bell, the language and sign out together, in one style
              (the bell's list opens beside the sidebar). */}
          {!collapsed && (
            <Link href="/contact" className={`text-sm flex items-center gap-3 px-2 py-2 rounded-lg ${isActive('/contact') ? NAV_ACTIVE : 'text-gray-300 hover:bg-navy-800'}`}>
              <Icon name="chat" className="w-[18px] h-[18px] shrink-0" />
              {t('contact.nav')}
            </Link>
          )}
          {!collapsed && <LangSelect className="w-full" />}
          <div className={`flex gap-2 ${collapsed ? 'flex-col items-center' : 'items-center'}`}>
            {['club', 'xeve'].includes(workspace) && <SignupBell side={collapsed ? 'rail' : 'sidebar'} className="shrink-0" />}
            <ThemeToggle className="shrink-0" />
            {!collapsed && <span className="flex-1" />}
            <button
              onClick={() => signOut()}
              title={t('nav.signOut')}
              aria-label={t('nav.signOut')}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-navy-800 text-gray-200 hover:bg-navy-700"
            >
              <Icon name="signOut" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-navy-900 border-b border-navy-700 pt-safe">
        <div className="flex items-center gap-3 px-4 h-14">
          <Link href="/home" aria-label={t('hub.backHome')} className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-lime-400 bg-navy-800">
            <Icon name="dashboard" className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">{workspace && <ContextSwitcher compact />}</div>
          <ThemeToggle className="shrink-0" />
          {['club', 'xeve'].includes(workspace) && <SignupBell className="shrink-0" />}
        </div>
      </header>

      <main className="flex-1 min-w-0 p-4 lg:p-6 pb-tabbar">
        <AnnouncementBanner className="mb-4" />
        {workspace && workspace !== 'staff' && <SchemaBanner />}
        {suspended ? (
          <div className="max-w-lg mx-auto card mt-4 border-red-400/50" role="alert">
            <h1 className="text-white text-lg font-bold mb-1">{t('owner.suspendedTitle')}</h1>
            <p className="text-gray-300 text-sm">{t('owner.suspendedBody')}</p>
            {suspended.reason && <p className="text-red-200 text-sm mt-2">{t('owner.suspendedReason', { reason: suspended.reason })}</p>}
            <Link href="/home" className="btn-secondary text-sm mt-4 inline-block">{t('owner.suspendedHome')}</Link>
          </div>
        ) : spaceExpired && wsReady ? (
          // The plan of this club (Club plan) / community (Social Manager) ended: every
          // manager page stops until it is renewed (Account and the club list stay open).
          <ExpiredPlan product={mode === 'community' ? 'social_manager' : 'tier'} owner={!coAdmin} until={clubPlan?.paid_until} />
        ) : pageLocked && wsReady && mode === 'community' && pageFeature === 'advanced_analytics' ? (
          // An add-on: asked for in Báo lỗi / Liên hệ nhà phát triển, switched on by the Ban quản trị.
          <div className="max-w-lg mx-auto card mt-4 border-amber-300/50">
            <h1 className="text-white text-lg font-bold mb-1">{t('contact.addonLockedTitle')}</h1>
            <p className="text-gray-300 text-sm">{t('contact.addonLockedBody')}</p>
            <div className="flex justify-end mt-4">
              <Link href="/contact#dev" className="btn-primary text-sm">{t('contact.addonLockedCta')}</Link>
            </div>
          </div>
        ) : coAdmin && COHOST_HIDDEN.includes(pathname) ? (
          <div className="max-w-lg mx-auto card mt-4">
            <h1 className="text-white text-lg font-bold mb-1">{t('cohost.hiddenTitle')}</h1>
            <p className="text-gray-300 text-sm">{t('cohost.hiddenBody')}</p>
            <div className="flex justify-end mt-4"><Link href="/dashboard" className="btn-primary text-sm">{t('cohost.back')}</Link></div>
          </div>
        ) : pageLocked && wsReady ? (
          <LockedFeature feature={pageFeature} owner={!coAdmin} product={mode === 'community' ? 'social_manager' : 'tier'} />
        ) : !wsReady || !workspace ? null : mode === 'xeve' && !clubsLoading && plan && !NO_CLUB_OK.some((p) => isActive(p)) ? (
          <div className="max-w-lg mx-auto mt-4 flex flex-col gap-3">
            {/* No Social Manager yet: one card to buy it. Bought, no community yet: open one. */}
            {!plan.social_manager ? (
              <div className="card"><SocialManagerPanel /></div>
            ) : (
              <div className="card border-amber-300/50">
                <h2 className="text-white font-semibold">{t('social.startTitle')}</h2>
                <p className="text-gray-300 text-sm mt-1 mb-3">{t('social.startBody')}</p>
                <div className="flex justify-end"><Link href="/club-request?kind=community" className="btn-primary"><UiIcon name="plus" className="w-4 h-4" />{t('social.newCommunity')}</Link></div>
              </div>
            )}
          </div>
        ) : needsClub ? (
          <div className="max-w-md mx-auto card mt-4">
            <h1 className="text-white text-xl font-bold mb-1">{t('clubs.createFirst')}</h1>
            <p className="text-gray-400 text-sm mb-4">{t('clubs.createFirstHint')}</p>
            {/* Invited as Co-Admin / staff but the email is not confirmed yet: the grant waits for that. */}
            {user && !user.email_confirmed_at && <p className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/5 px-3 py-2 text-sm text-amber-200">{t('staffView.unverified')}</p>}
            <CreateClubForm autoFocus />
          </div>
        ) : (
          <>
            {coAdmin && (
              <div className="mb-4 flex items-center gap-3 rounded-card bg-navy-800 px-3 py-2">
                <UiIcon name="users" className="w-5 h-5 text-gray-400" />
                <div className="min-w-0 text-sm">
                  <div className="text-white font-semibold break-words">{t(clubRole === 'finance' ? 'coadmin.bannerFinance' : clubRole === 'operator' ? 'coadmin.bannerOperator' : 'coadmin.banner', { name: club?.name || '' })}</div>
                  <div className="text-gray-400 text-sm break-words">{t(clubRole === 'finance' ? 'coadmin.bannerHintFinance' : clubRole === 'operator' ? 'coadmin.bannerHintOperator' : 'coadmin.bannerHint', { owner: club?.owner_email || '—' })}</div>
                </div>
              </div>
            )}
            {/* The plan of this club / community runs out soon: say so on every manager page,
                with the way to renew (when it ends, the manager pages stop). */}
            {scoped && !coAdmin && clubPlan && !clubPlan.no_plan && !(mode !== 'community' && plan?.trial) && clubPlan.paid_until && daysLeft(clubPlan.paid_until) <= 7 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-card bg-warn-bg px-3 py-2 text-sm text-warn-fg">
                <span>{t(mode === 'community' ? 'plan.expiringSoonSm' : 'plan.expiringSoon', { tier: String(clubPlan.tier).toUpperCase(), n: daysLeft(clubPlan.paid_until) })}</span>
                <button type="button" className="btn-secondary !py-1 text-sm" onClick={() => setRenewOpen(true)}>{t('plan.renew')}</button>
              </div>
            )}
            <UpgradeModal open={renewOpen} onClose={() => setRenewOpen(false)} product={mode === 'community' ? 'social_manager' : 'tier'} />
            {back !== false && !TOP_LEVEL.has(pathname) && <BackButton fallback={typeof back === 'string' ? back : backFallback(pathname)} />}
            {children}
          </>
        )}
      <PlanLimitNotice />
      </main>

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button aria-label={t('common.cancel')} className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-navy-900 border-t border-navy-700 rounded-t-2xl p-4 pb-safe-4 flex flex-col gap-1">
            <div className="mx-auto w-10 h-1 rounded-full bg-navy-600 mb-3" />
            <div className="max-h-[60vh] overflow-y-auto flex flex-col gap-1">
              {NAV.map((item) =>
                item.children ? (
                  <div key={item.key} className="mt-3">
                    <p className="px-3 mb-1 text-gray-400 text-sm font-semibold uppercase tracking-wide">{t(item.key)}</p>
                    <div className="flex flex-col gap-0.5">
                      {item.children.map((c) => (
                        <Link
                          key={c.href}
                          href={c.href}
                          className={`min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg text-[0.9375rem] ${navActive(c) ? NAV_ACTIVE : 'text-gray-200'}`}
                        >
                          <Icon name={c.icon} className="w-5 h-5 shrink-0" />
                          <span className="leading-snug flex-1">{t(c.key)}</span>
                          <Badge n={badges[c.badge]} />
                          <Gem href={c.href} />
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg text-[0.9375rem] ${navActive(item) ? NAV_ACTIVE : 'text-gray-200'}`}
                  >
                    <Icon name={item.icon} />
                    <span className="flex-1 leading-snug uppercase tracking-wide font-semibold">{t(item.key)}</span>
                    <Badge n={badges[item.badge]} />
                  </Link>
                )
              )}
            </div>
            <Link href="/contact" className="min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg text-[0.9375rem] text-gray-200 w-full text-left">
              <Icon name="chat" />
              {t('contact.nav')}
            </Link>
            <Link href="/home" className="min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-lg text-[0.9375rem] text-gray-200">
              <Icon name="dashboard" />
              {t('hub.backHome')}
            </Link>
            <div className="flex items-center gap-2 pt-3 mt-2 border-t border-navy-700">
              <LangSelect className="flex-1 min-w-0" />
              <button onClick={() => signOut()} className="btn-secondary shrink-0">
                <Icon name="signOut" className="w-4 h-4" />
                {t('nav.signOut')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-navy-900 border-t border-navy-700 pb-safe">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((item) => {
            const href = item.href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-start gap-0.5 min-h-[4rem] pt-2 pb-1 text-xs leading-tight ${
                  navActive(item) ? 'text-lime-300' : 'text-gray-400'
                }`}
              >
                <span className="relative">
                  <Icon name={item.icon} />
                  <Badge n={badges[item.badge]} className="absolute -top-2 -right-3" />
                </span>
                {/* Two lines of room for every label, so "Lịch hoạt động" never pushes its icon up. */}
                <span className="max-w-full px-0.5 h-8 flex items-start justify-center text-center break-words hyphens-auto">{t(item.key)}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex flex-col items-center justify-start gap-0.5 min-h-[4rem] pt-2 pb-1 text-xs leading-tight ${
              moreOpen || moreActive ? 'text-lime-300' : 'text-gray-400'
            }`}
          >
            <Icon name="more" />
            <span className="h-8 flex items-start justify-center">{t('nav.more')}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
