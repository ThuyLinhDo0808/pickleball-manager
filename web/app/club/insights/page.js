'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import { useScope } from '@/lib/useScope';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

const fmtMonth = (m) => m.split('-').reverse().join('/');
const fmtDay = (d) => (d ? d.split('-').reverse().join('/') : '—');
const pctText = (v) => (v == null ? '—' : `${v}%`);

function Tile({ label, value, sub, tone }) {
  return (
    <div className="card !p-4">
      <div className="text-gray-400 text-xs">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-0.5 ${tone || 'text-white'}`}>{value}</div>
      {sub && <div className="text-gray-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

// Bars for one series by month; the value is printed above each bar.
function MonthBars({ rows, field, label, money }) {
  const max = Math.max(1, ...rows.map((r) => r[field] || 0));
  return (
    <div className="card !p-4">
      <h3 className="text-white text-sm font-semibold mb-3">{label}</h3>
      <div className="flex items-end gap-2 h-32" role="img" aria-label={`${label}: ${rows.map((r) => `${fmtMonth(r.month)} ${r[field] ?? 0}`).join(', ')}`}>
        {rows.map((r) => (
          <div key={r.month} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
            <span className="text-[10px] text-gray-300 tabular-nums">{money ? (r[field] ? `${Math.round(r[field] / 1000)}k` : '0') : r[field] ?? '—'}</span>
            <div className="w-full rounded-t bg-lime-400/80" style={{ height: `${((r[field] || 0) / max) * 80}%`, minHeight: r[field] ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1">{rows.map((r) => <span key={r.month} className="flex-1 text-center text-[10px] text-gray-500">{r.month.slice(5)}</span>)}</div>
    </div>
  );
}

// Sequential lime ramp for the heatmap (dark surface: few = dim, many = bright).
const HEAT = ['bg-lime-400/10', 'bg-lime-400/25', 'bg-lime-400/45', 'bg-lime-400/70', 'bg-lime-400'];
const DOW = [0, 1, 2, 3, 4, 5, 6];
const hh = (h) => `${String(h).padStart(2, '0')}h`;

// Weekday × hour: how many people play at each time. Metric toggles between plays,
// average players per session and number of sessions.
function Heatmap({ data, t }) {
  const [metric, setMetric] = useState('plays');
  const { cells, min_hour: lo, max_hour: hi } = data;
  if (lo == null) return <p className="text-gray-500 text-sm">{t('insights.noTimes')}</p>;
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const at = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
  const val = (c) => (c ? (metric === 'plays' ? c.plays : metric === 'avg' ? c.avg_players : c.sessions) : 0);
  const max = Math.max(1, ...cells.map(val));
  const step = (v) => (v <= 0 ? -1 : Math.min(4, Math.floor((v / max) * 4.999)));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3" role="radiogroup" aria-label={t('insights.heatMetric')}>
        {['plays', 'avg', 'sessions'].map((k) => (
          <button key={k} type="button" role="radio" aria-checked={metric === k} onClick={() => setMetric(k)} className={`rounded-full px-3 py-1 text-xs border ${metric === k ? 'border-lime-400 bg-lime-400 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
            {t(`insights.m_${k}`)}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }} aria-label={t('insights.heatTitle')}>
          <thead>
            <tr>
              <th />
              {hours.map((h) => <th key={h} className="text-[10px] text-gray-500 font-normal w-9">{hh(h)}</th>)}
            </tr>
          </thead>
          <tbody>
            {DOW.map((d) => (
              <tr key={d}>
                <th className="text-xs text-gray-400 font-normal pr-2 text-left whitespace-nowrap">{t(`insights.dow_${d}`)}</th>
                {hours.map((h) => {
                  const c = at.get(`${d}-${h}`);
                  const v = val(c);
                  const tip = c ? t('insights.heatTip', { d: t(`insights.dow_${d}`), h: hh(h), plays: c.plays, s: c.sessions, avg: c.avg_players, fill: c.fill == null ? '—' : `${c.fill}%` }) : `${t(`insights.dow_${d}`)} ${hh(h)}: —`;
                  return (
                    <td key={h} title={tip} aria-label={tip} className={`h-8 w-9 rounded text-center text-[10px] tabular-nums ${c ? HEAT[step(v)] || 'bg-navy-900' : 'bg-navy-900'} ${step(v) >= 3 ? 'text-navy-950 font-semibold' : 'text-gray-300'}`}>
                      {c ? v : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
        <span>{t('insights.heatLess')}</span>
        {HEAT.map((c) => <span key={c} className={`h-3 w-6 rounded ${c}`} aria-hidden="true" />)}
        <span>{t('insights.heatMore')}</span>
        <span className="ml-2 text-gray-500">{t(`insights.m_${metric}Hint`)}</span>
      </div>
    </div>
  );
}

function SlotList({ title, rows, t, tone }) {
  return (
    <div className="card !p-4">
      <h3 className="text-white text-sm font-semibold mb-2">{title}</h3>
      {rows.length === 0 ? <p className="text-gray-500 text-sm">—</p> : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {rows.map((c) => (
            <li key={`${c.dow}-${c.hour}`} className="flex justify-between gap-2">
              <span className="text-gray-200">{t(`insights.dow_${c.dow}`)} · {hh(c.hour)}</span>
              <span className={`tabular-nums ${tone}`}>{t('insights.slotLine', { avg: c.avg_players, s: c.sessions })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Small table helper: rows of [label, ...cells].
function Table({ title, head, rows, empty }) {
  return (
    <section className="card !p-0 overflow-x-auto">
      {title && <h2 className="text-white font-semibold text-sm px-4 pt-4 pb-2">{title}</h2>}
      {rows.length === 0 ? <p className="text-gray-500 text-sm px-4 pb-4">{empty}</p> : (
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs text-left">
            <tr className="border-b border-navy-700">{head.map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0].key} className="border-b border-navy-800 last:border-0 tabular-nums">
                {r.map((c, i) => <td key={i} className={`px-3 py-2 ${i === 0 ? 'text-white' : ''} ${c.tone || ''}`}>{c.v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const STATE = { active: ['bg-lime-400', 'text-lime-300'], at_risk: ['bg-amber-300', 'text-amber-200'], inactive: ['bg-gray-500', 'text-gray-400'] };

// Advanced analytics (Pro), in tabs so it stays readable:
//   Tổng quan · Giờ chơi (weekday × hour heatmap, best / worst slots) · Người chơi
//   (frequency, new / returning, top players, no-shows) · Hoạt động / Kèo & series
//   (per series, per kind, every session) · Tài chính (per month, per plan).
const TABS = ['overview', 'time', 'people', 'activities', 'money'];

export default function InsightsPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { community } = useScope();
  const [months, setMonths] = useState(6);
  const [show, setShow] = useState('at_risk');
  const [tab, setTab] = useState('overview');
  const { data: d, error } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/insights?months=${months}`) : Promise.resolve(null)), [club?.id, months]);
  const s = d?.summary;
  const pt = d?.patterns;
  const money = (v) => ({ v: formatVnd(v), tone: v < 0 ? 'text-red-300' : 'text-gray-200' });
  return (
    <AppShell>
      <PageHeader
        icon="🔬"
        title={t('nav.insights')}
        subtitle={club?.name}
        actions={
          <div className="flex gap-1" role="radiogroup" aria-label={t('insights.period')}>
            {[3, 6, 12].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={months === n} onClick={() => setMonths(n)} className={`rounded-full px-3 py-1 text-sm border ${months === n ? 'border-lime-400 bg-lime-400 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
                {t('insights.lastMonths', { n })}
              </button>
            ))}
          </div>
        }
      />
      <SectionTabs group="stats" />
      <UnderlineTabs value={tab} onChange={setTab} tabs={TABS.map((k) => ({ key: k, label: t(`insights.tab_${k}`), icon: { overview: '📊', time: '🕒', people: '👥', activities: '🏓', money: '💰' }[k] }))} />
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!d && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {d && (
        <div className="flex flex-col gap-5 mt-4">
          {tab === 'overview' && (
            <>
          <section>
            <h2 className="text-gray-300 text-sm font-semibold mb-2">👥 {t('insights.members')}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label={t('insights.active')} value={s.active} tone="text-lime-300" sub={t('insights.activeHint')} />
              <Tile label={t('insights.atRisk')} value={s.at_risk} tone="text-amber-200" sub={t('insights.atRiskHint')} />
              <Tile label={t('insights.inactive')} value={s.inactive} tone="text-gray-300" sub={t('insights.inactiveHint')} />
              <Tile label={t('insights.avgFreq')} value={s.avg_per_month} sub={t('insights.avgFreqHint', { n: s.official })} />
            </div>
          </section>

          <section>
            <h2 className="text-gray-300 text-sm font-semibold mb-2">📈 {t('insights.health')}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label={t('insights.retention')} value={pctText(s.retention)} sub={t('insights.retentionHint')} />
              <Tile label={t('insights.renewal')} value={pctText(s.renewal)} sub={t('insights.renewalHint', { r: s.renewal_counts.renewed, e: s.renewal_counts.ended })} />
              <Tile label={t('insights.revenuePerMember')} value={s.revenue_per_member == null ? '—' : formatVnd(s.revenue_per_member)} sub={t('insights.revenuePerMemberHint', { n: s.players })} />
              <Tile label={t('insights.income')} value={formatVnd(s.income)} sub={t('insights.incomeHint', { n: s.sessions })} />
            </div>
          </section>

          <div className="grid lg:grid-cols-3 gap-3">
            <MonthBars rows={d.by_month} field="players" label={t('insights.playersPerMonth')} />
            <MonthBars rows={d.by_month} field="retention" label={t('insights.retentionPerMonth')} />
            <MonthBars rows={d.by_month} field="income" label={t('insights.incomePerMonth')} money />
          </div>

              {pt && (
                <div className="grid md:grid-cols-2 gap-3">
                  <SlotList title={`🔥 ${t('insights.bestSlots')}`} rows={pt.best_slots} t={t} tone="text-lime-300" />
                  <SlotList title={`🧊 ${t('insights.worstSlots')}`} rows={pt.worst_slots} t={t} tone="text-gray-400" />
                </div>
              )}
            </>
          )}

          {tab === 'time' && pt && (
            <>
              <section className="card !p-4">
                <h2 className="text-white font-semibold text-sm mb-1">🗓 {t('insights.heatTitle')}</h2>
                <p className="text-gray-500 text-xs mb-3">{t('insights.heatHint')}</p>
                <Heatmap data={pt.heatmap} t={t} />
              </section>
              <div className="grid md:grid-cols-2 gap-3">
                <SlotList title={`🔥 ${t('insights.bestSlots')}`} rows={pt.best_slots} t={t} tone="text-lime-300" />
                <SlotList title={`🧊 ${t('insights.worstSlots')}`} rows={pt.worst_slots} t={t} tone="text-gray-400" />
              </div>
              <div className="grid lg:grid-cols-2 gap-3 items-start">
                <Table
                  title={`📅 ${t('insights.byWeekday')}`}
                  head={[t('insights.col_weekday'), t('insights.col_sessions'), t('insights.col_avgPlayers'), t('insights.col_avgFill'), t('insights.col_profitPerSession')]}
                  rows={pt.by_weekday.map((r) => [{ key: r.key, v: t(`insights.dow_${r.key}`) }, { v: r.sessions }, { v: r.avg_players }, { v: pctText(r.avg_fill) }, money(r.profit_per_session)])}
                  empty={t('insights.noData')}
                />
                <Table
                  title={`⏰ ${t('insights.byStartHour')}`}
                  head={[t('insights.col_startHour'), t('insights.col_sessions'), t('insights.col_avgPlayers'), t('insights.col_avgFill'), t('insights.col_profitPerSession')]}
                  rows={pt.by_start_hour.map((r) => [{ key: r.key, v: hh(r.key) }, { v: r.sessions }, { v: r.avg_players }, { v: pctText(r.avg_fill) }, money(r.profit_per_session)])}
                  empty={t('insights.noTimes')}
                />
              </div>
              <section className="card !p-4">
                <h2 className="text-white font-semibold text-sm mb-1">📦 {t('insights.fillTitle')}</h2>
                <p className="text-gray-500 text-xs mb-3">{t('insights.fillHint')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {['full', 'high', 'mid', 'low', 'open'].map((k) => (
                    <div key={k} className="rounded-lg bg-navy-900 px-2 py-2 text-center">
                      <div className="text-white text-lg font-bold tabular-nums">{pt.fill[k]}</div>
                      <div className="text-gray-400 text-[11px] leading-tight">{t(`insights.fill_${k}`)}</div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === 'people' && (
            <>
              {pt && (
                <section>
                  <h2 className="text-gray-300 text-sm font-semibold mb-2">🧑‍🤝‍🧑 {t('insights.peopleTitle')}</h2>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Tile label={t('insights.unique')} value={pt.people.unique} sub={t('insights.uniqueHint', { avg: pt.people.avg_sessions ?? 0 })} />
                    <Tile label={t('insights.returning')} value={pt.people.returning} tone="text-lime-300" sub={t('insights.returningHint')} />
                    <Tile label={t('insights.oneOff')} value={pt.people.one_off} tone="text-amber-200" sub={t('insights.oneOffHint')} />
                    <Tile label={t('insights.regulars')} value={pt.people.regulars} tone="text-sky-300" sub={t('insights.regularsHint')} />
                    <Tile label={t('insights.playsFixed')} value={pt.people.plays_by.fixed} sub={t('insights.playsHint')} />
                    <Tile label={t('insights.playsGuest')} value={pt.people.plays_by.guest} sub={t('insights.playsHint')} />
                    <Tile label={t('insights.playsWalkIn')} value={pt.people.plays_by.walk_in} sub={t('insights.playsWalkInHint')} />
                    <Tile label={t('insights.noShowRate')} value={pctText(pt.reliability.no_show_rate)} tone="text-red-300" sub={t('insights.noShowHint', { n: pt.reliability.no_show, c: pt.reliability.cancel_rate == null ? '—' : `${pt.reliability.cancel_rate}%` })} />
                  </div>
                </section>
              )}
              <div className="grid lg:grid-cols-2 gap-3 items-start">
                <section className="card !p-4">
              <h2 className="text-white font-semibold text-sm mb-1">🎯 {t('insights.frequency')}</h2>
              <p className="text-gray-500 text-xs mb-3">{t('insights.frequencyHint')}</p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {['high', 'mid', 'low', 'none'].map((b) => (
                  <div key={b} className="rounded-lg bg-navy-900 px-2 py-2 text-center">
                    <div className="text-white text-lg font-bold tabular-nums">{d.frequency.buckets[b]}</div>
                    <div className="text-gray-400 text-[11px] leading-tight">{t(`insights.b_${b}`)}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mb-2">
                {['at_risk', 'inactive', 'active'].map((k) => (
                  <button key={k} type="button" onClick={() => setShow(k)} className={`rounded-full px-3 py-1 text-xs border ${show === k ? 'border-lime-400 bg-lime-400 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
                    {t(`insights.st_${k}`)} ({s[k]})
                  </button>
                ))}
              </div>
              <ul className="divide-y divide-navy-800 max-h-80 overflow-y-auto">
                {d.frequency.members.filter((m) => m.state === show).map((m) => (
                  <li key={m.member_id} className="py-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${STATE[m.state][0]}`} aria-hidden="true" />
                      <span className="text-gray-200 truncate">{m.full_name}</span>
                    </span>
                    <span className="text-gray-400 text-xs tabular-nums whitespace-nowrap">
                      {t('insights.memberLine', { n: m.sessions, f: m.per_month })} · {m.last_played ? t('insights.lastOn', { d: fmtDay(m.last_played) }) : t('insights.never')}
                    </span>
                  </li>
                ))}
                {d.frequency.members.filter((m) => m.state === show).length === 0 && <li className="py-2 text-gray-500 text-sm">{t('insights.nobody')}</li>}
              </ul>
            </section>

                {pt && (
                  <Table
                    title={`🏆 ${t('insights.topPlayers')}`}
                    head={['#', t('common.name'), t('insights.col_type'), t('insights.col_sessions'), t('insights.col_last')]}
                    rows={pt.people.top.map((r, i) => [{ key: `${i}`, v: i + 1 }, { v: r.name }, { v: t(`insights.type_${r.type}`) }, { v: r.sessions }, { v: fmtDay(r.last) }])}
                    empty={t('insights.noData')}
                  />
                )}
              </div>
              {pt && (
                <Table
                  title={`🚫 ${t('insights.reliability')}`}
                  head={[t('insights.col_month'), t('insights.col_signups'), t('insights.col_newPlayers'), t('insights.col_noShow'), t('insights.col_cancelled')]}
                  rows={pt.reliability.by_month.map((r) => [{ key: r.month, v: fmtMonth(r.month) }, { v: r.signups }, { v: r.new_players }, { v: `${r.no_show} (${pctText(r.no_show_rate)})`, tone: r.no_show ? 'text-red-300' : '' }, { v: `${r.cancelled} (${pctText(r.cancel_rate)})` }])}
                  empty={t('insights.noData')}
                />
              )}
            </>
          )}

          {tab === 'activities' && (
            <>
              <section className="card !p-0 overflow-x-auto">
                <h2 className="text-white font-semibold text-sm px-4 pt-4 pb-2">🏓 {t('insights.byActivity')}</h2>
                {d.by_activity.length === 0 ? <p className="text-gray-500 text-sm px-4 pb-4">{t('insights.noData')}</p> : (
                  <table className="w-full text-sm">
                    <thead className="text-gray-400 text-xs text-left">
                      <tr className="border-b border-navy-700">
                        {['kind', 'sessions', 'avgPlayers', 'avgFill', 'income', 'profitPerSession'].map((k) => <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">{t(`insights.col_${k}`)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {d.by_activity.map((k) => (
                        <tr key={k.kind} className="border-b border-navy-800 last:border-0 tabular-nums">
                          <td className="px-3 py-2 text-white">{t(`insights.kind_${k.kind}`) === `insights.kind_${k.kind}` ? k.kind : t(`insights.kind_${k.kind}`)}</td>
                          <td className="px-3 py-2">{k.sessions}</td>
                          <td className="px-3 py-2">{k.avg_players}</td>
                          <td className="px-3 py-2">{pctText(k.avg_fill)}</td>
                          <td className="px-3 py-2 text-lime-300">{formatVnd(k.income)}</td>
                          <td className={`px-3 py-2 ${k.profit_per_session < 0 ? 'text-red-300' : 'text-gray-200'}`}>{formatVnd(k.profit_per_session)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
          <section className="card !p-0 overflow-x-auto">
            <h2 className="text-white font-semibold text-sm px-4 pt-4 pb-2">📋 {t('insights.sessions')}</h2>
            {d.sessions.length === 0 ? <p className="text-gray-500 text-sm px-4 pb-4">{t('insights.noData')}</p> : (
              <table className="w-full text-sm">
                <thead className="text-gray-400 text-xs text-left">
                  <tr className="border-b border-navy-700">
                    {['date', 'title', 'players', 'fill', 'income', 'expense', 'profit'].map((k) => <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">{t(`insights.col_${k}`)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.sessions.map((x) => (
                    <tr key={x.event_id} className="border-b border-navy-800 last:border-0 tabular-nums">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDay(x.date)}</td>
                      <td className="px-3 py-2 text-white max-w-[220px] truncate">{x.title}</td>
                      <td className="px-3 py-2">{x.players}{x.slots ? `/${x.slots}` : ''}</td>
                      <td className="px-3 py-2">{pctText(x.fill)}</td>
                      <td className="px-3 py-2 text-lime-300">{formatVnd(x.income)}</td>
                      <td className="px-3 py-2 text-red-300">{formatVnd(x.expense)}</td>
                      <td className={`px-3 py-2 ${x.profit < 0 ? 'text-red-300' : 'text-gray-200'}`}>{formatVnd(x.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
            </>
          )}

          {tab === 'money' && (
            <>
          <section className="card !p-0 overflow-x-auto">
            <h2 className="text-white font-semibold text-sm px-4 pt-4 pb-2">🗓 {t('insights.byMonth')}</h2>
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs text-left">
                <tr className="border-b border-navy-700">
                  {['month', 'sessions', 'players', 'newPlayers', 'retention', 'newMembers', 'membershipsSold', 'income', 'expense', 'perMember'].map((k) => <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">{t(`insights.col_${k}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.by_month.map((m) => (
                  <tr key={m.month} className="border-b border-navy-800 last:border-0 tabular-nums">
                    <td className="px-3 py-2 text-white">{fmtMonth(m.month)}</td>
                    <td className="px-3 py-2">{m.sessions}</td>
                    <td className="px-3 py-2">{m.players}</td>
                    <td className="px-3 py-2">{m.new_players}</td>
                    <td className="px-3 py-2">{pctText(m.retention)}</td>
                    <td className="px-3 py-2">{m.new_members}</td>
                    <td className="px-3 py-2">{m.memberships_sold}</td>
                    <td className="px-3 py-2 text-lime-300">{formatVnd(m.income)}</td>
                    <td className="px-3 py-2 text-red-300">{formatVnd(m.expense)}</td>
                    <td className="px-3 py-2">{m.revenue_per_member == null ? '—' : formatVnd(m.revenue_per_member)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

              <section className="card !p-0 overflow-x-auto">
                <h2 className="text-white font-semibold text-sm px-4 pt-4 pb-2">💳 {t('insights.byPlan')}</h2>
                {d.by_plan.length === 0 ? <p className="text-gray-500 text-sm px-4 pb-4">{t('insights.noPlans')}</p> : (
                  <table className="w-full text-sm">
                    <thead className="text-gray-400 text-xs text-left">
                      <tr className="border-b border-navy-700">
                        {['plan', 'sold', 'buyers', 'revenue', 'renewal'].map((k) => <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">{t(`insights.col_${k}`)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {d.by_plan.map((p) => (
                        <tr key={p.plan_id} className="border-b border-navy-800 last:border-0 tabular-nums">
                          <td className="px-3 py-2 text-white">{p.name}</td>
                          <td className="px-3 py-2">{p.sold}</td>
                          <td className="px-3 py-2">{p.members}</td>
                          <td className="px-3 py-2 text-lime-300">{formatVnd(p.revenue)}</td>
                          <td className="px-3 py-2">{pctText(p.renewal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}

          <p className="text-gray-500 text-xs">{t('insights.footnote')}</p>
        </div>
      )}
    </AppShell>
  );
}
