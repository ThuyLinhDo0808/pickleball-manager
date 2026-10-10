'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import ClubAvatar from '@/components/ClubAvatar';
import { SocialManagerModal } from '@/components/PlanModals';
import Segmented from '@/components/ui/Segmented';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLoad } from '@/lib/useLoad';
import { useEnter } from '@/lib/useEnter';
import { api } from '@/lib/api';
import { formatDay, hhmm, todayYmd } from '@/lib/dates';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import PlayerNotices from '@/components/PlayerNotices';

// One tile of the "spaces" strip: a club (managed or played in), Xé Vé, staff, or "+".
function SpaceTile({ onClick, href, avatar, label, badge, badgeTone }) {
  const body = (
    <>
      {avatar}
      <span className="mt-1.5 w-full text-center text-white text-xs font-semibold leading-tight line-clamp-2">{label}</span>
      {badge && <span className={`mt-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeTone}`}>{badge}</span>}
    </>
  );
  const cls = 'flex w-24 shrink-0 snap-start flex-col items-center rounded-2xl p-2 hover:bg-navy-800 transition';
  return href ? (
    <Link href={href} className={cls}>{body}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{body}</button>
  );
}

const ROLE_TONE = {
  owner: 'bg-lime-400 text-navy-950',
  co_admin: 'bg-sky-400 text-navy-950',
  finance: 'bg-emerald-400 text-navy-950',
  operator: 'bg-violet-400 text-navy-950',
  member: 'bg-navy-700 text-gray-200',
  xeve: 'bg-amber-300 text-navy-950',
  staff: 'bg-orange-400 text-navy-950',
};

const STATUS_TONE = {
  registered: 'border-lime-400/60 text-lime-300',
  checked_in: 'border-lime-400/60 text-lime-300',
  pending: 'border-yellow-400/60 text-yellow-300',
  waitlisted: 'border-sky-400/60 text-sky-300',
};

