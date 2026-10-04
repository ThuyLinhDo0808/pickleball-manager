'use client';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// Colours validated on the dark card surface #16223b (dataviz validator). Money charts
// live under /finance; this page is about play (attendance and form).
const SINGLE = '#72A313';
const SURFACE = '#16223b';
const GRID = '#1e2f4d';
const INK_MUTED = '#9ca3af';
// Sequential blue for the heatmap; on a dark surface "near zero" sits closest to the surface.
const HEAT = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'];
const HEAT_TEXT = ['#ffffff', '#ffffff', '#ffffff', '#0b1220', '#0b1220'];

const monthLabel = (ym) => `${Number(ym.slice(5))}/${ym.slice(2, 4)}`;

function heatIndex(rate) {
  if (rate < 5) return 0;
  if (rate < 10) return 1;
  if (rate < 20) return 2;
  if (rate < 35) return 3;
  return 4;
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const isClub = workspace === 'club';
  const scope = isClub ? (club ? `club_id=${club.id}` : null) : 'scope=standalone';
  const { data: ns } = useLoad(() => (scope ? api.get(`/api/analytics/no-shows?${scope}&months=6`) : Promise.resolve(null)), [scope]);
  const { data: members } = useLoad(() => (isClub && club ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve([])), [isClub, club?.id]);
  const [memberId, setMemberId] = useState('');
  const { data: form } = useLoad(
    () => (isClub && club && memberId ? api.get(`/api/analytics/player-form?club_id=${club.id}&member_id=${memberId}`) : Promise.resolve(null)),
    [club?.id, memberId]
  );
  const days = t('analytics.days').split(',');
  // Busiest / calmest slot by no-show rate (only slots with a few sign-ups count).
  const rated = (ns?.cells || []).filter((c) => c.rate != null && c.total >= 3);
  const slotInfo = {
    worst: rated.slice().sort((a, b) => b.rate - a.rate)[0] || null,
    best: rated.slice().sort((a, b) => a.rate - b.rate)[0] || null,
  };
  const formSum = form?.length
    ? (() => {
        const matches = form.reduce((n, m) => n + m.matches, 0);
        const wins = form.reduce((n, m) => n + m.wins, 0);
        return { matches, rate: matches ? Math.round((100 * wins) / matches) : 0, diff: form.reduce((n, m) => n + (m.diff || 0), 0) };
      })()
    : null;

  return (
    <AppShell>
      <PageHeader icon="📈" title={isClub ? t('nav.analyticsCharts') : t('nav.analytics')} subtitle={isClub ? club?.name : t('finX.scopeXeve')} />
      <SectionTabs group="stats" />

      {ns && (
        <KpiRow cols={4}>
          <StatTile icon="📅" label={t('anx.sessions')} value={ns.sessions} sub={t('anx.lastMonths', { n: 6 })} />
          <StatTile icon="🚫" label={t('anx.noShowRate')} value={ns.overall_rate == null ? '—' : `${ns.overall_rate}%`} tone={ns.overall_rate >= 20 ? 'text-red-300' : 'text-lime-300'} sub={t('anx.noShowSub')} />
          <StatTile icon="⚠️" label={t('anx.worst')} value={slotInfo.worst ? `${days[slotInfo.worst.weekday]} ${slotInfo.worst.slot}h` : '—'} tone="text-amber-300" sub={slotInfo.worst ? t('anx.rate', { r: Math.round(slotInfo.worst.rate) }) : t('analytics.noData')} />
          <StatTile icon="✨" label={t('anx.best')} value={slotInfo.best ? `${days[slotInfo.best.weekday]} ${slotInfo.best.slot}h` : '—'} tone="text-sky-300" sub={slotInfo.best ? t('anx.rate', { r: Math.round(slotInfo.best.rate) }) : t('analytics.noData')} />
        </KpiRow>
      )}

      <div className={`grid gap-4 ${isClub ? 'xl:grid-cols-2' : ''} items-start`}>

      {ns && (
        <section className="card">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h2 className="text-white font-semibold">🗓 {t('analytics.noShows')}</h2>
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
            <h2 className="text-white font-semibold">🎯 {t('analytics.playerForm')}</h2>
            <select className="input !w-auto text-sm" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">{t('analytics.pickPlayer')}</option>
              {(members || []).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </div>
          {!memberId && <p className="text-gray-500 text-sm py-8 text-center">👆 {t('anx.pickHint')}</p>}
          {memberId && form && form.length === 0 && <p className="text-gray-400 text-sm">{t('analytics.noData')}</p>}
          {formSum && (
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              {[
                [t('anx.matches'), formSum.matches, 'text-white'],
                [t('analytics.winRate'), `${formSum.rate}%`, 'text-lime-300'],
                [t('analytics.diff'), formSum.diff > 0 ? `+${formSum.diff}` : formSum.diff, formSum.diff < 0 ? 'text-red-300' : 'text-sky-300'],
              ].map(([k, v, tone]) => (
                <div key={k} className="rounded-lg bg-navy-900 border border-navy-700 py-2">
                  <div className="text-gray-400 text-[11px] uppercase tracking-wide">{k}</div>
                  <div className={`text-lg font-bold tabular-nums ${tone}`}>{v}</div>
                </div>
              ))}
            </div>
          )}
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
      </div>
    </AppShell>
  );
}
