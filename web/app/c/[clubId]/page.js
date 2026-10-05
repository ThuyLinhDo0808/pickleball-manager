'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import ClubAvatar from '@/components/ClubAvatar';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import { KIND_ICON } from '@/components/EventCalendar';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm, todayYmd } from '@/lib/dates';
import { formatVnd } from '@/lib/format';

const PAY_STYLE = { paid: 'text-lime-400', pending: 'text-yellow-300', overdue: 'text-red-300' };
const MY_TONE = {
  registered: 'bg-lime-400/15 text-lime-300 border-lime-400/50',
  checked_in: 'bg-lime-400/15 text-lime-300 border-lime-400/50',
  pending: 'bg-yellow-400/10 text-yellow-300 border-yellow-400/50',
  waitlisted: 'bg-sky-400/10 text-sky-300 border-sky-400/50',
};

// A club seen by one of its members (not its managers): my pass, the club's coming
// sessions (sign up with one tap), my sign-ups and my history there.
export default function MemberClubPage() {
  const { clubId } = useParams();
  const { t, lang } = useI18n();
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
  const today = todayYmd();
  const sessionsLeft = data.membership_state === 'active' ? (data.sessions_unlimited ? '∞' : data.sessions_remaining) : '—';

  return (
    <PlayerShell sport={club.sport}>
      <Link href="/home" className="text-gray-400 text-sm hover:text-white inline-block mb-3">← {t('hub.navHome')}</Link>

      <section className="card !p-0 overflow-hidden mb-4">
        <div className="h-16 bg-gradient-to-r from-navy-700 via-navy-800 to-navy-900" />
        <div className="px-4 pb-4 -mt-8 flex items-end gap-3">
          <ClubAvatar id={club.id} name={club.name} sport={club.sport} size={72} ring="ring-4 ring-navy-800" />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-white text-xl font-bold truncate">{club.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs">
              <span className="rounded-full bg-navy-700 px-2 py-0.5 font-bold uppercase tracking-wide text-gray-200">{t('hub.roleMember')}</span>
              <span className="text-gray-400">{member.member_type === 'fixed' ? t('members.fixed') : t('members.guest')}</span>
              {member.account_verified === false && <span className="text-yellow-300">⏳ {t('verify.pendingPlayer')}</span>}
            </div>
          </div>
        </div>
        {(club.description || club.contact) && (
          <div className="px-4 pb-4 text-sm text-gray-300">
            {club.description && <p className="mb-1">{club.description}</p>}
            {club.contact && <p className="text-gray-500 text-xs">✉️ {t('hub.contact')}: {club.contact}</p>}
          </div>
        )}
      </section>

      <KpiRow cols={4}>
        <StatTile icon="🎫" label={t('player.sessionsLeft')} value={sessionsLeft} tone="text-lime-300" sub={data.current_period || t(`membership.state_${data.membership_state}`)} />
        <StatTile icon="📅" label={t('hub.mySignups')} value={data.my_upcoming.length} tone="text-sky-300" sub={t('hub.upcomingShort')} />
        <StatTile icon="✅" label={t('player.eventsPlayed')} value={data.stats.played} />
        <StatTile icon="💸" label={t('player.debt')} value={data.debt ? formatVnd(data.debt) : t('player.noDebt')} tone={data.debt ? 'text-yellow-300' : 'text-gray-300'} />
      </KpiRow>

      <UnderlineTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'schedule', label: t('hub.tabSchedule'), icon: '🗓', count: data.events.length },
          { key: 'pass', label: t('hub.tabPass'), icon: '🎫' },
          { key: 'history', label: t('hub.tabHistory'), icon: '🕘', count: data.history.length },
        ]}
      />

      {tab === 'schedule' && (
        <div className="flex flex-col gap-2">
          {data.events.length === 0 && <p className="card text-gray-400 text-sm">{t('hub.noClubEvents')}</p>}
          {voteError && <p className="text-red-400 text-sm">{voteError}</p>}
          {data.events.map((e) => {
            const full = e.slots && e.main_count >= e.slots;
            return (
              <div key={e.id} className="card !p-0 overflow-hidden flex">
                <div className="w-16 shrink-0 flex flex-col items-center justify-center border-r border-navy-700 bg-navy-900 py-3">
                  <span className="text-[11px] uppercase text-gray-400">{formatDay(e.event_date, lang, { weekday: 'short' })}</span>
                  <span className="text-white text-2xl font-bold leading-none">{Number(e.event_date.slice(8, 10))}</span>
                  <span className="text-[11px] text-gray-500">{e.event_date === today ? t('hub.today') : `${Number(e.event_date.slice(5, 7))}/${e.event_date.slice(2, 4)}`}</span>
                </div>
                <div className="min-w-0 flex-1 p-3">
                  <div className="text-white font-semibold truncate">{KIND_ICON[e.kind] ? `${KIND_ICON[e.kind]} ` : ''}{e.title}</div>
                  <div className="text-gray-400 text-xs truncate">
                    {e.start_time ? `🕒 ${hhmm(e.start_time)}${e.end_time ? `–${hhmm(e.end_time)}` : ''} · ` : ''}📍 {e.location || '—'}
                    {Number(e.fee_amount) > 0 ? ` · ${formatVnd(e.fee_amount)}` : ''}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {e.slots && e.kind !== 'meeting' ? <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${full ? 'bg-amber-400/15 text-amber-300' : 'bg-navy-700 text-gray-200'}`}>{e.main_count}/{e.slots}{e.waitlist_count ? ` · +${e.waitlist_count}` : ''}</span> : null}
                    {e.kind === 'meeting' ? (
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
          <p className="text-gray-500 text-xs mt-3">{t('hub.passHint')}</p>
        </section>
      )}

      {tab === 'history' && (
        <section className="card">
          <div className="flex flex-wrap gap-3 text-xs text-gray-400 mb-2">
            <span>✅ {t('hub.played', { n: data.stats.played })}</span>
            <span>⚠️ {t('hub.lateN', { n: data.stats.late })}</span>
            <span>🚫 {t('hub.noShowN', { n: data.stats.no_show })}</span>
          </div>
          {data.history.length === 0 && <p className="text-gray-400 text-sm">{t('player.noHistory')}</p>}
          <ul className="divide-y divide-navy-700">
            {data.history.map((h) => (
              <li key={h.event_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block text-white truncate">{h.title}</span>
                  <span className="block text-gray-500 text-xs">{formatDay(h.event_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                </span>
                <span className={`text-xs shrink-0 ${h.status === 'checked_in' ? 'text-lime-400' : h.status === 'no_show' ? 'text-red-300' : 'text-gray-400'}`}>
                  {t(`player.status_${h.status}`)}
                  {h.late_cancel && ` · ${t('policy.lateBadge')}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center mt-6">
        <Link href="/p" className="text-gray-400 text-xs underline">{t('hub.myQrHint')} →</Link>
      </p>
    </PlayerShell>
  );
}
