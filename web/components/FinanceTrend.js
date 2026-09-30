'use client';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '@/context/I18nContext';
import { formatVnd } from '@/lib/format';
import { categoryLabel, EXPENSE_COLOR, INCOME_COLOR } from '@/lib/finance';

const GRID = '#1e2f4d';
const INK_MUTED = '#9ca3af';
const monthLabel = (ym) => `${Number(ym.slice(5))}/${ym.slice(2, 4)}`;
const kVnd = (v) => (Math.abs(v) >= 1e6 ? `${Math.round(v / 1e5) / 10}tr` : `${Math.round(v / 1000)}k`);

// Income vs expenses per month + breakdown by category (from /api/analytics/finance).
export default function FinanceTrend({ fin }) {
  const { t } = useI18n();
  return (
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
                    <div className="text-gray-300"><span style={{ color: INCOME_COLOR }}>■</span> {t('analytics.income')}: {formatVnd(payload[0].payload.income)}</div>
                    <div className="text-gray-300"><span style={{ color: EXPENSE_COLOR }}>■</span> {t('analytics.expense')}: {formatVnd(payload[0].payload.expense)}</div>
                    <div className="text-white mt-1">{t('analytics.net')}: {formatVnd(payload[0].payload.net)}</div>
                  </div>
                ) : null
              }
            />
            <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span className="text-gray-300">{v}</span>} />
            <Bar name={t('analytics.income')} dataKey="income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <Bar name={t('analytics.expense')} dataKey="expense" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
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
                  <span style={{ color: c.type === 'income' ? INCOME_COLOR : EXPENSE_COLOR }}>■</span> {categoryLabel(c.category, t)}
                </span>
                <span className="text-white tabular-nums">{formatVnd(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
