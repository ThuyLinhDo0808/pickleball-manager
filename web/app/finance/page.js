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

function Tile({ label, value, tone = 'text-white', sub }) {
  return (
    <div className="card !p-3">
      <div className="text-gray-400 text-xs">{label}</div>
      <div className={`text-lg sm:text-xl font-bold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-gray-500 text-xs">{sub}</div>}
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

  return (
    <>
      <div className={`grid gap-3 mb-4 grid-cols-2 ${isClub ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {isClub && (
          <Tile
            label={t('fin.balance')}
            value={fund ? formatVnd(fund.balance) : '—'}
            tone={Number(fund?.balance) >= 0 ? 'text-lime-400' : 'text-red-400'}
          />
        )}
        <Tile label={`${t('analytics.income')} · ${t('fin.last12')}`} value={fin ? formatVnd(fin.totals.income) : '—'} sub={month && `${t('fin.thisMonth')}: ${formatVnd(month.income)}`} />
        <Tile label={`${t('analytics.expense')} · ${t('fin.last12')}`} value={fin ? formatVnd(fin.totals.expense) : '—'} sub={month && `${t('fin.thisMonth')}: ${formatVnd(month.expense)}`} />
        <Tile
          label={`${t('analytics.net')} · ${t('fin.last12')}`}
          value={fin ? formatVnd(fin.totals.net) : '—'}
          tone={fin && fin.totals.net < 0 ? 'text-red-400' : 'text-lime-400'}
          sub={month && `${t('fin.thisMonth')}: ${formatVnd(month.net)}`}
        />
      </div>

      <EventPaymentsPending />
      {isClub && <PendingPayments club={club} />}

      {fin && <FinanceTrend fin={fin} />}

      <section className="card">
        <h2 className="text-white font-semibold mb-2">{t('fin.eventPnl')}</h2>
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
