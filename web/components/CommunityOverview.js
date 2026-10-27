'use client';
import { useState } from 'react';
import QuickLevelsModal from '@/components/QuickLevelsModal';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import ClubAvatar from '@/components/ClubAvatar';
import PageHeader from '@/components/ui/PageHeader';
import StatTile from '@/components/ui/StatTile';
import TrendBars from '@/components/TrendBars';
import AdoptStandalone from '@/components/AdoptStandalone';
import Hint from '@/components/ui/Hint';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { hasFeature, planFor } from '@/lib/planFeatures';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import UiIcon from '@/components/ui/UiIcon';
import ActionRow from '@/components/ui/ActionRow';

function Section({ icon, title, hint, href, children }) {
  const { t } = useI18n();
  return (
    <section className="card !p-0 overflow-hidden mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-navy-700">
        <h2 className="text-white font-semibold min-w-0 flex items-center gap-2"><UiIcon name={icon} className="w-5 h-5 text-gray-400" />{title} {hint && <Hint inline text={hint} />}</h2>
        {href && <Link href={href} className="text-lime-400 text-xs hover:underline">{t('home.details')} →</Link>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

// A thin bar: part of a whole (members active / regular…).
function Split({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-navy-900" aria-hidden="true">
      {parts.map((p) => <span key={p.key} className={p.color} style={{ width: `${(100 * p.value) / total}%` }} />)}
    </div>
  );
}

// Social Manager overview: one tab per community (cụm sân) the Host runs, then its
// members (per series, active / inactive), money (in, out, balance, still owed) and how
// regularly members come. `children` (the club home: this month, upcoming sessions,
// transfers to check, top players, to-dos, birthdays, plan) follows.
export default function CommunityOverview({ children }) {
  const { t } = useI18n();
  const { clubs, club, selectClub } = useClubs();
  const { plan } = useWorkspace();
  const { data, error, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/community-overview`) : Promise.resolve(null)), [club?.id]);
  const m = data?.members;
  const f = data?.finance;
  const r = data?.regularity;
  // Only buttons the plan allows (the weekly schedule is a Standard feature).
  const canWeekly = hasFeature(planFor(club, plan), 'weekly_schedule');
  const [levelsOpen, setLevelsOpen] = useState(false);
  const rules = data?.rules || { active_days: 30, regular_min: 3 };

  return (
    <AppShell>
      <PageHeader
        icon="ticket"
        title={t('social.overviewTitle')}
        subtitle={t('social.overviewSub', { n: clubs.length })}
        actions={
          // The things a Host opens every day, on the right of the title.
          <ActionRow
            className="w-full sm:w-auto"
            actions={[
              { key: 'members', href: '/club/members/all', icon: 'users', label: t('nav.members') },
              canWeekly ? { key: 'weekly', href: '/events/create/weekly', icon: 'repeat', label: t('nav.createWeekly') } : { key: 'schedule', href: '/events', icon: 'calendar', label: t('nav.schedule') },
              { key: 'create', href: '/events/create', icon: 'plus', label: t('nav.createGame'), primary: true },
            ]}
          />
        }
      />

      {/* One tab per court cluster (community). */}
      <div className="-mx-4 px-4 md:mx-0 md:px-0 mb-4 overflow-x-auto" role="tablist" aria-label={t('hub.communities')}>
        <div className="flex gap-2 min-w-max">
          {clubs.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={club?.id === c.id}
              onClick={() => selectClub(c.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${club?.id === c.id ? 'border-lime-400 bg-lime-400/10 text-white font-semibold' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
            >
              <ClubAvatar id={c.id} name={c.name} sport={c.sport} size={24} />
              {c.name}
            </button>
          ))}
          <Link href="/club-request?kind=community" className="flex items-center rounded-xl border border-dashed border-navy-600 px-3 py-2 text-sm text-gray-300 hover:border-lime-400">＋ {t('social.newCommunity')}</Link>
        </div>
      </div>

      {club && <AdoptStandalone club={club} onMoved={reload} />}

      {error && <p className="card text-red-300 text-sm mb-4">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}

      {/* Today first (club home: to-dos, next sessions, money), the community's numbers folded below. */}
      {club && children}

      {data && (
        <details className="group mb-5">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden card !py-3 flex items-center justify-between text-white font-semibold">
            <span>{t('ux.communityStats')}</span>
            <span className="text-gray-400 group-open:rotate-180 transition-transform" aria-hidden>▾</span>
          </summary>
          <div className="mt-4">
          <Section icon="users" title={t('social.secMembers')} hint={t('social.secMembersHint', { d: rules.active_days })} href="/club/members">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatTile icon="users" label={t('social.totalMembers')} value={m.total} sub={t('social.typeSplit', { v: m.vip ?? 0, p: m.priority ?? 0, f: m.fixed, g: m.guest })} />
              <StatTile icon="🆕" label={t('social.newMembers')} value={m.new_30d ?? 0} tone="text-sky-300" sub={t('social.newMembersSub')} />
              <StatTile icon="checkCircle" label={t('social.active')} value={m.active} tone="text-lime-300" sub={t('social.activeSub', { d: rules.active_days })} />
              <StatTile icon="pause" label={t('social.inactive')} value={m.inactive} tone="text-gray-300" sub={t('social.inactiveSub', { d: rules.active_days })} />
            </div>
            <Split parts={[{ key: 'a', value: m.active, color: 'bg-lime-400' }, { key: 'i', value: m.inactive, color: 'bg-navy-600' }]} />
            <h3 className="text-gray-300 text-sm font-semibold mt-4 mb-2">{t('social.byLevel')}</h3>
            {!(m.by_level || []).length ? (
              <p className="text-gray-500 text-sm">
                {t('social.noLevels')} <button type="button" className="text-lime-400 hover:underline" onClick={() => setLevelsOpen(true)}>{t('quickfix.levelsAdd')}</button>
              </p>
            ) : (
              <div className="table-wrap">
                <table className="w-full text-sm grid-table !min-w-[30rem]">
                  <thead>
                    <tr className="text-left">
                      <th>{t('members.colLevel')}</th>
                      <th className="text-right">{t('social.members')}</th>
                      <th className="text-right">{t('social.active')}</th>
                      <th className="text-right">{t('social.inactive')}</th>
                      <th className="text-right">{t('social.sessions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.by_level.map((s) => (
                      <tr key={s.key}>
                        <td className="text-white font-semibold">{s.label}</td>
                        <td className="text-right tabular-nums text-gray-100">{s.members}</td>
                        <td className="text-right tabular-nums text-lime-300">{s.active}</td>
                        <td className="text-right tabular-nums text-gray-400">{s.inactive}</td>
                        <td className="text-right tabular-nums text-gray-300">{s.sessions}</td>
                      </tr>
                    ))}
                    {m.no_level > 0 && (
                      <tr>
                        <td className="text-gray-400 italic">{t('social.noLevelRow')}</td>
                        <td className="text-right tabular-nums text-gray-400">{m.no_level}</td>
                        <td colSpan={3} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section icon="money" title={t('social.secFinance')} hint={t('social.secFinanceHint')} href="/finance">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile icon="trendUp" label={t('analytics.income')} value={formatVnd(f.income)} tone="text-lime-400" />
              <StatTile icon="trendDown" label={t('analytics.expense')} value={formatVnd(f.expense)} tone="text-orange-300" />
              <StatTile icon="bank" label={t('fin.balance')} value={formatVnd(f.balance)} tone={f.balance < 0 ? 'text-red-400' : 'text-white'} />
              <StatTile icon="hourglass" label={t('social.unpaid')} value={formatVnd(f.unpaid)} tone="text-amber-200" sub={t('social.unpaidSub', { n: f.unpaid_fee_count, fees: formatVnd(f.unpaid_fees), plans: formatVnd(f.unpaid_plans) })} />
            </div>
          </Section>

          <Section icon="repeat" title={t('social.secRegular')} hint={t('social.secRegularHint', { n: rules.regular_min, d: 30 })} href="/club/attendance">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <StatTile icon="star" label={t('social.regular')} value={r.regular} tone="text-lime-300" sub={t('social.regularSub', { n: rules.regular_min })} />
              <StatTile icon="user" label={t('social.notRegular')} value={r.not_regular ?? m.total - r.regular} tone="text-sky-300" sub={t('social.notRegularSub', { n: rules.regular_min })} />
              <StatTile icon="trendUp" label={t('social.activeRate')} value={`${r.active_rate ?? (m.total ? Math.round((1000 * r.regular) / m.total) / 10 : 0)}%`} tone={(r.active_rate ?? 0) >= 50 ? 'text-lime-300' : (r.active_rate ?? 0) >= 25 ? 'text-amber-200' : 'text-pink-300'} sub={t('social.activeRateSub')} />
            </div>
            <Split parts={[{ key: 'r', value: r.regular, color: 'bg-lime-400' }, { key: 'n', value: r.not_regular ?? m.total - r.regular, color: 'bg-navy-600' }]} />
          </Section>

          {data.monthly?.length > 0 && (
            <Section icon="chart" title={t('social.secTrend')} hint={t('social.secTrendHint')} href="/finance">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <TrendBars title={t('social.trSessions')} series={data.monthly.map((x) => ({ month: x.month, value: x.sessions }))} deltaLabel={t('social.trVsLast')} noPrevLabel={t('social.trNoPrev')} />
                <TrendBars title={t('social.trPlayers')} series={data.monthly.map((x) => ({ month: x.month, value: x.players, extra: t('social.trTurns', { n: x.turns }) }))} deltaLabel={t('social.trVsLast')} noPrevLabel={t('social.trNoPrev')} />
                <TrendBars title={t('social.trProfit')} signed format={(v) => formatVnd(v)} series={data.monthly.map((x) => ({ month: x.month, value: x.profit, extra: `${t('analytics.income')} ${formatVnd(x.income)} · ${t('analytics.expense')} ${formatVnd(x.expense)}` }))} deltaLabel={t('social.trVsLast')} noPrevLabel={t('social.trNoPrev')} />
              </div>
              <div className="mt-2"><Hint inline text={t('social.trNote', { n: data.monthly[data.monthly.length - 1].players })} /></div>
            </Section>
          )}
          </div>
        </details>
      )}
      <QuickLevelsModal open={levelsOpen} clubId={club?.id} sport={club?.sport || 'pickleball'} onClose={() => setLevelsOpen(false)} onSaved={() => reload()} />
    </AppShell>
  );
}