// Home hub: every role of the account side by side. A club you run opens its manager
// pages; a club you play in opens its member page; Xé Vé and staff have their own tiles.
export default function HomeHub() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { staffInfo, plan } = useWorkspace();
  const { manageClub, space, memberClub } = useEnter();
  const { data, loading } = useLoad(() => (user ? api.get('/api/player/home') : Promise.resolve(null)), [user?.id]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const router = useRouter();
  // New accounts first say which sports they play and whether they run a club.
  useEffect(() => {
    if (data && data.onboarded === false) router.replace('/onboarding');
  }, [data, router]);
  const [smOpen, setSmOpen] = useState(false);

  const days = useMemo(() => {
    const list = (data?.upcoming || []).filter((e) => filter === 'all' || (filter === 'xeve' ? !e.club_id : e.club_id === filter));
    const out = [];
    for (const e of list) {
      const last = out[out.length - 1];
      if (last && last.date === e.event_date) last.items.push(e);
      else out.push({ date: e.event_date, items: [e] });
    }
    return out;
  }, [data, filter]);

  if (loading && !data) return <PlayerShell><p className="text-gray-400">{t('common.loading')}</p></PlayerShell>;
  if (!data) return <PlayerShell><p className="text-gray-400">{t('public.loadError')}</p></PlayerShell>;

  // People are called by their username when they have one (never by their email).
  const name = data.username || data.profile?.full_name || String(data.email || '').split('@')[0];
  const cr = data.club_request;
  const managed = data.managed_clubs;
  const member = data.member_clubs;
  const isStaff = !!staffInfo?.is_staff;
  const hasAnything = managed.length || member.length;
  const today = todayYmd();
  const clubFilters = [...new Map((data.upcoming || []).filter((e) => e.club_id).map((e) => [e.club_id, e.club_name])).entries()];
  const hasXeveUpcoming = (data.upcoming || []).some((e) => !e.club_id);

  return (
    <PlayerShell>
      <AnnouncementBanner className="mb-4" />
      <PlayerNotices notices={data.notices || []} />
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="text-gray-400 text-sm">{t(`hub.greet_${new Date().getHours() < 11 ? 'morning' : new Date().getHours() < 18 ? 'day' : 'evening'}`)}</p>
          <h1 className="text-white text-2xl font-bold truncate">{t('hub.hello', { name })}</h1>
        </div>
        <Link href="/p/profile" className="shrink-0" aria-label={t('hub.navProfile')}>
          {data.profile?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.profile.avatar} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-lime-400" />
          ) : (
            <span className="w-12 h-12 rounded-full bg-navy-700 flex items-center justify-center text-lime-400 text-lg font-bold">{String(name || '?').slice(0, 1).toUpperCase()}</span>
          )}
        </Link>
      </div>

      {(!data.profile || !data.profile.birth_date) && (
        <Link href="/p/profile" className="card block mb-4 border-lime-400/50 text-lime-300 text-sm">
          {data.profile ? t('player.needBirthDate') : t('player.completeProfile')}
        </Link>
      )}

      {/* Find a club: by name, place or area -> /discover */}
      <form
        onSubmit={(e) => { e.preventDefault(); router.push(`/discover${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`); }}
        className="card !p-3 mb-4 flex items-center gap-2"
        role="search"
      >
        <span className="text-xl" aria-hidden="true">🔍</span>
        <input
          className="input !py-2 flex-1 min-w-0"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('disc.homePh')}
          aria-label={t('disc.homeTitle')}
        />
        <button className="btn-primary !py-2 shrink-0">{t('disc.search')}</button>
      </form>

      {cr && (cr.status === 'pending' || (cr.status !== 'cancelled' && cr.decided_at && Date.now() - Date.parse(cr.decided_at) < 14 * 86400000)) && (
        <Link href="/club-request" className={`card block mb-4 text-sm ${cr.status === 'approved' ? 'border-lime-400/50' : cr.status === 'rejected' ? 'border-red-400/50' : 'border-amber-300/50'}`}>
          <span className="font-semibold text-white">🏟 {cr.name}</span>
          <span className="text-gray-300"> · {t(`creq.status_${cr.status}`)}</span>
          <span className="block text-gray-400 text-xs mt-0.5">{t(`creq.homeHint_${cr.status}`)}</span>
        </Link>
      )}

      {data.surveys_due?.length > 0 && (
        <Link href={`/s/${data.surveys_due[0].token}`} className="card block mb-4 border-lime-400/40 text-sm">
          <span className="text-lime-300 font-semibold">🙏 {t('survey.portalTitle')}</span>
          <span className="text-gray-300"> · {data.surveys_due[0].title}</span>
          <span className="text-lime-400 ml-1">→</span>
        </Link>
      )}

      {/* Spaces */}
      <section className="mb-6">
        <div className="flex items-end justify-between gap-2 mb-2">
          <h2 className="text-white font-semibold">{t('hub.spaces')}</h2>
          <span className="text-gray-500 text-xs hidden sm:block">{t('hub.spacesHint')}</span>
        </div>
        <div className="-mx-4 px-2 sm:mx-0 sm:px-0 flex gap-1 overflow-x-auto overflow-y-hidden no-scrollbar snap-x pb-1">
          {managed.map((c) => (
            <SpaceTile
              key={`m${c.club_id}`}
              onClick={() => manageClub(c.club_id)}
              avatar={<ClubAvatar id={c.club_id} name={c.name} sport={c.sport} ring="ring-2 ring-lime-400/70 ring-offset-2 ring-offset-navy-950" />}
              label={c.name}
              badge={t({ owner: 'hub.roleOwner', finance: 'hub.roleFinance', operator: 'hub.roleOperator' }[c.role] || 'hub.roleCoAdmin')}
              badgeTone={ROLE_TONE[c.role]}
            />
          ))}
          {member.map((c) => (
            <SpaceTile
              key={`p${c.club_id}`}
              onClick={() => memberClub(c.club_id)}
              avatar={<ClubAvatar id={c.club_id} name={c.name} sport={c.sport} />}
              label={c.name}
              badge={t('hub.roleMember')}
              badgeTone={ROLE_TONE.member}
            />
          ))}
          <SpaceTile
            href="/club-request"
            avatar={<ClubAvatar icon="＋" />}
            label={t('hub.createClub')}
          />
        </div>
        {!hasAnything && (
          <p className="card text-gray-300 text-sm mt-2">
            {t('hub.emptySpaces')} <Link href="/discover" className="text-lime-300 underline">{t('disc.findLink')}</Link>
          </p>
        )}
        {/* Hosts: Social Manager (xé vé) is a paid add-on — enter it, or see what it offers and sign up. */}
        {managed.some((c) => c.role === 'owner') && (
          <button
            type="button"
            onClick={() => (plan?.social_manager ? space('xeve') : setSmOpen(true))}
            className="mt-3 w-full card !py-3 flex items-center gap-3 text-left text-sm hover:border-amber-300/60"
          >
            <span className="text-xl" aria-hidden="true">🎟</span>
            <span className="flex-1 min-w-0">
              <span className="block text-white font-semibold">{t('hub.socialManager')}</span>
              <span className="block text-gray-400 text-xs">{plan?.social_manager ? t('hub.smEnter') : plan?.social_manager_requested_at ? t('plan.smRequested') : t('hub.smSignUpShort')}</span>
            </span>
            {plan?.social_manager ? (
              <span className="text-lime-400">→</span>
            ) : plan?.social_manager_requested_at ? (
              <span className="text-amber-300 shrink-0" aria-hidden="true">⏳</span>
            ) : (
              <span className="rounded-full bg-amber-300 text-navy-950 text-[11px] font-bold px-2 py-0.5 uppercase shrink-0">{t('plan.smSignUp')}</span>
            )}
          </button>
        )}
        {isStaff && (
          <button type="button" onClick={() => space('staff')} className="mt-3 w-full card !py-3 flex items-center gap-3 text-left text-sm hover:border-orange-400/60">
            <span className="text-xl" aria-hidden="true">🦺</span>
            <span className="flex-1 text-gray-200">{t('hub.staffCard')}</span>
            <span className="text-lime-400">→</span>
          </button>
        )}
      </section>

      {/* Member clubs at a glance */}
      {member.length > 0 && (
        <section className="mb-6">
          <h2 className="text-white font-semibold mb-2">{t('hub.myMemberships')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {member.map((c) => (
              <button key={c.club_id} type="button" onClick={() => memberClub(c.club_id)} className="card !p-3 flex items-center gap-3 text-left hover:border-lime-400/60 transition">
                <ClubAvatar id={c.club_id} name={c.name} sport={c.sport} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block text-white font-semibold truncate">{c.name}</span>
                  <span className="block text-gray-400 text-xs">
                    {c.member_type === 'fixed' ? t('members.fixed') : t('members.guest')}
                    {c.current_period ? ` · ${c.current_period}` : ''}
                    {c.account_verified === false && <span className="text-yellow-300"> · ⏳ {t('verify.pendingPlayer')}</span>}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-lime-400 text-xl font-bold tabular-nums">
                    {c.membership_state === 'active' ? (c.sessions_unlimited ? '∞' : c.sessions_remaining) : '—'}
                  </span>
                  <span className="block text-gray-500 text-[11px]">{t('player.sessionsLeft')}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* My upcoming sessions, by day */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-white font-semibold">{t('hub.upcoming')}</h2>
          {(clubFilters.length > 1 || (clubFilters.length > 0 && hasXeveUpcoming)) && (
            <Segmented
              items={['all', ...clubFilters.map(([id]) => id), ...(hasXeveUpcoming ? ['xeve'] : [])]}
              value={filter}
              onChange={setFilter}
              label={(k) => (k === 'all' ? t('hub.all') : k === 'xeve' ? t('hub.oneOff') : clubFilters.find(([id]) => id === k)?.[1])}
            />
          )}
        </div>
        {days.length === 0 && (
          <div className="card text-center py-8">
            <div className="text-4xl mb-2" aria-hidden="true">📅</div>
            <p className="text-gray-300 text-sm">{t('hub.noUpcoming')}</p>
            {member.length > 0 && <p className="text-gray-500 text-xs mt-1">{t('hub.noUpcomingHint')}</p>}
          </div>
        )}
        <div className="flex flex-col gap-4">
          {days.map((d) => (
            <div key={d.date} className="rounded-2xl border border-navy-700 bg-navy-900/60 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-dashed border-navy-600 text-white font-semibold capitalize">
                {d.date === today ? t('hub.today') : formatDay(d.date, lang, { weekday: 'long', day: 'numeric', month: 'numeric' })}
              </div>
              <ul className="divide-y divide-navy-700">
                {d.items.map((e) => (
                  <li key={e.event_id}>
                    <Link href={e.ticket_code ? `/t/${e.ticket_code}` : e.link ? `/e/${e.link}` : e.club_id ? `/c/${e.club_id}` : '/p'} className="flex items-start gap-3 px-4 py-3 hover:bg-navy-800/60">
                      <span className="w-14 shrink-0 text-gray-300 text-lg font-bold tabular-nums">{e.start_time ? hhmm(e.start_time) : '—'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-white font-semibold leading-snug">{e.title}</span>
                        <span className="block text-gray-400 text-xs truncate">{[e.club_name || t('hub.oneOff'), e.location].filter(Boolean).join(' · ')}</span>
                        <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[e.status] || 'border-navy-600 text-gray-300'}`}>
                          {t(`player.status_${e.status}`)}
                          {e.ticket_code ? ` · 🎟 ${t('pp.ticket')}` : ''}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1.5 shrink-0">
                        {e.slots ? <span className="rounded-full bg-navy-700 px-2 py-0.5 text-xs text-gray-200 tabular-nums">{e.main_count}/{e.slots}</span> : null}
                        {e.club_id ? <ClubAvatar id={e.club_id} name={e.club_name} size={30} /> : <ClubAvatar icon="🎟" size={30} />}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <SocialManagerModal open={smOpen} onClose={() => setSmOpen(false)} />
    </PlayerShell>
  );
}
