'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import ClubAvatar from '@/components/ClubAvatar';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import Segmented from '@/components/ui/Segmented';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import ClubLeaderboard from '@/components/ClubLeaderboard';
import RaceBoard from '@/components/RaceBoard';
import LeaveClub from '@/components/LeaveClub';
import { useI18n } from '@/context/I18nContext';
import { translate } from '@/lib/i18n/core';
import MapLink from '@/components/MapLink';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm, todayYmd } from '@/lib/dates';
import { formatVnd } from '@/lib/format';
import Hint from '@/components/ui/Hint';
import UiIcon from '@/components/ui/UiIcon';

const PAY_STYLE = { paid: 'text-lime-400', pending: 'text-yellow-300', overdue: 'text-red-300' };
const MY_TONE = {
  registered: 'bg-lime-400/15 text-lime-300 border-lime-400/50',
  checked_in: 'bg-lime-400/15 text-lime-300 border-lime-400/50',
  pending: 'bg-yellow-400/10 text-yellow-300 border-yellow-400/50',
  waitlisted: 'bg-sky-400/10 text-sky-300 border-sky-400/50',
};

const PHASES = ['done', 'live', 'soon', 'later'];
const SOON_DAYS = 7;
// Where a session is in time (the device's clock): over, on now, within SOON_DAYS, or later.
// No end time = 2 hours; an end before the start = past midnight.
function phaseOf(e, now) {
  const at = (hm) => new Date(`${e.event_date}T${String(hm).slice(0, 5)}:00`);
  const start = at(e.start_time || '00:00');
  let end = e.end_time ? at(e.end_time) : new Date(start.getTime() + (e.start_time ? 2 : 24) * 3600e3);
  if (end <= start) end = new Date(end.getTime() + 86400e3);
  if (now >= end) return 'done';
  if (now >= start) return 'live';
  return start - now <= SOON_DAYS * 86400e3 ? 'soon' : 'later';
}

