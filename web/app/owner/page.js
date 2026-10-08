'use client';
import { useState } from 'react';
import Link from 'next/link';
import OwnerShell, { fmtDate, TIER_BADGE } from '@/components/OwnerShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

// This week vs last week, with the % change (no arrow when there is nothing to compare).
function Change({ w }) {
  const { t } = useI18n();
  if (w.change == null) return <span className="text-gray-500 text-xs">{t('owner.lastWeek', { n: w.last })}</span>;
  const up = w.change >= 0;
  return (
    <span className="text-xs">
      <span className={up ? 'text-lime-300' : 'text-red-300'}>{up ? '▲' : '▼'} {Math.abs(w.change)}%</span>
      <span className="text-gray-500"> · {t('owner.lastWeek', { n: w.last })}</span>
    </span>
  );
}

function Tile({ label, value, sub, href }) {
  const body = (
    <>
      <div className="text-gray-400 text-xs">{label}</div>
      <div className="text-white text-2xl font-bold tabular-nums mt-0.5">{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card !p-4 hover:border-amber-300/50 block">{body}</Link>
  ) : (
    <div className="card !p-4">{body}</div>
  );
}

// New accounts per day, last 14 days: one series, so no legend; hover shows the value.
function DailyBars({ rows, label }) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card !p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-white font-semibold text-sm">{label}</h3>
        <span className="text-gray-500 text-xs">{t('owner.last14')}</span>
      </div>
      <div className="flex items-end gap-[2px] h-28" role="img" aria-label={`${label}: ${rows.map((r) => `${fmtDate(r.date)} ${r.count}`).join(', ')}`}>
        {rows.map((r) => (
          <div key={r.date} className="group relative flex-1 h-full flex items-end" title={`${fmtDate(r.date)}: ${r.count}`}>
            <div className="w-full rounded-t bg-lime-400/80 group-hover:bg-lime-300" style={{ height: `${Math.max(r.count ? 4 : 0, (r.count / max) * 100)}%` }} />
            {r.count === max && r.count > 0 && <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-300 tabular-nums">{r.count}</span>}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
        <span>{fmtDate(rows[0]?.date).slice(0, 5)}</span>
        <span>{fmtDate(rows.at(-1)?.date).slice(0, 5)}</span>
      </div>
    </div>
  );
}

const MIX = [['free', 'bg-gray-500'], ['trial', 'bg-sky-400'], ['basic', 'bg-sky-600'], ['standard', 'bg-violet-400'], ['advanced', 'bg-emerald-400'], ['pro', 'bg-amber-300']];

// How hosts split across the plans: one stacked bar plus the counts.
function TierMix({ mix }) {
  const { t } = useI18n();
  const total = MIX.reduce((n, [k]) => n + (mix[k] || 0), 0);
  return (
    <>
      <div className="flex h-3 rounded-full overflow-hidden bg-navy-700" role="img" aria-label={MIX.map(([k]) => `${t(`owner.mix_${k}`)} ${mix[k] || 0}`).join(', ')}>
        {total > 0 && MIX.map(([k, c]) => (mix[k] ? <div key={k} className={c} style={{ width: `${(mix[k] / total) * 100}%` }} title={`${t(`owner.mix_${k}`)}: ${mix[k]}`} /> : null))}
      </div>
      <ul className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
        {MIX.map(([k, c]) => (
          <li key={k} className="text-xs">
            <span className="flex items-center gap-1.5 text-gray-400"><span className={`w-2 h-2 rounded-full ${c}`} aria-hidden="true" />{t(`owner.mix_${k}`)}</span>
            <span className="text-white font-bold text-lg tabular-nums">{mix[k] || 0}</span>
            {total > 0 && <span className="text-gray-500 ml-1">{Math.round(((mix[k] || 0) / total) * 100)}%</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function OwnerOverview() {
  const { t } = useI18n();
  const [days, setDays] = useState(7);
  const { data: d, error } = useLoad(() => api.get('/api/owner/overview'), []);

  return (
    <OwnerShell title={t('owner.tabOverview')}>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!d && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {d && (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="text-gray-300 text-sm font-semibold mb-2">📈 {t('owner.growth')}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label={t('owner.newHosts')} value={d.growth.hosts.this} sub={<Change w={d.growth.hosts} />} />
              <Tile label={t('owner.newClubs')} value={d.growth.clubs.this} sub={<Change w={d.growth.clubs} />} />
              <Tile label={t('owner.newPlayers')} value={d.growth.players.this} sub={<Change w={d.growth.players} />} />
              <Tile
                label={t('owner.conversion')}
                value={`${d.conversion.rate}%`}
                sub={<span className="text-gray-500 text-xs">{t('owner.conversionSub', { paying: d.conversion.paying, hosts: d.conversion.hosts })}</span>}
                href="/owner/hosts?filter=paying"
              />
            </div>
            <p className="text-gray-500 text-xs mt-2">
              {t('owner.totals', { accounts: d.totals.accounts, hosts: d.totals.hosts, clubs: d.totals.clubs, players: d.totals.players })}
              {d.suspended > 0 && <> · <Link href="/owner/hosts?filter=suspended" className="text-red-300 underline">{t('owner.suspendedN', { n: d.suspended })}</Link></>}
            </p>
          </section>

          <section>
            <h2 className="text-gray-300 text-sm font-semibold mb-2">🏓 {t('owner.usage')}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label={t('owner.xeveToday')} value={d.usage.xeve.today} />
              <Tile label={t('owner.xeveWeek')} value={d.usage.xeve.this} sub={<Change w={d.usage.xeve} />} />
              <Tile label={t('owner.tourToday')} value={d.usage.tournaments.today} />
              <Tile label={t('owner.tourWeek')} value={d.usage.tournaments.this} sub={<Change w={d.usage.tournaments} />} />
            </div>
          </section>

          <section>
            <h2 className="text-gray-300 text-sm font-semibold mb-2">💰 {t('owner.revenue')}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile
                label={t('owner.cashMonth', { m: d.revenue.month.split('-').reverse().join('/') })}
                value={formatVnd(d.revenue.cash_this_month)}
                sub={<span className="text-gray-500 text-xs">{t('owner.cashLast', { v: formatVnd(d.revenue.cash_last_month) })}</span>}
                href="/owner/payments?status=paid"
              />
              <Tile label="MRR" value={formatVnd(d.revenue.mrr)} sub={<span className="text-gray-500 text-xs">{t('owner.mrrHint')}</span>} />
              <Tile
                label={t('owner.pendingOrders')}
                value={d.revenue.pending_orders}
                sub={d.revenue.pending_orders > 0 ? <span className="text-amber-300 text-xs">{t('owner.goConfirm')} →</span> : null}
                href="/owner/payments"
              />
              <Tile
                label={t('owner.renewalRate')}
                value={d.revenue.renewal.rate == null ? '—' : `${d.revenue.renewal.rate}%`}
                sub={<span className="text-gray-500 text-xs">{t('owner.renewalSub', { r: d.revenue.renewal.renewed, l: d.revenue.renewal.lapsed })}</span>}
              />
            </div>
          </section>

          <section>
            <h2 className="text-gray-300 text-sm font-semibold mb-2">💎 {t('owner.plansMix')}</h2>
            <div className="grid lg:grid-cols-[2fr_1fr] gap-3 items-start">
              <div className="card !p-4">
                <TierMix mix={d.tiers} />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                <Tile label="ARPU" value={formatVnd(d.arpu)} sub={<span className="text-gray-500 text-xs">{t('owner.arpuHint')}</span>} />
                <Tile
                  label={t('owner.trialConversion')}
                  value={d.trials.rate == null ? '—' : `${d.trials.rate}%`}
                  sub={<span className="text-gray-500 text-xs">{t('owner.trialConvSub', { c: d.trials.converted, e: d.trials.ended })}</span>}
                />
              </div>
            </div>
          </section>

          <div className="grid lg:grid-cols-2 gap-3">
            <section className="card !p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-white font-semibold text-sm">🧪 {t('owner.trialsNow', { n: d.trials.active.length })}</h2>
                <Link href="/owner/hosts?filter=trial" className="text-amber-300 text-xs">{t('owner.seeAll')} →</Link>
              </div>
              {d.trials.active.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('owner.noTrials')}</p>
              ) : (
                <ul className="divide-y divide-navy-700">
                  {d.trials.active.slice(0, 8).map((x) => (
                    <li key={x.host_id} className="py-2 flex items-center justify-between gap-2">
                      <Link href={`/owner/hosts/${x.host_id}`} className="min-w-0 text-sm text-gray-200 hover:text-white truncate">{x.email}</Link>
                      <span className={`text-xs tabular-nums shrink-0 ${x.days_left <= 3 ? 'text-red-300' : 'text-amber-200'}`}>
                        {x.days_left === 0 ? t('owner.endsToday') : t('owner.daysLeft', { n: x.days_left })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <DailyBars rows={d.daily.clubs} label={t('owner.dailyClubs')} />
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <section className="card !p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-white font-semibold text-sm">⏰ {t('owner.expiring')}</h2>
                <div className="flex gap-1">
                  {[3, 7].map((n) => (
                    <button key={n} type="button" onClick={() => setDays(n)} className={`rounded-full px-2.5 py-0.5 text-xs border ${days === n ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
                      {t('owner.inDays', { n })}
                    </button>
                  ))}
                </div>
              </div>
              {d.expiring.filter((x) => x.days_left <= days).length === 0 ? (
                <p className="text-gray-500 text-sm">{t('owner.noneExpiring')}</p>
              ) : (
                <ul className="divide-y divide-navy-700">
                  {d.expiring.filter((x) => x.days_left <= days).map((x) => (
                    <li key={`${x.host_id}-${x.kind}`} className="py-2 flex items-center justify-between gap-2">
                      <Link href={`/owner/hosts/${x.host_id}`} className="min-w-0 text-sm text-gray-200 hover:text-white truncate">{x.email}</Link>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${x.kind === 'tier' ? TIER_BADGE[x.tier] : 'bg-amber-300/20 text-amber-200'}`}>{x.kind === 'tier' ? x.tier : 'SM'}</span>
                        <span className={`text-xs tabular-nums ${x.days_left <= 3 ? 'text-red-300' : 'text-amber-200'}`}>
                          {x.days_left === 0 ? t('owner.endsToday') : t('owner.daysLeft', { n: x.days_left })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <DailyBars rows={d.daily.accounts} label={t('owner.dailyAccounts')} />
          </div>
        </div>
      )}
    </OwnerShell>
  );
}
