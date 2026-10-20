'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import Segmented from '@/components/ui/Segmented';
import { Change } from '@/components/DuprMembers';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';
import Hint from '@/components/ui/Hint';

const fmtRating = (v) => (v == null ? 'NR' : Number(v).toFixed(3));
const fmtMonth = (m) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
// Match states, in the order they are stacked; each has its own colour and a label in the legend.
const STATES = [
  { key: 'exported', color: '#a3e635' },
  { key: 'ready', color: '#38bdf8' },
  { key: 'blocked', color: '#fbbf24' },
  { key: 'no_score', color: '#6b7280' },
];

// Thống kê → DUPR (pickleball): statistics only — members' DUPR ratings going up / down, and
// the club's matches: sent to DUPR, ready, blocked by a missing DUPR ID, without a score.
// Managing IDs and importing the DUPR list live in Thành viên → DUPR; sending matches lives in
// each kèo / session / tournament.
export default function DuprStatsPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const [months, setMonths] = useState(3);
  const [sort, setSort] = useState('change');
  const { data: d, error } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/dupr/stats?months=${months}`) : Promise.resolve(null)), [club?.id, months]);
  const notPickleball = error?.payload?.code === 'not_pickleball' || (club?.sport && club.sport !== 'pickleball');

  const players = d ? [...d.players].sort((a, b) => (sort === 'rating' ? (b.doubles ?? -1) - (a.doubles ?? -1) : (b.change ?? -99) - (a.change ?? -99) || (b.doubles ?? -1) - (a.doubles ?? -1))) : [];
  const m = d?.matches;
  const scored = m ? m.total - m.no_score : 0;

  return (
    <AppShell>
      <PageHeader
        icon="📈"
        title={t('dupr.title')}
        subtitle={club?.name}
        actions={<Link href="/club/members/dupr" className="btn-secondary text-sm">👥 {t('dupr.manageIds')}</Link>}
      />
      <SectionTabs group="stats" />
      {notPickleball ? (
        <p className="card text-gray-300 text-sm">{t('dupr.onlyPickleball')}</p>
      ) : error ? (
        <p className="card text-red-300 text-sm">{error.payload?.code === 'migration_required' ? t('dupr.needMigration') : error.message}</p>
      ) : !d ? (
        <p className="text-gray-400 text-sm">{t('common.loading')}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-gray-400 text-sm">{t('dupr.period', { from: d.from.split('-').reverse().join('/') })}</p>
            <Segmented items={[1, 3, 6, 12]} value={months} onChange={setMonths} label={(k) => t('dupr.monthsN', { n: k })} />
          </div>

          <KpiRow cols={4}>
            <StatTile icon="🔗" label={t('dupr.statLinked')} value={`${d.members.linked}/${d.members.total}`} sub={t('dupr.withId', { n: d.members.with_id })} />
            <StatTile icon="🎯" label={t('dupr.avgDoubles')} value={d.ratings.avg_doubles != null ? d.ratings.avg_doubles.toFixed(3) : '—'} tone="text-lime-300" sub={d.imports[0] ? t('dupr.updatedOn', { date: localDate(new Date(d.imports[0].created_at), 'vi-VN') }) : t('dupr.neverImported')} />
            <StatTile icon="📊" label={t('dupr.upDown')} value={<><span className="text-lime-300">▲{d.ratings.up}</span> <span className="text-red-300">▼{d.ratings.down}</span></>} sub={t('dupr.sameN', { n: d.ratings.same })} />
            <StatTile icon="📤" label={t('dupr.sentLabel')} value={`${m.exported}/${scored}`} tone="text-sky-300" sub={m.blocked ? t('dupr.blockedN', { n: m.blocked }) : t('dupr.readyN', { n: m.ready })} />
          </KpiRow>

          {/* Ratings per member */}
          <section className="card !p-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-2">
              <div>
                <h2 className="text-white font-semibold">{t('dupr.ratingsTitle')} <Hint inline text={t('dupr.ratingsHint')} /></h2>
              </div>
              <Segmented items={['change', 'rating']} value={sort} onChange={setSort} label={(k) => t(`dupr.sort_${k}`)} />
            </div>
            {players.length === 0 ? (
              <p className="text-gray-500 text-sm px-4 pb-4">{t('dupr.noLinked')} <Link href="/club/members/dupr" className="underline text-lime-300">{t('dupr.manageIds')}</Link></p>
            ) : (
              <div className="table-wrap">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs text-left border-b border-navy-700">
                      <th className="py-2 px-4 font-medium">{t('dupr.col_member')}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t('dupr.col_doubles')}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t('dupr.col_change', { n: months })}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t('dupr.col_last')}</th>
                      <th className="py-2 pr-3 font-medium">{t('dupr.col_trend')}</th>
                      <th className="py-2 pr-4 font-medium text-right">{t('dupr.col_singles')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => (
                      <tr key={p.member_id} className="border-b border-navy-800 last:border-0 tabular-nums">
                        <td className="py-2 px-4">
                          <span className="text-white">{p.full_name}</span>
                          <span className="block font-mono text-[11px] text-gray-500">{p.dupr_id}</span>
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <span className="text-white font-semibold">{fmtRating(p.doubles)}</span>
                          {p.doubles_rel != null && <span className="block text-[11px] text-gray-500">{t('dupr.rel', { n: p.doubles_rel })}</span>}
                        </td>
                        <td className="py-2 pr-3 text-right">{p.change ? <Change v={p.change} className="!text-sm" /> : <span className="text-gray-500">—</span>}</td>
                        <td className="py-2 pr-3 text-right">{p.last_change ? <Change v={p.last_change} /> : <span className="text-gray-500 text-xs">—</span>}</td>
                        <td className="py-2 pr-3"><Spark points={p.points} label={t('dupr.trendOf', { name: p.full_name })} /></td>
                        <td className="py-2 pr-4 text-right text-gray-300">{fmtRating(p.singles)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Matches and DUPR */}
          <section className="card">
            <h2 className="text-white font-semibold">{t('dupr.matchesTitle')} <Hint inline text={t('dupr.matchesHint')} /></h2>
            <Legend />
            {m.total === 0 ? (
              <p className="text-gray-500 text-sm mt-3">{t('dupr.noMatches')}</p>
            ) : (
              <>
                <div className="mt-3 flex flex-col gap-2">
                  {m.by_month.map((row) => (
                    <StackRow key={row.month} label={fmtMonth(row.month)} row={row} max={Math.max(...m.by_month.map((x) => x.total))} />
                  ))}
                </div>
                <div className="table-wrap mt-4">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="text-gray-400 text-xs text-left border-b border-navy-700">
                        <th className="py-2 pr-3 font-medium">{t('dupr.col_source')}</th>
                        <th className="py-2 pr-3 font-medium text-right">{t('dupr.col_total')}</th>
                        {STATES.map((s) => <th key={s.key} className="py-2 pr-3 font-medium text-right">{t(`dupr.state_${s.key}`)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {['event', 'club', 'tournament'].filter((k) => m.by_source[k].total).map((k) => (
                        <tr key={k} className="border-b border-navy-800 last:border-0">
                          <td className="py-2 pr-3 text-white">{t(`dupr.source_${k}`)}</td>
                          <td className="py-2 pr-3 text-right text-white">{m.by_source[k].total}</td>
                          {STATES.map((s) => <td key={s.key} className="py-2 pr-3 text-right text-gray-200">{m.by_source[k][s.key] || '—'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {m.blockers.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-300/5 p-3">
                <p className="text-amber-200 text-sm font-semibold">⚠ {t('dupr.blockersTitle')} <Hint inline text={t('dupr.blockersHint')} /></p>
                <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                  {m.blockers.map((b) => (
                    <li key={b.name} className="rounded-full border border-navy-600 px-2.5 py-0.5 text-gray-200">
                      {b.name} <span className="text-gray-400 text-xs">· {t('dupr.nMatches', { n: b.matches })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Import history */}
          <section className="card">
            <h2 className="text-white font-semibold mb-2">{t('dupr.importsTitle')}</h2>
            {d.imports.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('dupr.neverImported')}</p>
            ) : (
              <div className="table-wrap">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-gray-400 text-xs text-left border-b border-navy-700">
                      <th className="py-2 pr-3 font-medium">{t('dupr.col_date')}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t('dupr.col_rows')}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t('dupr.col_newIds')}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t('dupr.col_linkedNew')}</th>
                      <th className="py-2 pr-3 font-medium text-right">{t('dupr.col_updated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.imports.map((x) => (
                      <tr key={x.created_at} className="border-b border-navy-800 last:border-0">
                        <td className="py-2 pr-3 text-gray-200">{localDate(new Date(x.created_at), 'vi-VN', { dateStyle: 'short', timeStyle: 'short' }, true)}</td>
                        <td className="py-2 pr-3 text-right text-gray-200">{x.rows_total}{x.duplicates > 0 && <span className="text-gray-500 text-xs"> (−{x.duplicates})</span>}</td>
                        <td className="py-2 pr-3 text-right text-gray-200">{x.new_ids}</td>
                        <td className="py-2 pr-3 text-right text-lime-300">{x.linked_new}</td>
                        <td className="py-2 pr-3 text-right text-gray-200">{x.updated}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function Legend() {
  const { t } = useI18n();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-300">
      {STATES.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
          {t(`dupr.state_${s.key}`)}
        </li>
      ))}
    </ul>
  );
}

// One month: a stacked bar (sent / ready / blocked / no score), 2px gaps between segments.
function StackRow({ label, row, max }) {
  const { t } = useI18n();
  const tip = STATES.map((s) => `${t(`dupr.state_${s.key}`)}: ${row[s.key]}`).join(' · ');
  return (
    <div className="flex items-center gap-3 text-xs" title={tip}>
      <span className="w-10 shrink-0 text-gray-400 tabular-nums">{label}</span>
      <div className="flex-1 flex gap-[2px] h-4" role="img" aria-label={`${label}: ${tip}`} style={{ maxWidth: `${(row.total / max) * 100}%` }}>
        {STATES.filter((s) => row[s.key] > 0).map((s, i, arr) => (
          <span key={s.key} className={`h-full ${i === arr.length - 1 ? 'rounded-r' : ''} ${i === 0 ? 'rounded-l' : ''}`} style={{ background: s.color, flex: row[s.key] }} />
        ))}
      </div>
      <span className="w-8 text-right text-gray-300 tabular-nums">{row.total}</span>
    </div>
  );
}

// Small doubles-rating trend line (one point per import where the rating changed).
function Spark({ points, label }) {
  const vals = (points || []).map((p) => p.doubles).filter((v) => v != null);
  if (vals.length < 2) return <span className="text-gray-600 text-xs">—</span>;
  const w = 84;
  const h = 24;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const xy = vals.map((v, i) => [2 + (i * (w - 4)) / (vals.length - 1), h - 3 - ((v - lo) / span) * (h - 6)]);
  const up = vals[vals.length - 1] >= vals[0];
  const color = up ? '#a3e635' : '#f87171';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${vals.map((v) => v.toFixed(3)).join(' → ')}`}>
      <title>{vals.map((v) => v.toFixed(3)).join(' → ')}</title>
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="2.5" fill={color} />
    </svg>
  );
}
