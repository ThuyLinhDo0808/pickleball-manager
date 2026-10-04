'use client';
import Link from 'next/link';
import FinanceTrend from '@/components/FinanceTrend';
import PendingPayments from '@/components/PendingPayments';
import EventPaymentsPending from '@/components/EventPaymentsPending';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

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

// Finance overview: fund balance, 12-month trend, payments to confirm, profit per event.
export default function FinanceOverview() {
  const { t, lang } = useI18n();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const isClub = workspace === 'club';
  const scope = isClub ? (club ? `club_id=${club.id}` : null) : 'scope=standalone';

  const { data: fin } = useLoad(() => (scope ? api.get(`/api/analytics/finance?${scope}&months=12`) : Promise.resolve(null)), [scope]);
  const { data: pnl } = useLoad(() => (scope ? api.get(`/api/analytics/events-pnl?${scope}&months=12`) : Promise.resolve(null)), [scope]);
  const { data: fund } = useLoad(() => (isClub && club ? api.get(`/api/clubs/${club.id}/fund`) : Promise.resolve(null)), [isClub, club?.id]);

  const month = fin?.months[fin.months.length - 1];

  const income = (fin?.categories || []).filter((c) => c.type === 'income');
  const expense = (fin?.categories || []).filter((c) => c.type === 'expense');
  const bal = Number(fund?.balance || 0);
  const ym = (m) => (m ? `${Number(m.month.slice(5))}/${m.month.slice(0, 4)}` : '');

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr] mb-4">
        {/* Balance / this month */}
        <div className="relative overflow-hidden rounded-2xl border border-navy-700 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-5 sm:p-6">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-lime-400/10 blur-2xl" aria-hidden="true" />
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{isClub ? t('fin.balance') : t('finX.netThisMonth')}</p>
          <div className={`text-3xl sm:text-4xl font-bold tabular-nums mt-1 ${(isClub ? bal : month?.net || 0) < 0 ? 'text-red-400' : 'text-lime-400'}`}>
            {isClub ? (fund ? formatVnd(bal) : '—') : month ? formatVnd(month.net) : '—'}
          </div>
          <div className="mt-5 rounded-xl bg-navy-950/60 border border-navy-700 divide-y divide-navy-700">
            <div className="px-4 py-2 text-gray-400 text-[11px] uppercase tracking-wide">{t('fin.thisMonth')} · {ym(month)}</div>
            {[
              ['💚', t('analytics.income'), month?.income, 'text-lime-300'],
              ['🧾', t('analytics.expense'), month?.expense, 'text-orange-300'],
              ['⚖️', t('analytics.net'), month?.net, (month?.net || 0) < 0 ? 'text-red-300' : 'text-white'],
            ].map(([icon, k, v, tone]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-gray-300"><span aria-hidden="true">{icon}</span> {k}</span>
                <span className={`font-semibold tabular-nums whitespace-nowrap ${tone}`}>{v == null ? '—' : formatVnd(v)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link href="/finance/ledger" className="btn-primary text-sm">+ {t('finX.addEntry')}</Link>
            <Link href="/finance/ledger" className="btn-secondary text-sm">📒 {t('fin.ledger')}</Link>
          </div>
        </div>

        {/* Last 12 months */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 content-start">
          <Tile icon="📈" label={`${t('analytics.income')} · ${t('fin.last12')}`} value={fin ? formatVnd(fin.totals.income) : '—'} tone="text-lime-400" sub={t('finX.avgMonth', { v: fin ? formatVnd(Math.round(fin.totals.income / fin.months.length)) : '—' })} />
          <Tile icon="📉" label={`${t('analytics.expense')} · ${t('fin.last12')}`} value={fin ? formatVnd(fin.totals.expense) : '—'} tone="text-orange-300" sub={t('finX.avgMonth', { v: fin ? formatVnd(Math.round(fin.totals.expense / fin.months.length)) : '—' })} />
          <Tile
            icon="⚖️"
            label={`${t('analytics.net')} · ${t('fin.last12')}`}
            value={fin ? formatVnd(fin.totals.net) : '—'}
            tone={fin && fin.totals.net < 0 ? 'text-red-400' : 'text-white'}
            sub={fin ? t('finX.goodMonths', { n: fin.months.filter((m) => m.net > 0).length, total: fin.months.length }) : null}
          />
          <div className="sm:col-span-3">{fin && <FinanceTrend fin={fin} compact />}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <Breakdown title={`💚 ${t('finX.incomeBy')}`} rows={income} total={fin?.totals.income || 0} color={INCOME_COLOR} t={t} />
        <Breakdown title={`🧾 ${t('finX.expenseBy')}`} rows={expense} total={fin?.totals.expense || 0} color={EXPENSE_COLOR} t={t} />
      </div>

      <EventPaymentsPending />
      {isClub && <PendingPayments club={club} />}

      <section className="card !p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-white font-semibold">🏓 {t('fin.eventPnl')}</h2>
          {pnl?.length > 0 && (
            <span className="text-xs text-gray-400">
              {t('finX.pnlSummary', { win: pnl.filter((e) => e.net >= 0).length, lose: pnl.filter((e) => e.net < 0).length })}
            </span>
          )}
        </div>
        {pnl && pnl.length === 0 && <p className="text-gray-400 text-sm">{t('fin.eventPnlNone')}</p>}
        {pnl?.length > 0 && (
          <div className="table-wrap">
            <table className="w-full text-sm grid-table">
              <thead>
                <tr className="text-gray-300 text-left bg-navy-900">
                  <th>{t('events.title')}</th>
                  <th>{t('events.date')}</th>
                  <th className="text-right">{t('fin.playersCol')}</th>
                  <th className="text-right">{t('analytics.income')}</th>
                  <th className="text-right">{t('analytics.expense')}</th>
                  <th className="text-right">{t('analytics.net')}</th>
                </tr>
              </thead>
              <tbody>
                {pnl.map((e) => (
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
