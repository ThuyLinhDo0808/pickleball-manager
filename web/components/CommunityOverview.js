'use client';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import ClubAvatar from '@/components/ClubAvatar';
import PageHeader from '@/components/ui/PageHeader';
import StatTile from '@/components/ui/StatTile';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

function Section({ icon, title, hint, href, children }) {
  const { t } = useI18n();
  return (
    <section className="card !p-0 overflow-hidden mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-navy-700">
        <div className="min-w-0">
          <h2 className="text-white font-semibold">{icon} {title}</h2>
          {hint && <p className="text-gray-500 text-xs">{hint}</p>}
        </div>
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
// regularly members come.
export default function CommunityOverview() {
  const { t } = useI18n();
  const { clubs, club, selectClub } = useClubs();
  const { data, error } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/community-overview`) : Promise.resolve(null)), [club?.id]);
  const m = data?.members;
  const f = data?.finance;
  const r = data?.regularity;
  const rules = data?.rules || { active_days: 30, regular_min: 4 };

  return (
    <AppShell>
      <PageHeader
        icon="🎟"
        title={t('social.overviewTitle')}
        subtitle={t('social.overviewSub', { n: clubs.length })}
        actions={
          <>
            <Link href="/events/create" className="btn-primary text-sm">＋ {t('nav.createGame')}</Link>
            <Link href="/club-request?kind=community" className="btn-secondary text-sm">＋ {t('social.newCommunity')}</Link>
          </>
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
        </div>
      </div>

      {error && <p className="card text-red-300 text-sm mb-4">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}

      {data && (
        <>
          <Section icon="👥" title={t('social.secMembers')} hint={t('social.secMembersHint', { d: rules.active_days })} href="/club/members">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatTile icon="👥" label={t('social.totalMembers')} value={m.total} sub={t('social.fixedGuest', { f: m.fixed, g: m.guest })} />
              <StatTile icon="🟢" label={t('social.active')} value={m.active} tone="text-lime-300" sub={t('social.activeSub', { d: rules.active_days })} />
              <StatTile icon="💤" label={t('social.inactive')} value={m.inactive} tone="text-gray-300" sub={t('social.inactiveSub', { d: rules.active_days })} />
              <StatTile icon="🏷" label={t('social.seriesCount')} value={m.by_series.length} tone="text-sky-300" />
            </div>
            <Split parts={[{ key: 'a', value: m.active, color: 'bg-lime-400' }, { key: 'i', value: m.inactive, color: 'bg-navy-600' }]} />
            <h3 className="text-gray-300 text-sm font-semibold mt-4 mb-2">{t('social.bySeries')}</h3>
            {m.by_series.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('social.noSeries')}</p>
            ) : (
              <div className="table-wrap">
                <table className="w-full text-sm grid-table !min-w-[30rem]">
                  <thead>
                    <tr className="text-gray-300 text-left bg-navy-900">
                      <th>{t('social.series')}</th>
                      <th className="text-right">{t('social.members')}</th>
                      <th className="text-right">{t('social.active')}</th>
                      <th className="text-right">{t('social.inactive')}</th>
                      <th className="text-right">{t('social.sessions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.by_series.map((s) => (
                      <tr key={s.label}>
                        <td className="text-white font-semibold">{s.label}</td>
                        <td className="text-right tabular-nums text-gray-100">{s.members}</td>
                        <td className="text-right tabular-nums text-lime-300">{s.active}</td>
                        <td className="text-right tabular-nums text-gray-400">{s.inactive}</td>
                        <td className="text-right tabular-nums text-gray-300">{s.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section icon="💰" title={t('social.secFinance')} hint={t('social.secFinanceHint')} href="/finance">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile icon="📈" label={t('analytics.income')} value={formatVnd(f.income)} tone="text-lime-400" />
              <StatTile icon="📉" label={t('analytics.expense')} value={formatVnd(f.expense)} tone="text-orange-300" />
              <StatTile icon="🏦" label={t('fin.balance')} value={formatVnd(f.balance)} tone={f.balance < 0 ? 'text-red-400' : 'text-white'} />
              <StatTile icon="⏳" label={t('social.unpaid')} value={formatVnd(f.unpaid)} tone="text-amber-200" sub={t('social.unpaidSub', { n: f.unpaid_fee_count, fees: formatVnd(f.unpaid_fees), plans: formatVnd(f.unpaid_plans) })} />
            </div>
          </Section>

          <Section icon="🔁" title={t('social.secRegular')} hint={t('social.secRegularHint', { n: rules.regular_min, d: rules.active_days })} href="/club/attendance">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <StatTile icon="⭐" label={t('social.regular')} value={r.regular} tone="text-lime-300" sub={t('social.regularSub', { n: rules.regular_min })} />
              <StatTile icon="🙂" label={t('social.irregular')} value={r.irregular} tone="text-sky-300" sub={t('social.irregularSub', { n: rules.regular_min - 1 })} />
              <StatTile icon="💤" label={t('social.inactive')} value={r.inactive} tone="text-gray-300" />
            </div>
            <Split parts={[{ key: 'r', value: r.regular, color: 'bg-lime-400' }, { key: 'i', value: r.irregular, color: 'bg-sky-400' }, { key: 'n', value: r.inactive, color: 'bg-navy-600' }]} />
          </Section>
        </>
      )}
    </AppShell>
  );
}
