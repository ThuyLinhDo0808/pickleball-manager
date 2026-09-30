'use client';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

// Colours validated on the dark card surface #16223b (dataviz validator):
// income/expense = categorical slots 1-2 (blue/orange, CVD ΔE 26.8); single series = #72A313.
const INCOME = '#3987e5';
const EXPENSE = '#d95926';
const SINGLE = '#72A313';
const SURFACE = '#16223b';
const GRID = '#1e2f4d';
const INK_MUTED = '#9ca3af';
// Sequential blue for the heatmap; on a dark surface "near zero" sits closest to the surface.
const HEAT = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'];
const HEAT_TEXT = ['#ffffff', '#ffffff', '#ffffff', '#0b1220', '#0b1220'];

const monthLabel = (ym) => `${Number(ym.slice(5))}/${ym.slice(2, 4)}`;
const kVnd = (v) => (Math.abs(v) >= 1e6 ? `${Math.round(v / 1e5) / 10}tr` : `${Math.round(v / 1000)}k`);

function heatIndex(rate) {
  if (rate < 5) return 0;
  if (rate < 10) return 1;
  if (rate < 20) return 2;
  if (rate < 35) return 3;
  return 4;
}

function Tile({ label, value, tone }) {
  return (
    <div className="card !p-3">
      <div className="text-gray-400 text-xs">{label}</div>
      <div className={`text-lg sm:text-xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const isClub = workspace === 'club';
  const scope = isClub ? (club ? `club_id=${club.id}` : null) : 'scope=standalone';
  const { data: fin } = useLoad(() => (scope ? api.get(`/api/analytics/finance?${scope}&months=12`) : Promise.resolve(null)), [scope]);
  const { data: ns } = useLoad(() => (scope ? api.get(`/api/analytics/no-shows?${scope}&months=6`) : Promise.resolve(null)), [scope]);
  const { data: members } = useLoad(() => (isClub && club ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve([])), [isClub, club?.id]);
  const [memberId, setMemberId] = useState('');
  const { data: form } = useLoad(
    () => (isClub && club && memberId ? api.get(`/api/analytics/player-form?club_id=${club.id}&member_id=${memberId}`) : Promise.resolve(null)),
    [club?.id, memberId]
  );
  const days = t('analytics.days').split(',');

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('analytics.title')}</h1>

      {fin && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Tile label={`${t('analytics.income')} · ${t('analytics.months', { n: 12 })}`} value={formatVnd(fin.totals.income)} tone="text-white" />
            <Tile label={t('analytics.expense')} value={formatVnd(fin.totals.expense)} tone="text-white" />
            <Tile label={t('analytics.net')} value={formatVnd(fin.totals.net)} tone={fin.totals.net >= 0 ? 'text-lime-400' : 'text-red-400'} />
          </div>

          <section className="card mb-4">
            <h2 className="text-white font-semibold mb-2">{t('analytics.finance')}</h2>
            <div className="h-64" role="img" aria-label={t('analytics.finance')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fin.months} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={kVnd} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs">
                          <div className="text-white font-semibold mb-1">{monthLabel(payload[0].payload.month)}</div>
                          <div className="text-gray-300"><span style={{ color: INCOME }}>■</span> {t('analytics.income')}: {formatVnd(payload[0].payload.income)}</div>
                          <div className="text-gray-300"><span style={{ color: EXPENSE }}>■</span> {t('analytics.expense')}: {formatVnd(payload[0].payload.expense)}</div>
                          <div className="text-white mt-1">{t('analytics.net')}: {formatVnd(payload[0].payload.net)}</div>
                        </div>
                      ) : null
                    }
                  />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: '#e5e7eb' }} formatter={(v) => <span className="text-gray-300">{v}</span>} />
                  <Bar name={t('analytics.income')} dataKey="income" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                  <Bar name={t('analytics.expense')} dataKey="expense" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>{t('analytics.finance')}</caption>
              <tbody>
                {fin.months.map((m) => (
                  <tr key={m.month}><td>{m.month}</td><td>{m.income}</td><td>{m.expense}</td><td>{m.net}</td></tr>
                ))}
              </tbody>
            </table>
            {fin.categories.length > 0 && (
              <div className="mt-4">
                <h3 className="text-gray-300 text-sm font-semibold mb-1">{t('analytics.categories')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  {fin.categories.map((c) => (
                    <div key={`${c.type}${c.category}`} className="flex justify-between text-sm py-1 border-b border-navy-700">
                      <span className="text-gray-300">
                        <span style={{ color: c.type === 'income' ? INCOME : EXPENSE }}>■</span>{' '}
                        {['membership', 'event_fee', 'balls'].includes(c.category) ? t(`analytics.cat_${c.category}`) : c.category === 'other' ? t('analytics.cat_other') : c.category}
                      </span>
                      <span className="text-white tabular-nums">{formatVnd(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {ns && (
        <section className="card mb-4">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h2 className="text-white font-semibold">{t('analytics.noShows')}</h2>
            {ns.overall_rate != null && <span className="text-gray-300 text-sm">{t('analytics.overall', { rate: `${ns.overall_rate}%` })}</span>}
          </div>
          <p className="text-gray-500 text-xs mb-3">{t('analytics.noShowsHint', { n: 6 })}</p>
          {ns.sessions === 0 ? (
            <p className="text-gray-400 text-sm">{t('analytics.noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th />
                    {ns.slots.map((s) => (
                      <th key={s} className="text-gray-400 font-normal px-1 pb-1 whitespace-nowrap">{s}h</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d, wd) => (
                    <tr key={d}>
                      <th className="text-gray-400 font-normal pr-2 text-left">{d}</th>
                      {ns.slots.map((s) => {
                        const c = ns.cells.find((x) => x.weekday === wd && x.slot === s);
                        const has = c && c.rate != null;
                        const i = has ? heatIndex(c.rate) : null;
                        return (
                          <td
                            key={s}
                            title={has ? t('analytics.cellTip', { rate: `${c.rate}%`, no: c.no_show, total: c.total, events: c.events }) : ''}
                            className="w-12 h-9 text-center rounded tabular-nums"
                            style={{ background: has ? HEAT[i] : GRID, color: has ? HEAT_TEXT[i] : '#4b5563' }}
                          >
                            {has ? `${Math.round(c.rate)}%` : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-1 mt-2 text-gray-400 text-xs">
                0%
                {HEAT.map((h) => <span key={h} className="w-6 h-3 rounded-sm inline-block" style={{ background: h }} />)}
                35%+
              </div>
            </div>
          )}
        </section>
      )}

      {isClub && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="text-white font-semibold">{t('analytics.playerForm')}</h2>
            <select className="input !w-auto text-sm" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">{t('analytics.pickPlayer')}</option>
              {(members || []).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
          {memberId && form && form.length === 0 && <p className="text-gray-400 text-sm">{t('analytics.noData')}</p>}
          {form?.length > 0 && (
            <div className="h-56" role="img" aria-label={t('analytics.playerForm')}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={form} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ stroke: INK_MUTED, strokeWidth: 1 }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="bg-navy-950 border border-navy-600 rounded-lg px-3 py-2 text-xs">
                          <div className="text-white font-semibold">{monthLabel(payload[0].payload.month)}</div>
                          <div className="text-gray-300">{t('analytics.winRate')}: {payload[0].payload.win_rate}% ({payload[0].payload.wins}/{payload[0].payload.matches})</div>
                          <div className="text-gray-300">{t('analytics.diff')}: {payload[0].payload.diff > 0 ? '+' : ''}{payload[0].payload.diff}</div>
                        </div>
                      ) : null
                    }
                  />
                  <Line type="monotone" dataKey="win_rate" stroke={SINGLE} strokeWidth={2} dot={{ r: 4, fill: SINGLE, stroke: SURFACE, strokeWidth: 2 }} activeDot={{ r: 5, fill: SINGLE, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