// A club seen by one of its members (not its managers): my pass, the club's
// sessions by time (sign up with one tap), my sign-ups, my history there and the club's rankings.
export default function MemberClubPage() {
  const { clubId } = useParams();
  const router = useRouter();
  const { t: tBase, lang } = useI18n();
  // A community reads as one ("Lịch cộng đồng", thường xuyên / vãng lai), set once the data is in.
  let t = tBase;
  const { data, loading, error, setData } = useLoad(() => api.get(`/api/player/clubs/${clubId}`), [clubId]);
  const [voteError, setVoteError] = useState('');
  // Meetings: one tap to say I'm coming / not coming (tap again to take it back).
  async function vote(e, choice) {
    setVoteError('');
    try {
      const r = await api.post(`/api/player/events/${e.id}/vote`, { choice: e.my_vote === choice ? null : choice });
      setData((d) => ({ ...d, events: d.events.map((x) => (x.id === e.id ? { ...x, ...r } : x)) }));
    } catch (err) {
      setVoteError(err.message);
    }
  }
  const [tab, setTab] = useState('schedule');
  const [phase, setPhase] = useState(null); // schedule filter; null = first group with sessions
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (loading && !data) return <PlayerShell><p className="text-gray-400">{t('common.loading')}</p></PlayerShell>;
  if (error || !data) {
    return (
      <PlayerShell>
        <div className="card text-center py-8">
          <p className="text-gray-300 mb-3">{t('hub.notMember')}</p>
          <Link href="/home" className="btn-primary text-sm">← {t('hub.navHome')}</Link>
        </div>
      </PlayerShell>
    );
  }

  const { club, member } = data;
  const community = club.kind === 'community';
  if (community) t = (key, params) => translate(lang, key, params, club.sport, 'community');
  const today = todayYmd();
  // Schedule split by time: done / on now / within SOON_DAYS / later.
  const groups = { done: [], live: [], soon: [], later: [] };
  for (const e of [...(data.past_events || []), ...data.events]) groups[phaseOf(e, now)].push(e);
  groups.done.sort((a, b) => `${b.event_date}${b.start_time || ''}`.localeCompare(`${a.event_date}${a.start_time || ''}`));
  const shownPhase = phase || ['live', 'soon', 'later', 'done'].find((k) => groups[k].length) || 'soon';
  const shown = groups[shownPhase];
  const sessionsLeft = data.membership_state === 'active' ? (data.sessions_unlimited ? '∞' : data.sessions_remaining) : '—';

  return (
    <PlayerShell sport={club.sport} back={false}>
      <Link href="/home" className="text-gray-400 text-sm hover:text-white inline-block mb-3">← {t('hub.navHome')}</Link>

      <section className="card !p-0 overflow-hidden mb-4">
        <div className="h-16 bg-navy-800 " />
        <div className="px-4 pb-4 -mt-8 flex items-end gap-3">
          <ClubAvatar id={club.id} name={club.name} sport={club.sport} size={72} ring="ring-4 ring-navy-800" />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-white text-xl font-bold break-words">{club.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs">
              <span className="rounded-full bg-navy-700 px-2 py-0.5 font-bold text-gray-200">{t('hub.roleMember')}</span>
              <span className="text-gray-400">{member.member_type === 'fixed' ? t('members.fixed') : t('members.guest')}</span>
              {community && data.membership_state === 'active' && <span className="rounded-full bg-amber-300/20 px-2 py-0.5 font-bold text-amber-200">{t('social.vip')}</span>}
              {community && member.guest_perk && <span className="rounded-full bg-lime-400/15 px-2 py-0.5 font-bold text-lime-200">{t('social.priority')}</span>}
              {member.account_verified === false && <span className="text-yellow-300">{t('verify.pendingPlayer')}</span>}
            </div>
          </div>
        </div>
        {(club.description || club.contact || club.address || club.map_url) && (
          <div className="px-4 pb-4 text-sm text-gray-300">
            {club.description && <p className="mb-1">{club.description}</p>}
            {(club.address || club.map_url) && <p className="mb-1"><MapLink location={club.address} mapUrl={club.map_url} /></p>}
            {club.contact && <p className="text-gray-500 text-xs">{t('hub.contact')}: {club.contact}</p>}
          </div>
        )}
      </section>

      <KpiRow cols={4}>
        <StatTile icon="ticket" label={t('player.sessionsLeft')} value={sessionsLeft} tone="text-lime-300" sub={data.current_period || t(`membership.state_${data.membership_state}`)} />
        <StatTile icon="calendar" label={t('hub.mySignups')} value={data.my_upcoming.length} tone="text-sky-300" sub={t('hub.upcomingShort')} />
        <StatTile icon="checkCircle" label={t('player.eventsPlayed')} value={data.stats.played} />
        <StatTile icon="money" label={t('player.debt')} value={data.debt ? formatVnd(data.debt) : t('player.noDebt')} tone={data.debt ? 'text-yellow-300' : 'text-gray-300'} />
      </KpiRow>

      <UnderlineTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'schedule', label: t('hub.tabSchedule'), icon: 'calendar', count: data.events.length },
          { key: 'pass', label: t('hub.tabPass'), icon: 'ticket' },
          { key: 'history', label: t('hub.tabHistory'), icon: 'clock', count: data.history.length },
          { key: 'rankings', label: t('hub.tabRankings'), icon: 'medal' },
          ...(data.club.kind === 'community' ? [{ key: 'race', label: t('race.tab'), icon: 'trophy' }] : []),
        ]}
      />

      {tab === 'schedule' && (
        <div className="flex flex-col gap-2">
          {/* Sắp tới / Đang diễn ra / Đã qua: one segmented row of equal cells. */}
          <Segmented
            full
            className="mb-1 w-full"
            items={PHASES}
            value={shownPhase}
            onChange={setPhase}
            label={(k) => (
              <>
                {k === 'live' && groups.live.length ? <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-400 align-middle animate-pulse" aria-hidden="true" /> : null}
                {t(`hub.phase_${k}`)} <span className="tabular-nums opacity-70">{groups[k].length}</span>
              </>
            )}
          />
          <p className="text-gray-500 text-xs -mt-1 mb-1">{t(`hub.phaseHint_${shownPhase}`, { n: SOON_DAYS })}</p>
          {shown.length === 0 && <p className="card text-gray-400 text-sm">{t(`hub.phaseEmpty_${shownPhase}`)}</p>}
          {voteError && <p className="text-red-400 text-sm">{voteError}</p>}
          {shown.map((e) => {
            const full = e.slots && e.main_count >= e.slots;
            const ended = shownPhase === 'done';
            // The whole card opens the kèo (sign-up, my ticket, Lịch chơi) — or the meeting's
            // vote page; links and buttons inside the card keep their own job.
            const href = e.public_token ? (e.kind === 'meeting' ? `/v/${e.public_token}` : `/e/${e.public_token}`) : null;
            const open = (ev) => {
              if (!href || ev.target.closest('a, button')) return;
              router.push(href);
            };
            return (
              <div
                key={e.id}
                role={href ? 'link' : undefined}
                tabIndex={href ? 0 : undefined}
                aria-label={href ? `${e.title} · ${formatDay(e.event_date, lang)}` : undefined}
                onClick={open}
                onKeyDown={(ev) => href && ev.key === 'Enter' && ev.target === ev.currentTarget && router.push(href)}
                className={`card !p-0 overflow-hidden flex ${href ? 'cursor-pointer transition-colors hover:border-lime-400/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400' : ''}`}
              >
                <div className="w-16 shrink-0 flex flex-col items-center justify-center border-r border-navy-700 bg-navy-900 py-3">
                  <span className="text-[11px] text-gray-400">{formatDay(e.event_date, lang, { weekday: 'short' })}</span>
                  <span className="text-white text-2xl font-bold leading-none">{Number(e.event_date.slice(8, 10))}</span>
                  <span className="text-[11px] text-gray-500">{e.event_date === today ? t('hub.today') : `${e.event_date.slice(5, 7)}/${e.event_date.slice(0, 4)}`}</span>
                </div>
                <div className="min-w-0 flex-1 p-3">
                  <div className="text-white font-semibold break-words">
                    {shownPhase === 'live' && <span className="mr-1.5 rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-bold text-red-200 align-middle">● {t('hub.phase_live')}</span>}
                    {e.title}
                  </div>
                  <div className="text-gray-400 text-xs break-words">
                    {e.start_time ? `${hhmm(e.start_time)}${e.end_time ? `–${hhmm(e.end_time)}` : ''}` : ''}
                    {Number(e.fee_amount) > 0 ? ` · ${formatVnd(e.fee_amount)}` : ''}
                  </div>
                  {(e.location || e.map_url) && <MapLink location={e.location} mapUrl={e.map_url} className="text-gray-400 text-xs" />}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {e.slots && e.kind !== 'meeting' ? <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${full ? 'bg-amber-400/15 text-amber-300' : 'bg-navy-700 text-gray-200'}`}>{e.main_count}/{e.slots}{e.waitlist_count ? ` · +${e.waitlist_count}` : ''}</span> : null}
                    {ended ? (
                      e.my_status ? <span className={`rounded-full border px-2 py-0.5 text-xs ${MY_TONE[e.my_status] || 'border-navy-600 text-gray-300'}`}>{t(`player.status_${e.my_status}`)}</span> : <span className="text-gray-500 text-xs">{t('hub.endedNoSignup')}</span>
                    ) : e.kind === 'meeting' ? (
                      <>
                        <span className="text-gray-300 text-xs">{t('meeting.question')}</span>
                        {['yes', 'no'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-pressed={e.my_vote === c}
                            onClick={() => vote(e, c)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${e.my_vote === c ? (c === 'yes' ? 'bg-lime-400 text-navy-950 border-lime-400' : 'bg-red-500 text-white border-red-500') : 'border-navy-600 text-gray-300'}`}
                          >
                            {c === 'yes' ? `✓ ${t('meeting.yes')}` : `✗ ${t('meeting.no')}`}
                          </button>
                        ))}
                        <span className="text-gray-500 text-xs">{t('meeting.counts', { yes: e.votes?.yes || 0, no: e.votes?.no || 0 })}</span>
                      </>
                    ) : e.my_status ? (
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${MY_TONE[e.my_status] || 'border-navy-600 text-gray-300'}`}>✓ {t(`player.status_${e.my_status}`)}</span>
                    ) : e.public_token ? (
                      <Link href={`/e/${e.public_token}`} className="btn-primary !py-1 !px-3 text-xs">{full ? t('hub.joinWaitlist') : t('hub.signUp')}</Link>
                    ) : (
                      <span className="text-gray-500 text-xs">{t('hub.noSignupLink')}</span>
                    )}
                  </div>
                </div>
                {href && <span className="flex items-center pr-3 text-gray-500" aria-hidden="true"><UiIcon name="chevronRight" className="w-5 h-5" /></span>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'pass' && (
        <section className="card">
          {data.memberships.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('hub.noPass')}</p>
          ) : (
            <ul className="divide-y divide-navy-700">
              {data.memberships.map((m) => (
                <li key={m.period_label} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-gray-200">{m.period_label}</span>
                  <span className={PAY_STYLE[m.status]}>
                    {t(`membership.${m.status}`)}
                    {m.status === 'paid' && m.sessions_included > 0 && ` · ${m.sessions_used}/${m.sessions_included}`}
                    {m.status === 'paid' && m.sessions_included === 0 && ' · ∞'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Hint text={t('hub.passHint')} className="mt-3" />
        </section>
      )}

      {tab === 'history' && (
        <section className="card">
          <div className="flex flex-wrap gap-3 text-xs text-gray-400 mb-2">
            <span>{t('hub.played', { n: data.stats.played })}</span>
            <span>{t('hub.lateN', { n: data.stats.late })}</span>
            <span>{t('hub.noShowN', { n: data.stats.no_show })}</span>
          </div>
          {data.history.length === 0 && <p className="text-gray-400 text-sm">{t('player.noHistory')}</p>}
          <ul className="divide-y divide-navy-700">
            {data.history.map((h) => {
              const href = h.public_token ? (h.kind === 'meeting' ? `/v/${h.public_token}` : `/e/${h.public_token}`) : null;
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block text-white break-words">{h.title}</span>
                    <span className="block text-gray-500 text-xs">{formatDay(h.event_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  </span>
                  <span className={`text-xs shrink-0 ${h.status === 'checked_in' ? 'text-lime-400' : h.status === 'no_show' ? 'text-red-300' : 'text-gray-400'}`}>
                    {t(`player.status_${h.status}`)}
                    {h.late_cancel && ` · ${t('policy.lateBadge')}`}
                  </span>
                  {href && <UiIcon name="chevronRight" className="w-4 h-4 text-gray-500" />}
                </>
              );
              return (
                <li key={h.event_id}>
                  {href ? (
                    <Link href={href} className="flex min-h-[44px] items-center gap-2 py-2 text-sm hover:bg-navy-800/50 -mx-2 px-2 rounded-lg transition-colors">{body}</Link>
                  ) : (
                    <div className="flex items-center gap-2 py-2 text-sm">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === 'race' && <RaceBoard clubId={clubId} />}
      {tab === 'rankings' && <ClubLeaderboard statsUrl={`/api/player/clubs/${clubId}/rankings`} clubName={data.club.name} />}

      <p className="text-center mt-6">
        <Link href="/p" className="text-gray-400 text-xs underline">{t('hub.myQrHint')} →</Link>
      </p>
      <LeaveClub club={club} debt={data.debt || 0} t={t} lang={lang} />
    </PlayerShell>
  );
}
