'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import SectionTabs from '@/components/ui/SectionTabs';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const fmtMonth = (m) => m.split('-').reverse().join('/');
const fmtDay = (d) => (d ? d.split('-').reverse().join('/') : '—');
const num = (v) => (v == null ? '—' : v);
const pct = (v) => (v == null ? '—' : `${v}%`);

function Tile({ label, value, sub, tone }) {
  return (
    <div className="card !p-4">
      <div className="text-gray-400 text-xs">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-0.5 ${tone || 'text-white'}`}>{value}</div>
      {sub && <div className="text-gray-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

// Average overall stars per month (0–5 scale), value printed above each bar.
function StarBars({ rows, label }) {
  return (
    <div className="card !p-4">
      <h3 className="text-white text-sm font-semibold mb-3">{label}</h3>
      <div className="flex items-end gap-2 h-32" role="img" aria-label={`${label}: ${rows.map((r) => `${fmtMonth(r.month)} ${num(r.average)}`).join(', ')}`}>
        {rows.map((r) => (
          <div key={r.month} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${fmtMonth(r.month)}: ★ ${num(r.average)} (${r.count})`}>
            <span className="text-[10px] text-gray-300 tabular-nums">{num(r.average)}</span>
            <div className="w-full rounded-t bg-amber-300/80" style={{ height: `${((r.average || 0) / 5) * 80}%`, minHeight: r.average ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1">{rows.map((r) => <span key={r.month} className="flex-1 text-center text-[10px] text-gray-500">{r.month.slice(5)}</span>)}</div>
    </div>
  );
}

// Share of each answer as a stacked bar with a legend (level fit / come back).
function Split({ title, parts }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  return (
    <div className="card !p-4">
      <h3 className="text-white text-sm font-semibold mb-3">{title}</h3>
      {total === 0 ? <p className="text-gray-500 text-sm">—</p> : (
        <>
          <div className="flex h-3 rounded overflow-hidden gap-0.5" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
            {parts.filter((p) => p.n).map((p) => <div key={p.label} className={p.color} style={{ width: `${(100 * p.n) / total}%` }} />)}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-1.5 text-gray-300">
                <span className={`h-2.5 w-2.5 rounded-sm ${p.color}`} aria-hidden="true" />
                {p.label} <span className="tabular-nums text-gray-400">{p.n} ({Math.round((100 * p.n) / total)}%)</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// After-session reviews of the club: totals, trend by month, every session, the private
// notes players left for the Host, and who wants to join the fixed team.
export default function ReviewsPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const [months, setMonths] = useState(6);
  const { data: d, error } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/surveys?months=${months}`) : Promise.resolve(null)), [club?.id, months]);
  const s = d?.summary;
  return (
    <AppShell>
      <PageHeader
        icon="⭐"
        title={t('reviews.title')}
        subtitle={club?.name}
        actions={
          <div className="flex gap-1" role="radiogroup">
            {[3, 6, 12].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={months === n} onClick={() => setMonths(n)} className={`rounded-full px-3 py-1 text-sm border ${months === n ? 'border-lime-400 bg-lime-400 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
                {t('reviews.lastMonths', { n })}
              </button>
            ))}
          </div>
        }
      />
      <SectionTabs group="stats" />
      <p className="text-gray-400 text-sm mb-4">{t('reviews.subtitle')}</p>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!d && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {d && s.count === 0 && <p className="card text-gray-500 text-sm">{t('reviews.empty')}</p>}
      {d && s.count > 0 && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tile label={t('reviews.answers')} value={s.count} />
            <Tile label={t('reviews.overall')} value={`★ ${num(s.average)}`} tone="text-amber-300" />
            <Tile label={`🏟 ${t('reviews.court')}`} value={num(s.court)} />
            <Tile label={`📋 ${t('reviews.org')}`} value={num(s.organization)} />
            <Tile label={`↩︎ ${t('reviews.comeBack')}`} value={pct(s.come_back_rate)} tone="text-lime-300" sub={t('reviews.comeBackHint', s.come_back)} />
          </div>

          <div className="grid lg:grid-cols-3 gap-3">
            <StarBars rows={d.by_month} label={t('reviews.chartLabel')} />
            <Split
              title={t('reviews.levelTitle')}
              parts={[
                { label: t('survey.level_easy'), n: s.level.easy, color: 'bg-sky-300' },
                { label: t('survey.level_right'), n: s.level.right, color: 'bg-lime-400' },
                { label: t('survey.level_hard'), n: s.level.hard, color: 'bg-amber-300' },
              ]}
            />
            <Split
              title={t('survey.qComeBack')}
              parts={[
                { label: t('survey.back_yes'), n: s.come_back.yes, color: 'bg-lime-400' },
                { label: t('survey.back_maybe'), n: s.come_back.maybe, color: 'bg-gray-400' },
                { label: t('survey.back_no'), n: s.come_back.no, color: 'bg-red-400' },
              ]}
            />
          </div>

          <section className="card !p-0 overflow-x-auto">
            <h2 className="text-white font-semibold text-sm px-4 pt-4 pb-2">🗓 {t('reviews.byMonth')}</h2>
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs text-left">
                <tr className="border-b border-navy-700">
                  {['col_month', 'col_answers', 'overall', 'court', 'org', 'comeBack', 'wantJoin'].map((k) => <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">{t(`reviews.${k}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.by_month.map((m) => (
                  <tr key={m.month} className="border-b border-navy-800 last:border-0 tabular-nums">
                    <td className="px-3 py-2 text-white">{fmtMonth(m.month)}</td>
                    <td className="px-3 py-2">{m.count}</td>
                    <td className="px-3 py-2 text-amber-300">★ {num(m.average)}</td>
                    <td className="px-3 py-2">{num(m.court)}</td>
                    <td className="px-3 py-2">{num(m.organization)}</td>
                    <td className="px-3 py-2">{pct(m.come_back_rate)}</td>
                    <td className="px-3 py-2">{m.wants_join}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card !p-0 overflow-x-auto">
            <h2 className="text-white font-semibold text-sm px-4 pt-4 pb-2">📋 {t('reviews.bySession')}</h2>
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs text-left">
                <tr className="border-b border-navy-700">
                  {['col_date', 'col_session', 'col_answers', 'overall', 'court', 'org', 'comeBack'].map((k) => <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">{t(`reviews.${k}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.sessions.map((x) => (
                  <tr key={x.event_id} className="border-b border-navy-800 last:border-0 tabular-nums">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDay(x.date)}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate"><Link href={`/events/${x.event_id}`} className="text-white hover:underline">{x.title}</Link></td>
                    <td className="px-3 py-2">{x.count}</td>
                    <td className="px-3 py-2 text-amber-300">★ {num(x.average)}</td>
                    <td className="px-3 py-2">{num(x.court)}</td>
                    <td className="px-3 py-2">{num(x.organization)}</td>
                    <td className={`px-3 py-2 ${x.come_back_rate != null && x.come_back_rate < 50 ? 'text-red-300' : ''}`}>{pct(x.come_back_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="grid lg:grid-cols-2 gap-3">
            <section className="card !p-4">
              <h2 className="text-white font-semibold text-sm mb-2">🔒 {t('reviews.notes')}</h2>
              {d.notes.length === 0 ? <p className="text-gray-500 text-sm">{t('reviews.notesEmpty')}</p> : (
                <ul className="flex flex-col divide-y divide-navy-700 text-sm">
                  {d.notes.map((n, i) => (
                    <li key={i} className="py-2">
                      <p className="text-gray-200">“{n.comment}”</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {n.full_name || '—'} · <span className="text-amber-300">{'★'.repeat(n.rating)}</span> · {fmtDay(n.date)} · {n.title}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card !p-4">
              <h2 className="text-white font-semibold text-sm mb-2">🤝 {t('reviews.wantJoin')}</h2>
              {d.want_join.length === 0 ? <p className="text-gray-500 text-sm">{t('reviews.wantJoinEmpty')}</p> : (
                <ul className="flex flex-col divide-y divide-navy-700 text-sm">
                  {d.want_join.map((w, i) => (
                    <li key={i} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="text-white">{w.full_name || '—'}</span>
                        <span className="text-xs text-gray-500"> · {fmtDay(w.date)} · {w.title}</span>
                      </span>
                      {w.state === 'requested' ? (
                        <Link href="/club/members" className="text-xs rounded border border-lime-400/60 text-lime-300 px-1.5 py-0.5">{t('reviews.state_requested')}</Link>
                      ) : (
                        <span className={`text-xs rounded border px-1.5 py-0.5 ${w.state === 'member' ? 'border-navy-500 text-gray-400' : 'border-amber-300/50 text-amber-200'}`}>{t(`reviews.state_${w.state}`)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
