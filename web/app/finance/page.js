'use client';
import { useState } from 'react';
import Link from 'next/link';
import FinanceTrend from '@/components/FinanceTrend';
import PendingPayments from '@/components/PendingPayments';
import EventPaymentsPending from '@/components/EventPaymentsPending';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useScope } from '@/lib/useScope';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { todayYmd } from '@/lib/dates';

import { categoryLabel, EXPENSE_COLOR, INCOME_COLOR } from '@/lib/finance';

function Tile({ icon, label, value, tone = 'text-white', sub }) {
  return (
    <div className="card !p-4">
      <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wide">
        <span>{label}</span>
        <span aria-hidden="true">{icon}</span>
      </div>
      <div className={`text-xl font-bold tabular-nums mt-1 whitespace-nowrap ${tone}`}>{value}</div>
      {sub && <div className="text-gray-400 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

// Where the money came from / went, as bars (last 12 months).
function Breakdown({ title, rows, total, color, t }) {
  return (
    <div className="card !p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold">{title}</h3>
        <span className="text-gray-400 text-xs tabular-nums">{formatVnd(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-gray-500 text-sm">—</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.slice(0, 6).map((r) => {
            const pct = total ? Math.round((100 * r.amount) / total) : 0;
            return (
              <li key={r.category}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-gray-200 truncate">{categoryLabel(r.category, t)}</span>
                  <span className="text-gray-300 tabular-nums shrink-0">{formatVnd(r.amount)} <span className="text-gray-500 text-xs">· {pct}%</span></span>
                </div>
                <div className="h-1.5 rounded-full bg-navy-900 mt-1 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%`, background: color }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Social Manager: the month day by day — sessions, players, money in / out, profit, owed.
function DailyOverview({ daily, isYear, label }) {
  const { t, lang } = useI18n();
  return (
    <section className="card !p-5 mb-4">
      <h2 className="text-white font-semibold mb-1">📅 {t('social.daily')} · {label}</h2>
      {isYear && <p className="text-gray-500 text-xs mb-2">{t('social.dailyYearHint')}</p>}
      {!daily && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {daily && daily.days.length === 0 && <p className="text-gray-400 text-sm">{t('social.dailyNone')}</p>}
      {daily && daily.days.length > 0 && (
        <div className="table-wrap">
          <table className="w-full text-sm grid-table !min-w-[40rem]">
            <thead>
              <tr className="text-gray-300 text-left bg-navy-900">
                <th>{t('fin.date')}</th>
                <th className="text-right">{t('social.sessions')}</th>
                <th className="text-right">{t('fin.playersCol')}</th>
                <th className="text-right">{t('analytics.income')}</th>
                <th className="text-right">{t('analytics.expense')}</th>
                <th className="text-right">{t('social.profit')}</th>
                <th className="text-right">{t('social.unpaid')}</th>
              </tr>
            </thead>
            <tbody>
              {daily.days.map((d) => (
                <tr key={d.date}>
                  <td className="text-gray-200 whitespace-nowrap capitalize">{new Date(`${d.date}T00:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                  <td className="text-right tabular-nums text-gray-300">{d.sessions || '—'}</td>
                  <td className="text-right tabular-nums text-gray-300">{d.players || '—'}</td>
                  <td className="text-right tabular-nums text-lime-400">{formatVnd(d.income)}</td>
                  <td className="text-right tabular-nums text-orange-300">{formatVnd(d.expense)}</td>
                  <td className={`text-right tabular-nums font-semibold ${d.profit < 0 ? 'text-red-400' : 'text-white'}`}>{formatVnd(d.profit)}</td>
                  <td className="text-right tabular-nums text-amber-200">{d.unpaid ? formatVnd(d.unpaid) : '—'}</td>
                </tr>
              ))}
              <tr className="bg-navy-900/60 font-semibold">
                <td className="text-white">{t('social.total')}</td>
                <td className="text-right tabular-nums text-white">{daily.totals.sessions}</td>
                <td className="text-right tabular-nums text-white">{daily.totals.players}</td>
                <td className="text-right tabular-nums text-lime-400">{formatVnd(daily.totals.income)}</td>
                <td className="text-right tabular-nums text-orange-300">{formatVnd(daily.totals.expense)}</td>
                <td className={`text-right tabular-nums ${daily.totals.profit < 0 ? 'text-red-400' : 'text-white'}`}>{formatVnd(daily.totals.profit)}</td>
                <td className="text-right tabular-nums text-amber-200">{formatVnd(daily.totals.unpaid)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Finance overview: fund balance, the year's trend, payments to confirm, money per event.
export default function FinanceOverview() {
  const { t, lang } = useI18n();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const { scoped: isClub } = useScope();
  const scope = isClub ? (club ? `club_id=${club.id}` : null) : 'scope=standalone';

  // Views follow the calendar: one month (‹ ›), or a whole year ("Năm 2026").
  const today = todayYmd();
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = today.slice(0, 7);
  const [year, setYear] = useState(thisYear);
  const [view, setView] = useState('month'); // 'month' | 'year'
  const [ymPick, setYmPick] = useState(thisMonth);
  const { data: finNow } = useLoad(() => (scope ? api.get(`/api/analytics/finance?${scope}&year=${thisYear}`) : Promise.resolve(null)), [scope, thisYear]);
  const { data: finYear } = useLoad(() => (scope && year !== thisYear ? api.get(`/api/analytics/finance?${scope}&year=${year}`) : Promise.resolve(null)), [scope, year, thisYear]);
  const fin = year === thisYear ? finNow : finYear;
  const { data: pnl } = useLoad(() => (scope ? api.get(`/api/analytics/events-pnl?${scope}&year=${year}`).catch((e) => (e.status === 402 ? 'locked' : Promise.reject(e))) : Promise.resolve(null)), [scope, year]);
  const { data: fund } = useLoad(() => (isClub && club ? api.get(`/api/clubs/${club.id}/fund`) : Promise.resolve(null)), [isClub, club?.id]);
  // Social Manager (communities and one-off kèo): the money day by day, and the profit to expect.
  const social = workspace === 'xeve';
  const { data: daily } = useLoad(() => (social && scope ? api.get(`/api/analytics/daily?${scope}&month=${ymPick}`).catch(() => null) : Promise.resolve(null)), [social, scope, ymPick]);

  const isYear = view === 'year';
  const periodCats = isYear ? fin?.categories || [] : fin?.month_categories?.[ymPick] || [];
  const income = periodCats.filter((c) => c.type === 'income');
  const expense = periodCats.filter((c) => c.type === 'expense');
  const periodTotal = (type) => periodCats.filter((c) => c.type === type).reduce((a, c) => a + c.amount, 0);
  const pnlLocked = pnl === 'locked';
  const pnlShown = (Array.isArray(pnl) ? pnl : []).filter((e) => isYear || e.event_date.startsWith(ymPick));
  const yearLabel = t('fin.yearN', { y: year });
  const periodLabel = isYear ? yearLabel : `${Number(ymPick.slice(5))}/${ymPick.slice(0, 4)}`;
  const canNext = isYear ? year < thisYear : ymPick < thisMonth;
  function step(d) {
    if (isYear) return setYear(year + d);
    const [y, m] = ymPick.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
    setYmPick(next);
    setYear(Number(next.slice(0, 4)));
  }
  function toggleYear() {
    if (isYear) {
      // Back to months: the latest month of the year shown.
      const ym = year === thisYear ? thisMonth : `${year}-12`;
      setYmPick(ym);
      setView('month');
    } else {
      setView('year');
    }
  }
  const bal = Number(fund?.balance || 0);

  // Thu / Chi for the month or year picked above (the fund balance sits beside them).
  const picked = isYear ? fin?.totals : fin?.months.find((m) => m.month === ymPick);

  return (
    <>
      <div className="card !p-3 mb-4 flex flex-wrap items-center gap-2">
        <span className="text-gray-400 text-sm">{t('finX.viewing')}</span>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-secondary !px-3 !py-1" onClick={() => step(-1)} aria-label={t('cal.prev')}>‹</button>
          <span className="text-white font-semibold text-sm px-2 tabular-nums min-w-[5.5rem] text-center">{periodLabel}</span>
          <button type="button" className="btn-secondary !px-3 !py-1" disabled={!canNext} onClick={() => step(1)} aria-label={t('cal.next')}>›</button>
        </div>
        <div className="grid grid-cols-2 bg-navy-950 rounded-lg p-1 text-sm">
          {['month', 'year'].map((k) => (
            <button key={k} type="button" onClick={() => (k === view ? null : toggleYear())} className={`rounded-md px-3 py-1 ${view === k ? 'bg-lime-400 text-navy-950 font-semibold' : 'text-gray-400'}`}>
              {k === 'month' ? t('fin.byMonth') : t('fin.byYear')}
            </button>
          ))}
        </div>
        <Link href="/finance/ledger" className="btn-primary text-sm sm:ml-auto">+ {t('finX.addEntry')}</Link>
      </div>

      <div className={`grid gap-4 mb-4 ${isClub || social ? 'lg:grid-cols-[1fr_2.4fr]' : ''}`}>
        {/* Social Manager: "Lợi nhuận dự kiến" = income − costs + what players still owe, for the period. */}
        {social && (
          <div className="relative overflow-hidden rounded-2xl border border-navy-700 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-5 sm:p-6 flex flex-col justify-center">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-lime-400/10 blur-2xl" aria-hidden="true" />
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{t('social.expectedProfit')} · {periodLabel}</p>
            {(() => {
              const owed = !isYear && daily ? daily.totals.unpaid : 0;
              const v = picked ? Number(picked.income) - Number(picked.expense) + owed : null;
              return <div className={`text-3xl sm:text-4xl font-bold tabular-nums mt-1 ${v < 0 ? 'text-red-400' : 'text-lime-400'}`}>{v == null ? '—' : formatVnd(v)}</div>;
            })()}
            <p className="text-gray-500 text-xs mt-1">{isYear ? t('social.expectedProfitYear') : t('social.expectedProfitHint', { owed: formatVnd(daily?.totals.unpaid || 0) })}</p>
          </div>
        )}
        {/* The club fund: what is in it now, whatever the period. */}
        {isClub && !social && (
          <div className="relative overflow-hidden rounded-2xl border border-navy-700 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-5 sm:p-6 flex flex-col justify-center">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-lime-400/10 blur-2xl" aria-hidden="true" />
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{t('fin.balance')}</p>
            <div className={`text-3xl sm:text-4xl font-bold tabular-nums mt-1 ${bal < 0 ? 'text-red-400' : 'text-lime-400'}`}>{fund ? formatVnd(bal) : '—'}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 content-start">
          <Tile icon="📈" label={`${t('analytics.income')} · ${periodLabel}`} value={picked ? formatVnd(picked.income) : '—'} tone="text-lime-400" />
          <Tile icon="📉" label={`${t('analytics.expense')} · ${periodLabel}`} value={picked ? formatVnd(picked.expense) : '—'} tone="text-orange-300" />
        </div>
      </div>

      {fin && <div className="mb-4"><FinanceTrend fin={fin} compact /></div>}

      {social && <DailyOverview daily={daily} isYear={isYear} label={`${Number(ymPick.slice(5))}/${ymPick.slice(0, 4)}`} />}

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <Breakdown title={`💚 ${t('finX.incomeByP', { p: periodLabel })}`} rows={income} total={periodTotal('income')} color={INCOME_COLOR} t={t} />
        <Breakdown title={`🧾 ${t('finX.expenseByP', { p: periodLabel })}`} rows={expense} total={periodTotal('expense')} color={EXPENSE_COLOR} t={t} />
      </div>

      <EventPaymentsPending />
      {isClub && <PendingPayments club={club} />}

      <section className="card !p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-white font-semibold">🏓 {t('fin.eventPnl')} · {periodLabel}</h2>
          {pnlShown.length > 0 && (
            <span className="text-xs text-gray-400">
              {t('finX.pnlSummary', { win: pnlShown.filter((e) => e.net >= 0).length, lose: pnlShown.filter((e) => e.net < 0).length })}
            </span>
          )}
        </div>
        {pnlLocked && <LockedFeature feature="finance_reports" compact />}
        {Array.isArray(pnl) && pnlShown.length === 0 && <p className="text-gray-400 text-sm">{t('fin.eventPnlNone')}</p>}
        {pnlShown.length > 0 && (
          <div className="table-wrap">
            <table className="w-full text-sm grid-table">
              <thead>
                <tr className="text-gray-300 text-left bg-navy-900">
                  <th>{t('events.title')}</th>
                  <th>{t('events.date')}</th>
                  <th className="text-right">{t('fin.playersCol')}</th>
                  <th className="text-right">{t('analytics.income')}</th>
                  <th className="text-right">{t('analytics.expense')}</th>
                  <th className="text-right">{social ? t('social.profit') : t('analytics.net')}</th>
                </tr>
              </thead>
              <tbody>
                {pnlShown.map((e) => (
                  <tr key={e.event_id}>
                    <td>
                      <Link href={`/events/${e.event_id}`} className="text-white hover:text-lime-400">{e.title}</Link>
                    </td>
                    <td className="text-gray-300">{new Date(`${e.event_date}T00:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB')}</td>
                    <td className="text-right tabular-nums text-gray-300">{e.players}</td>
                    <td className="text-right tabular-nums text-gray-300">{formatVnd(e.income)}</td>
                    <td className="text-right tabular-nums text-gray-300">{formatVnd(e.expense)}</td>
                    <td className={`text-right tabular-nums font-semibold ${e.net >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
                      {e.net > 0 ? '+' : ''}{formatVnd(e.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
