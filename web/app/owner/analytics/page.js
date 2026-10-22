'use client';
import { useState } from 'react';
import Link from 'next/link';
import { sheet, book, fileName } from '@/lib/xlsxBook';
import OwnerShell, { OwnerSection } from '@/components/OwnerShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import Hint from '@/components/ui/Hint';

// Categorical slots validated for the dark surface (CVD-safe): blue, orange, aqua.
const C1 = '#3987e5';
const C2 = '#d95926';
const C3 = '#199e70';
const card = 'rounded-xl border border-navy-700 bg-navy-900/60 p-4';
const mShort = (m) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
// 1.250.000 -> "1,3tr"; 450.000 -> "450k"
const compact = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1).replace('.', ',')}tỷ`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')}tr`;
  if (Math.abs(n) >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
};
const pctText = (v) => (v == null ? '—' : `${String(v).replace('.', ',')}%`);

function Kpi({ label, value, sub, tone = 'text-white' }) {
  return (
    <div className={card}>
      <div className="text-gray-400 text-[11px] font-semibold">{label}</div>
      <div className={`text-[26px] leading-9 font-bold tabular-nums mt-1 ${tone}`}>{value}</div>
      {sub && <div className="text-gray-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-300">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} aria-hidden="true" />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// Monthly stacked bars (one axis), with a hover title per bar and the total over it.
function StackedBars({ rows, series, label }) {
  const totals = rows.map((r) => series.reduce((n, s) => n + (Number(r[s.key]) || 0), 0));
  const max = Math.max(1, ...totals);
  return (
    <div>
      <div className="flex items-end gap-1.5 h-44 border-b border-navy-700" role="img" aria-label={label}>
        {rows.map((r, i) => (
          <div
            key={r.month}
            className="group relative flex-1 h-full flex flex-col justify-end"
            title={`${mShort(r.month)} · ${series.map((s) => `${s.label}: ${formatVnd(r[s.key] || 0)}`).join(' · ')}`}
          >
            {totals[i] > 0 && <span className="text-[10px] text-gray-300 tabular-nums text-center mb-0.5">{compact(totals[i])}</span>}
            <div className="flex flex-col-reverse gap-[2px] rounded-t overflow-hidden" style={{ height: `${(totals[i] / max) * 85}%` }}>
              {series.map((s) => (r[s.key] ? <div key={s.key} style={{ background: s.color, flexGrow: r[s.key] }} className="group-hover:opacity-90" /> : null))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">{rows.map((r) => <span key={r.month} className="flex-1 text-center text-[10px] text-gray-500">{mShort(r.month)}</span>)}</div>
    </div>
  );
}

// Horizontal bars for a list of groups; the number is printed next to each bar.
function HBars({ items, color = C1, fmt = (v) => v }) {
  const max = Math.max(1, ...items.map((x) => x.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((x) => (
        <li key={x.label} title={x.title || ''}>
          <div className="flex justify-between gap-2 text-xs mb-1">
            <span className="text-gray-200 break-words">{x.label}</span>
            <span className="text-gray-300 tabular-nums shrink-0">{fmt(x.value)}{x.sub ? <span className="text-gray-500"> · {x.sub}</span> : null}</span>
          </div>
          <div className="h-2 rounded-full bg-navy-800 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(x.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Table({ head, rows, align }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-gray-400 text-xs text-left">
          <tr className="border-b border-navy-700">{head.map((h, i) => <th key={h} className={`px-3 py-2 font-medium whitespace-nowrap ${align?.[i] === 'r' ? 'text-right' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, j) => (
            <tr key={j} className="border-b border-navy-800 last:border-0 tabular-nums">
              {r.map((c, i) => <td key={i} className={`px-3 py-2 whitespace-nowrap ${i === 0 ? 'text-white' : 'text-gray-300'} ${align?.[i] === 'r' ? 'text-right' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Tabs --------------------------------------------------------------------------

function Revenue({ d }) {
  const { t } = useI18n();
  const r = d.revenue;
  const [view, setView] = useState('chart');
  const saleTotal = r.by_sale.reduce((n, x) => n + x.cash, 0) || 1;
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t('ana.cashWindow', { n: d.months.length })} value={formatVnd(r.totals.window)} tone="text-lime-300" sub={t('ana.ordersN', { n: r.totals.orders })} />
        <Kpi label={t('ana.ytd')} value={formatVnd(r.totals.ytd)} sub={t('ana.lifetime', { v: formatVnd(r.totals.lifetime) })} />
        <Kpi label={t('ana.avgOrder')} value={formatVnd(r.totals.avg_order)} sub={t('ana.discountsSub', { v: formatVnd(r.totals.discounts) })} />
        <Kpi label={t('ana.pipeline')} value={formatVnd(r.totals.pending.amount)} sub={t('ana.pipelineSub', { n: r.totals.pending.count, c: r.totals.cancelled.count, v: formatVnd(r.totals.cancelled.amount) })} />
      </div>

      <OwnerSection
        title={t('ana.cashByMonth')}
        hint={t('ana.cashByMonthHint')}
        action={
          <div className="flex gap-1">
            {['chart', 'table'].map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-2.5 py-1 text-xs border ${view === v ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>{t(`ana.view_${v}`)}</button>
            ))}
          </div>
        }
      >
        <div className={card}>
          {view === 'chart' ? (
            <>
              <div className="mb-3"><Legend items={[{ label: t('ana.s_plans'), color: C1 }, { label: 'Social Manager', color: C2 }]} /></div>
              <StackedBars rows={r.by_month} series={[{ key: 'plans', label: t('ana.s_plans'), color: C1 }, { key: 'social_manager', label: 'Social Manager', color: C2 }]} label={t('ana.cashByMonth')} />
            </>
          ) : (
            <Table
              head={[t('ana.col_month'), t('ana.col_cash'), t('ana.s_new'), t('ana.s_renewal'), t('ana.s_upgrade'), t('ana.col_orders'), t('ana.col_discounts'), 'MRR', t('ana.col_paying')]}
              align={[null, 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
              rows={r.by_month.map((m) => [mShort(m.month), formatVnd(m.cash), formatVnd(m.new), formatVnd(m.renewal), formatVnd(m.upgrade), m.orders, formatVnd(m.discounts), formatVnd(m.mrr), m.paying_hosts])}
            />
          )}
        </div>
      </OwnerSection>

      <div className="grid lg:grid-cols-2 gap-6">
        <OwnerSection title={t('ana.bySale')} hint={t('ana.bySaleHint')}>
          <div className={card}>
            <div className="flex h-3 rounded-full overflow-hidden gap-[2px] bg-navy-800 mb-3" role="img" aria-label={t('ana.bySale')}>
              {r.by_sale.map((x, i) => (x.cash ? <div key={x.kind} style={{ width: `${(x.cash / saleTotal) * 100}%`, background: [C1, C2, C3][i] }} title={`${t(`ana.s_${x.kind}`)}: ${formatVnd(x.cash)}`} /> : null))}
            </div>
            <Table
              head={[t('ana.col_type'), t('ana.col_cash'), t('ana.col_share'), t('ana.col_orders')]}
              align={[null, 'r', 'r', 'r']}
              rows={r.by_sale.map((x, i) => [
                <span key="k" className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: [C1, C2, C3][i] }} />{t(`ana.s_${x.kind}`)}</span>,
                formatVnd(x.cash),
                pctText(Math.round((x.cash / saleTotal) * 1000) / 10),
                x.orders,
              ])}
            />
          </div>
        </OwnerSection>
        <OwnerSection title={t('ana.byTier')} hint={t('ana.byTierHint')}>
          <div className={card}>
            <HBars fmt={formatVnd} items={r.by_tier.filter((x) => x.tier !== 'social_manager').map((x) => ({ label: x.tier.toUpperCase(), value: x.cash, sub: t('ana.ordersN', { n: x.orders }) }))} />
          </div>
        </OwnerSection>
        <OwnerSection title={t('ana.bySmTier')} hint={t('ana.bySmTierHint')}>
          <div className={card}>
            <HBars color={C2} fmt={formatVnd} items={(r.by_sm_tier || []).map((x) => ({ label: `SM ${x.tier.toUpperCase()}`, value: x.cash, sub: t('ana.ordersN', { n: x.orders }) }))} />
          </div>
        </OwnerSection>
        <OwnerSection title={t('ana.byLength')} hint={t('ana.byLengthHint')}>
          <div className={card}>
            <HBars color={C3} fmt={formatVnd} items={r.by_length.map((x) => ({ label: x.months === 'other' ? t('ana.lenOther') : t('ana.lenN', { n: x.months }), value: x.cash, sub: t('ana.ordersN', { n: x.orders }) }))} />
          </div>
        </OwnerSection>
        <OwnerSection title={t('ana.promos')} hint={t('ana.promosHint')}>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label={t('ana.promoOrders')} value={r.promos.orders} sub={t('ana.promoRedemptions', { n: r.promos.redemptions })} />
            <Kpi label={t('ana.promoGiven')} value={formatVnd(r.promos.discounts)} tone="text-orange-300" sub={t('ana.promoCash', { v: formatVnd(r.promos.cash) })} />
          </div>
        </OwnerSection>
      </div>

      <OwnerSection title={t('ana.topHosts')} hint={t('ana.topHostsHint')}>
        <div className={card}>
          {r.top_hosts.length === 0 ? <p className="text-gray-500 text-sm">{t('ana.noData')}</p> : (
            <Table
              head={['#', 'Host', t('ana.col_cash'), t('ana.col_orders')]}
              align={[null, null, 'r', 'r']}
              rows={r.top_hosts.map((h, i) => [i + 1, <Link key="l" href={`/owner/hosts/${h.host_id}`} className="text-gray-200 hover:text-amber-200">{h.email || '—'}</Link>, formatVnd(h.cash), h.orders])}
            />
          )}
        </div>
      </OwnerSection>
    </div>
  );
}

function Finance({ d }) {
  const { t } = useI18n();
  const f = d.finance;
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="MRR" value={formatVnd(f.mrr)} tone="text-lime-300" sub={f.mrr_growth == null ? t('ana.mrrHint') : t('ana.mrrGrowth', { v: pctText(f.mrr_growth) })} />
        <Kpi label="ARR" value={formatVnd(f.arr)} sub={t('ana.arrHint')} />
        <Kpi label="ARPU" value={formatVnd(f.arpu)} sub={t('ana.arpuHint', { n: f.paying_hosts })} />
        <Kpi label="ARPA" value={formatVnd(f.arpa)} sub={t('ana.arpaHint')} />
        <Kpi label={t('ana.churn')} value={pctText(f.churn.avg)} tone={f.churn.avg > 10 ? 'text-red-300' : 'text-white'} sub={t('ana.churnHint')} />
        <Kpi label={t('ana.lifetimeM')} value={f.lifetime_months == null ? '—' : t('ana.monthsN', { n: String(f.lifetime_months).replace('.', ',') })} sub={t('ana.lifetimeHint')} />
        <Kpi label="LTV" value={f.ltv == null ? '—' : formatVnd(f.ltv)} sub={t('ana.ltvHint')} />
        <Kpi label={t('ana.payingHosts')} value={f.paying_hosts} sub={f.gifted_hosts ? t('ana.payingHintGifted', { n: d.segments.hosts, g: f.gifted_hosts }) : t('ana.payingHint', { n: d.segments.hosts })} />
      </div>

      <OwnerSection title={t('ana.mrrTrend')} hint={t('ana.mrrTrendHint')}>
        <div className={card}>
          <StackedBars rows={d.revenue.by_month} series={[{ key: 'mrr', label: 'MRR', color: C1 }]} label={t('ana.mrrTrend')} />
        </div>
      </OwnerSection>

      <OwnerSection title={t('ana.churnTable')} hint={t('ana.churnTableHint')}>
        <div className={card}>
          <Table
            head={[t('ana.col_month'), t('ana.col_startPaying'), t('ana.col_lost'), t('ana.churn')]}
            align={[null, 'r', 'r', 'r']}
            rows={f.churn.by_month.map((c) => [mShort(c.month), c.start, c.lost, <span key="r" className={c.rate > 10 ? 'text-red-300' : ''}>{pctText(c.rate)}</span>])}
          />
        </div>
      </OwnerSection>
      <Hint text={t('ana.financeNote')} />
    </div>
  );
}

const VALUE_TONE = { loyal: 'border-lime-400/40', new_paying: 'border-sky-400/40', paying: 'border-navy-600', expiring: 'border-amber-300/50', at_risk: 'border-red-400/50', gifted: 'border-violet-300/40', churned: 'border-red-400/30', trial: 'border-sky-400/30', free_active: 'border-navy-600', free_idle: 'border-navy-700' };

function Segments({ d }) {
  const { t } = useI18n();
  const s = d.segments;
  const dim = (key, rows, label) => (
    <OwnerSection key={key} title={t(`ana.seg_${key}`)} hint={t(`ana.seg_${key}Hint`)}>
      <div className={card}>
        <HBars
          items={rows.map((g) => ({
            label: label(g.key),
            value: g.hosts,
            sub: t('ana.segLine', { p: pctText(g.paying_rate), v: compact(g.cash) }),
            title: `${label(g.key)}: ${g.hosts} Host · ${t('ana.payingRate')} ${pctText(g.paying_rate)} · ${formatVnd(g.cash)} · ${g.members} ${t('ana.membersWord')}`,
          }))}
        />
      </div>
    </OwnerSection>
  );
  return (
    <div className="flex flex-col gap-8">
      <OwnerSection title={t('ana.valueTitle')} hint={t('ana.valueHint')}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {s.by_value.map((g) => (
            <div key={g.key} className={`rounded-xl border bg-navy-900/60 p-4 ${VALUE_TONE[g.key]}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-white font-semibold">{t(`ana.v_${g.key}`)}</span>
                <span className="text-2xl font-bold tabular-nums text-white">{g.hosts}</span>
              </div>
              <p className="text-gray-400 text-xs mt-1">{t(`ana.v_${g.key}Hint`)}</p>
              <p className="text-gray-500 text-xs mt-2 tabular-nums">{t('ana.valueLine', { v: formatVnd(g.cash), m: g.members })}</p>
            </div>
          ))}
        </div>
      </OwnerSection>
      <div className="grid lg:grid-cols-2 gap-6">
        {dim('plan', s.by_plan, (k) => (k === 'trial' ? t('ana.trial') : k === 'free' ? t('ana.free') : k.toUpperCase()))}
        {s.by_sm_plan && dim('sm_plan', s.by_sm_plan, (k) => (k === 'none' ? t('ana.smNone') : `SM ${k.toUpperCase()}`))}
        {dim('size', s.by_size, (k) => t('ana.sizeN', { k }))}
        {dim('product', s.by_product, (k) => t(`ana.prod_${k}`))}
        {dim('activity', s.by_activity, (k) => t(`ana.act_${k}`))}
        {dim('sport', s.by_sport, (k) => t(`ana.sport_${k}`))}
        {dim('tenure', s.by_tenure, (k) => t(`ana.ten_${k}`))}
        {dim('region', s.by_region, (k) => (k === '—' ? t('ana.noRegion') : k))}
      </div>
    </div>
  );
}

// Cohort cells: one hue (blue), brighter = higher %.
const heat = (v) => (v == null ? 'transparent' : `rgba(57,135,229,${0.12 + (Math.min(100, v) / 100) * 0.7})`);

function Cohorts({ d }) {
  const { t } = useI18n();
  const top = d.funnel[0]?.count || 1;
  return (
    <div className="flex flex-col gap-8">
      <OwnerSection title={t('ana.funnel')} hint={t('ana.funnelHint')}>
        <div className={card}>
          <ul className="flex flex-col gap-3">
            {d.funnel.map((f) => (
              <li key={f.key}>
                <div className="flex justify-between gap-2 text-sm mb-1">
                  <span className="text-gray-200">{t(`ana.f_${f.key}`)}</span>
                  <span className="tabular-nums text-gray-300">
                    <span className="text-white font-semibold">{f.count}</span>
                    <span className="text-gray-500"> · {pctText(f.of_first)}{f.of_prev != null ? ` · ${t('ana.ofPrev', { v: pctText(f.of_prev) })}` : ''}</span>
                  </span>
                </div>
                <div className="h-6 rounded-md bg-navy-800 overflow-hidden">
                  <div className="h-full rounded-md" style={{ width: `${Math.max(f.count ? 1.5 : 0, (f.count / top) * 100)}%`, background: C1 }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </OwnerSection>
      <OwnerSection title={t('ana.cohorts')} hint={t('ana.cohortsHint')}>
        <div className={card}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs text-left">
                <tr className="border-b border-navy-700">
                  {['col_cohort', 'col_accounts', 'col_hosts', 'col_hostRate', 'col_everPaid', 'col_payingNow', 'col_activeNow'].map((k, i) => <th key={k} className={`px-3 py-2 font-medium whitespace-nowrap ${i ? 'text-right' : ''}`}>{t(`ana.${k}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.cohorts.map((c) => (
                  <tr key={c.month} className="border-b border-navy-800 last:border-0 tabular-nums">
                    <td className="px-3 py-2 text-white">{mShort(c.month)}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{c.accounts}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{c.hosts}</td>
                    {[c.host_rate, c.ever_paid, c.paying_now, c.active_now].map((v, i) => (
                      <td key={i} className="px-1 py-1 text-right">
                        <span className="block rounded px-2 py-1 text-gray-100" style={{ background: heat(v) }}>{pctText(v)}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </OwnerSection>
    </div>
  );
}

// All the numbers in one workbook (one sheet per part).
function exportXlsx(d, t) {
  const sheets = [];
  const period = `${d.months[0]} → ${d.months[d.months.length - 1]}`;
  // money-ish columns by header word; % columns when the header is '%' or a rate
  const typeOf = (h, v) => (typeof v === 'number' ? (/%|rate|tỷ lệ|tỉ lệ/i.test(String(h)) ? 'decimal' : Number.isInteger(v) && Math.abs(v) >= 1000 ? 'money' : Number.isInteger(v) ? 'int' : 'decimal') : 'text');
  const add = (name, head, rows) => sheets.push([name, sheet({ title: name, subtitle: period, columns: head.map((h, c) => ({ header: h, type: typeOf(h, rows.find((r) => r[c] != null)?.[c]) })), rows })]);
  add(t('ana.x_revenue'), [t('ana.col_month'), t('ana.col_cash'), t('ana.s_plans'), 'Social Manager', t('ana.s_new'), t('ana.s_renewal'), t('ana.s_upgrade'), t('ana.col_orders'), t('ana.col_discounts'), 'MRR', t('ana.col_paying')],
    d.revenue.by_month.map((m) => [m.month, m.cash, m.plans, m.social_manager, m.new, m.renewal, m.upgrade, m.orders, m.discounts, m.mrr, m.paying_hosts]));
  add(t('ana.x_byTier'), [t('ana.x_product'), t('ana.x_group'), t('ana.col_cash'), t('ana.col_orders')], [
    ...d.revenue.by_tier.filter((x) => x.tier !== 'social_manager').map((x) => ['Club Manager', x.tier, x.cash, x.orders]),
    ...(d.revenue.by_sm_tier || []).map((x) => ['Social Manager', x.tier, x.cash, x.orders]),
  ]);
  add(t('ana.x_finance'), [t('ana.x_metric'), t('ana.x_value')], [['MRR', d.finance.mrr], ['ARR', d.finance.arr], ['ARPU', d.finance.arpu], ['ARPA', d.finance.arpa], [t('ana.churn'), d.finance.churn.avg], ['LTV', d.finance.ltv], [t('ana.payingHosts'), d.finance.paying_hosts], [t('ana.giftedHosts'), d.finance.gifted_hosts || 0]]);
  const seg = [];
  for (const k of ['plan', 'sm_plan', 'size', 'product', 'activity', 'sport', 'tenure', 'region', 'value']) for (const g of d.segments[`by_${k}`] || []) seg.push([t(`ana.seg_${k}`), g.key, g.hosts, g.paying, g.paying_rate, g.cash, g.members]);
  add(t('ana.x_segments'), [t('ana.x_dimension'), t('ana.x_group'), 'Host', t('ana.col_paying'), '%', t('ana.col_cash'), t('ana.membersWord')], seg);
  add(t('ana.x_funnel'), [t('ana.x_step'), t('ana.x_value'), '%'], d.funnel.map((f) => [t(`ana.f_${f.key}`), f.count, f.of_first]));
  add(t('ana.x_cohorts'), [t('ana.col_cohort'), t('ana.col_accounts'), t('ana.col_hosts'), t('ana.col_hostRate'), t('ana.col_everPaid'), t('ana.col_payingNow'), t('ana.col_activeNow')], d.cohorts.map((c) => [c.month, c.accounts, c.hosts, c.host_rate, c.ever_paid, c.paying_now, c.active_now]));
  book(sheets, fileName('phan-tich', d.months[d.months.length - 1]));
}

const TABS = ['revenue', 'finance', 'segments', 'cohorts'];

export default function OwnerAnalyticsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState('revenue');
  const [months, setMonths] = useState(12);
  const { data: d, error } = useLoad(() => api.get(`/api/owner/analytics?months=${months}`), [months]);
  return (
    <OwnerShell
      title={t('owner.tabAnalytics')}
      description={t('ana.desc')}
      actions={
        <>
          <div className="flex gap-1" role="radiogroup" aria-label={t('ana.period')}>
            {[6, 12, 24].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={months === n} onClick={() => setMonths(n)} className={`rounded-md px-3 py-1.5 text-sm border ${months === n ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
                {t('ana.lastN', { n })}
              </button>
            ))}
          </div>
          <button type="button" className="btn-secondary text-sm" disabled={!d} onClick={() => exportXlsx(d, t)}>Excel</button>
        </>
      }
    >
      <div className="flex gap-1 border-b border-navy-800 mb-6 overflow-x-auto" role="tablist">
        {TABS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm ${tab === k ? 'border-amber-300 text-white font-semibold' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
            {t(`ana.tab_${k}`)}
          </button>
        ))}
      </div>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!d && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {d && tab === 'revenue' && <Revenue d={d} />}
      {d && tab === 'finance' && <Finance d={d} />}
      {d && tab === 'segments' && <Segments d={d} />}
      {d && tab === 'cohorts' && <Cohorts d={d} />}
    </OwnerShell>
  );
}

