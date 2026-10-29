'use client';
import { peekReturn } from '@/lib/returnTo';
import { QuickProfileModal, QuickBirthModal } from '@/components/QuickProfileModal';
import { useEffect, useMemo, useState } from 'react';
import MyBookings from '@/components/MyBookings';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import { formatVnd } from '@/lib/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import ClubAvatar from '@/components/ClubAvatar';
import Segmented from '@/components/ui/Segmented';
import UiIcon from '@/components/ui/UiIcon';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLoad } from '@/lib/useLoad';
import { useEnter } from '@/lib/useEnter';
import { api } from '@/lib/api';
import { formatDay, hhmm, todayYmd } from '@/lib/dates';
import PlayerNotices from '@/components/PlayerNotices';
import LinkRequests from '@/components/LinkRequests';
import Hint from '@/components/ui/Hint';

// One space (a club you run or play in, a community, or "+"): a compact row with the
// avatar, the name and the role under it. Rows sit in a grid that adds columns as the
// screen gets wider, so nothing overlaps on any screen.
function SpaceTile({ onClick, href, avatar, label, badge, badgeTone, dashed = false }) {
  const body = (
    <>
      <span className="shrink-0">{avatar}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-white text-sm font-semibold leading-snug break-words">{label}</span>
        {badge && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${badgeTone}`}>{badge}</span>}
      </span>
    </>
  );
  const cls = `flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition hover:border-lime-400/70 ${dashed ? 'border-dashed border-navy-600' : 'border-navy-700 bg-navy-800/60'}`;
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
  operator: 'bg-navy-700 text-navy-950',
  member: 'bg-navy-700 text-gray-200',
  xeve: 'bg-amber-300 text-navy-950',
  staff: 'bg-orange-400 text-navy-950',
};

const STATUS_TONE = {
  registered: 'border-lime-400/60 text-lime-300',
  checked_in: 'border-lime-400/60 text-lime-300',
  pending: 'border-yellow-400/60 text-yellow-300',
  waitlisted: 'border-navy-600 text-gray-300',
};

// Home hub: every role of the account side by side. A club you run opens its manager
// pages; a club you play in opens its member page; Xé Vé and staff have their own tiles.
export default function HomeHub() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { staffInfo } = useWorkspace();
  const { manageClub, space, memberClub } = useEnter();
  const { data, loading, reload } = useLoad(() => (user ? api.get('/api/player/home') : Promise.resolve(null)), [user?.id]);
  const [filter, setFilter] = useState('all');
  const [fixOpen, setFixOpen] = useState(null); // 'profile' | 'birth': missing info pop-up
  const router = useRouter();
  // New accounts first say which sports they play and whether they run a club.
  useEffect(() => {
    if (data && data.onboarded === false) router.replace('/onboarding');
    // Signed up from a club invite / kèo link (and confirmed from the email): back to it.
    else if (data) {
      const back = peekReturn();
      if (back) router.replace(back);
    }
  }, [data, router]);

  // "Đã duyệt" (club / community request) is news once: shown on the first visit after the
  // approval, then not again on this device.
  const [approvedNew, setApprovedNew] = useState(false);
  const crId = data?.club_request?.status === 'approved' ? data.club_request.id : null;
  useEffect(() => {
    if (!crId) return;
    const k = `pb_creq_seen_${crId}`;
    try {
      if (window.localStorage.getItem(k)) return;
      window.localStorage.setItem(k, String(Date.now()));
    } catch {
      /* no storage: show it this time */
    }
    setApprovedNew(true);
  }, [crId]);

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

  if (loading && !data) return <PlayerShell><LoadingBlock rows={4} className="card" /></PlayerShell>;
  if (!data) return <PlayerShell><ErrorBlock message={t('public.loadError')} onRetry={reload} /></PlayerShell>;

  // People are called by their username when they have one (never by their email).
  const name = data.username || data.profile?.full_name || String(data.email || '').split('@')[0];
  const cr = data.club_request;
  // The first thing a player wants to know: when and where is my next game.
  const nextUp = (data.upcoming || [])[0];
  const nextHref = nextUp ? (nextUp.ticket_code ? `/t/${nextUp.ticket_code}` : nextUp.link ? `/e/${nextUp.link}` : nextUp.club_id ? `/c/${nextUp.club_id}` : '/p') : null;
  const managed = data.managed_clubs;
  const member = data.member_clubs;
  const isStaff = !!staffInfo?.is_staff;
  const hasAnything = managed.length || member.length;
  const today = todayYmd();
  const clubFilters = [...new Map((data.upcoming || []).filter((e) => e.club_id).map((e) => [e.club_id, e.club_name])).entries()];
  const hasXeveUpcoming = (data.upcoming || []).some((e) => !e.club_id);

  return (
    <PlayerShell>
      <PlayerNotices notices={data.notices || []} />
      <LinkRequests onChanged={reload} />
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="text-gray-400 text-sm">{t(`hub.greet_${new Date().getHours() < 11 ? 'morning' : new Date().getHours() < 18 ? 'day' : 'evening'}`)}</p>
          <h1 className="text-white text-2xl font-bold break-words">{t('hub.hello', { name })}</h1>
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

      {nextUp && (
        <section className="card mb-5" aria-labelledby="next-up">
          <h2 id="next-up" className="text-gray-400 text-sm">{t('hub.nextUp')}</h2>
          <div className="mt-1 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white text-xl font-bold leading-snug break-words">{nextUp.title}</p>
              <p className="text-gray-200 text-base mt-0.5 capitalize tabular-nums">
                {nextUp.event_date === today ? t('hub.today') : formatDay(nextUp.event_date, lang, { weekday: 'long', day: 'numeric', month: 'numeric' })}
                {nextUp.start_time ? ` · ${hhmm(nextUp.start_time)}` : ''}
              </p>
              <p className="text-gray-400 text-sm break-words">{[nextUp.club_name || t('hub.oneOff'), nextUp.location].filter(Boolean).join(' · ')}</p>
            </div>
            <Link href={nextHref} className="btn-primary shrink-0 self-end">{nextUp.ticket_code ? t('hub.nextOpenTicket') : t('hub.nextOpen')}</Link>
          </div>
        </section>
      )}

      {(!data.profile || !data.profile.birth_date) && (
        <button type="button" onClick={() => setFixOpen(data.profile ? 'birth' : 'profile')} className="card block w-full text-left mb-4 border-lime-400/50 text-lime-300 text-sm">
          {data.profile ? t('player.needBirthDate') : t('player.completeProfile')} →
        </button>
      )}


      {cr && (cr.status === 'pending' || (cr.status === 'approved' ? approvedNew : cr.status !== 'cancelled' && cr.decided_at && Date.now() - Date.parse(cr.decided_at) < 14 * 86400000)) && (
        <Link href="/club-request" className={`card block mb-4 text-sm ${cr.status === 'approved' ? 'border-lime-400/50' : cr.status === 'rejected' ? 'border-red-400/50' : 'border-amber-300/50'}`}>
          <span className="font-semibold text-white">{cr.name}</span>
          <span className="text-gray-300"> · {t(`creq.status_${cr.status}`)}</span>
          <span className="block text-gray-400 text-xs mt-0.5">{t(cr.kind === 'community' && ['pending', 'approved'].includes(cr.status) ? `creq.homeHintCommunity_${cr.status}` : `creq.homeHint_${cr.status}`)}</span>
        </Link>
      )}

      {data.surveys_due?.length > 0 && (
        <div className="card flex items-center gap-2 mb-4 border-lime-400/40 text-sm !py-2 !pr-2">
          <Link href={`/s/${data.surveys_due[0].token}`} className="flex-1 min-w-0 py-1">
            <span className="text-lime-300 font-semibold">{t('survey.portalTitle')}</span>
            <span className="text-gray-300"> · {data.surveys_due[0].title}</span>
            <span className="text-lime-400 ml-1">→</span>
          </Link>
          <button
            type="button"
            className="shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-navy-700"
            aria-label={t('survey.skip')}
            title={t('survey.skip')}
            onClick={() => api.publicPost(`/api/public/surveys/${data.surveys_due[0].token}/skip`, {}).then(() => reload()).catch(() => {})}
          >
            ✕
          </button>
        </div>
      )}

      {/* Spaces */}
      <section className="mb-6">
        <div className="flex items-end justify-between gap-2 mb-2">
          <h2 className="text-white font-semibold">{t('hub.spaces')}</h2>
          <span className="text-gray-500 text-xs hidden sm:block">{t('hub.spacesHint')}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {managed.map((c) => (
            <SpaceTile
              key={`m${c.club_id}`}
              onClick={() => manageClub(c.club_id)}
              avatar={<ClubAvatar id={c.club_id} name={c.name} sport={c.sport} size={36} />}
              label={c.name}
              badge={`${t({ owner: 'hub.roleOwner', finance: 'hub.roleFinance', operator: 'hub.roleOperator' }[c.role] || 'hub.roleCoAdmin')}`}
              badgeTone={ROLE_TONE[c.role]}
            />
          ))}
          {member.map((c) => (
            <SpaceTile
              key={`p${c.club_id}`}
              onClick={() => memberClub(c.club_id)}
              avatar={<ClubAvatar id={c.club_id} name={c.name} sport={c.sport} size={36} />}
              label={c.name}
              badge={t('hub.roleMember')}
              badgeTone={ROLE_TONE.member}
            />
          ))}
          {/* Club or play community (Social Manager): the request form asks which one first. */}
          <SpaceTile
            href="/club-request"
            avatar={<ClubAvatar icon="＋" size={36} />}
            label={t('hub.createClub')}
            dashed
          />
        </div>
        {!hasAnything && (
          <p className="card text-gray-300 text-sm mt-2">
            {t('hub.emptySpaces')} <Link href="/discover" className="text-lime-300 underline">{t('disc.findLink')}</Link>
          </p>
        )}
        {isStaff && (
          <button type="button" onClick={() => space('staff')} className="mt-3 w-full card !py-3 flex items-center gap-3 text-left text-sm hover:border-orange-400/60">
            <span className="text-gray-400"><UiIcon name="shield" className="w-5 h-5" /></span>
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
                  <span className="block text-white font-semibold break-words">{c.name}</span>
                  <span className="block text-gray-400 text-xs">
                    {c.member_type === 'fixed' ? t('members.fixed') : t('members.guest')}
                    {c.current_period ? ` · ${c.current_period}` : ''}
                    {c.account_verified === false && <span className="text-yellow-300"> · {t('verify.pendingPlayer')}</span>}
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

      {/* The next 3 days of my clubs / communities, signed up or not */}
      {member.length > 0 && (
        <section className="mb-6">
          <h2 className="text-white font-semibold mb-2">{t('findx.soonTitle')}</h2>
          {!(data.club_soon || []).length ? (
            <p className="card text-gray-400 text-sm">{t('findx.soonNone')}</p>
          ) : (
            <ul className="rounded-2xl border border-navy-700 bg-navy-900/60 divide-y divide-navy-700 overflow-hidden">
              {data.club_soon.map((e) => (
                <li key={e.event_id}>
                  <Link href={e.link ? `/e/${e.link}` : `/c/${e.club_id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-navy-800/60">
                    <span className="w-16 shrink-0">
                      <span className="block text-gray-400 text-[11px] capitalize leading-tight">{e.event_date === today ? t('hub.today') : formatDay(e.event_date, lang, { weekday: 'short', day: 'numeric', month: 'numeric' })}</span>
                      <span className="block text-gray-200 font-bold tabular-nums">{e.start_time ? hhmm(e.start_time) : '—'}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-white text-sm font-semibold leading-snug break-words">{e.title}</span>
                      <span className="block text-gray-400 text-xs break-words">{[e.club_name, e.location].filter(Boolean).join(' · ')}</span>
                      <span className="block text-xs mt-0.5">
                        {e.my_status ? (
                          <span className="text-lime-300">✓ {t(`player.status_${e.my_status}`)}</span>
                        ) : e.status === 'closed' ? (
                          <span className="text-gray-400">{t('findx.closed')}</span>
                        ) : (
                          <span className="text-lime-400">{e.link ? t('findx.signUp') : t('findx.view')} →</span>
                        )}
                        {Number(e.fee_amount) > 0 && <span className="text-gray-400"> · {formatVnd(e.fee_amount)}</span>}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1.5 shrink-0">
                      {e.slots ? <span className="rounded-full bg-navy-700 px-2 py-0.5 text-xs text-gray-200 tabular-nums">{e.main_count}/{e.slots}</span> : null}
                      <ClubAvatar id={e.club_id} name={e.club_name} size={30} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Quick bookings (link đặt nhanh): tickets / QR to open again. */}
      <MyBookings signedIn />

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
            <div className="mb-2 flex justify-center text-gray-500"><UiIcon name="calendar" className="w-8 h-8" /></div>
            <p className="text-gray-300 text-sm">{t('hub.noUpcoming')}</p>
            {member.length > 0 && <Hint text={t('hub.noUpcomingHint')} className="mt-1" />}
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
                        <span className="block text-gray-400 text-xs break-words">{[e.club_name || t('hub.oneOff'), e.location].filter(Boolean).join(' · ')}</span>
                        <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[e.status] || 'border-navy-600 text-gray-300'}`}>
                          {t(`player.status_${e.status}`)}
                          {e.ticket_code ? ` · ${t('pp.ticket')}` : ''}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1.5 shrink-0">
                        {e.slots ? <span className="rounded-full bg-navy-700 px-2 py-0.5 text-xs text-gray-200 tabular-nums">{e.main_count}/{e.slots}</span> : null}
                        {e.club_id ? <ClubAvatar id={e.club_id} name={e.club_name} size={30} /> : <ClubAvatar icon={<UiIcon name="ticket" className="w-4 h-4" />} size={30} />}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <QuickProfileModal open={fixOpen === 'profile'} onClose={() => setFixOpen(null)} onSaved={reload} />
      <QuickBirthModal open={fixOpen === 'birth'} onClose={() => setFixOpen(null)} onSaved={reload} />
    </PlayerShell>
  );
}
