'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import Segmented from '@/components/ui/Segmented';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { monthTitle } from '@/lib/dates';
import { CoachGate } from '@/components/coach/CoachGate';

const dash = <span className="text-gray-500">—</span>;

// Thống kê: per month — sessions taught, attendance rate, students present, money in /
// out / balance — for the last 3, 6 or 12 months, plus the classes taught most.
export default function CoachStatsPage() {
  const { t, lang } = useI18n();
  const [months, setMonths] = useState(6);
  const { data, error, loading, reload } = useLoad(() => api.get(`/api/coach/stats?months=${months}`), [months]);
  const rows = data?.months || [];
  const sum = rows.reduce((a, r) => ({ sessions: a.sessions + r.sessions, present: a.present + r.present, marked: a.marked + r.present + r.absent + r.excused, income: a.income + r.income, expense: a.expense + r.expense }), { sessions: 0, present: 0, marked: 0, income: 0, expense: 0 });
  const maxIncome = Math.max(1, ...rows.map((r) => r.income));
  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader icon="chart" title={t('cstats.title')} subtitle={t('cstats.lead')} hint={<Hint inline text={t('cstats.hint')} />} />
        <div className="card !p-3 mb-4">
          <Segmented items={[3, 6, 12]} value={months} onChange={setMonths} label={(n) => t('cstats.months', { n })} />
        </div>
        {loading && !data && <LoadingBlock rows={4} className="card" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {data && (
          <>
            <KpiRow cols={4}>
              <StatTile label={t('cstats.sessions')} value={String(sum.sessions)} />
              <StatTile label={t('cstats.rate')} value={sum.marked ? `${Math.round((sum.present / sum.marked) * 100)}%` : '—'} />
              <StatTile label={t('coach.ledIncome')} value={formatVnd(sum.income)} tone="text-lime-300" />
              <StatTile label={t('coach.ledNet')} value={formatVnd(sum.income - sum.expense)} tone={sum.income - sum.expense < 0 ? 'text-red-300' : 'text-white'} />
            </KpiRow>
            <section className="card !p-0 overflow-hidden mt-4">
              <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('cstats.byMonth')}</h2>
              <div className="hidden sm:grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_minmax(0,2fr)] gap-3 px-4 py-2 text-xs text-gray-400 border-b border-navy-700">
                <span>{t('cstats.month')}</span>
                <span className="text-right">{t('cstats.sessions')}</span>
                <span className="text-right">{t('cstats.rate')}</span>
                <span className="text-right">{t('cstats.students')}</span>
                <span className="text-right">{t('coach.ledNet')}</span>
                <span>{t('coach.ledIncome')}</span>
              </div>
              {rows.map((r) => (
                <div key={r.month} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_minmax(0,2fr)] gap-x-3 gap-y-1 px-4 py-2.5 border-b border-navy-700 last:border-b-0 text-sm items-center">
                  <span className="text-white capitalize col-span-2 sm:col-span-1">{monthTitle(`${r.month}-01`, lang)}</span>
                  <span className="tabular-nums sm:text-right text-gray-200"><span className="sm:hidden text-gray-500">{t('cstats.sessions')}: </span>{r.sessions || dash}</span>
                  <span className="tabular-nums sm:text-right text-gray-200"><span className="sm:hidden text-gray-500">{t('cstats.rate')}: </span>{r.attendance_rate != null ? `${r.attendance_rate}%` : dash}</span>
                  <span className="tabular-nums sm:text-right text-gray-200"><span className="sm:hidden text-gray-500">{t('cstats.students')}: </span>{r.students || dash}</span>
                  <span className={`tabular-nums sm:text-right ${r.net < 0 ? 'text-red-300' : 'text-white'}`}><span className="sm:hidden text-gray-500">{t('coach.ledNet')}: </span>{r.income || r.expense ? formatVnd(r.net) : dash}</span>
                  <span className="col-span-2 sm:col-span-1 flex items-center gap-2">
                    <span className="flex-1 h-2 rounded-full bg-navy-800 overflow-hidden"><span className="block h-full rounded-full bg-lime-400" style={{ width: `${Math.round((r.income / maxIncome) * 100)}%` }} /></span>
                    <span className="tabular-nums text-xs text-gray-300 w-24 text-right">{r.income ? formatVnd(r.income) : '—'}</span>
                  </span>
                </div>
              ))}
            </section>
            <section className="card mt-4">
              <h2 className="text-white font-semibold mb-2">{t('cstats.topClasses')}</h2>
              {!data.top_classes.length && <p className="text-gray-500 text-sm">{t('cstats.noClasses')}</p>}
              <ol className="grid gap-1.5 text-sm">
                {data.top_classes.map((c, i) => (
                  <li key={c.class_id} className="flex items-center gap-3">
                    <span className="text-gray-500 tabular-nums w-5 text-right">{i + 1}</span>
                    <Link href={`/coach/classes/${c.class_id}`} className="flex-1 min-w-0 text-white hover:text-lime-300 break-words">{c.title}</Link>
                    <span className="text-gray-300 tabular-nums">{t('cstats.nSessions', { n: c.sessions })}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </CoachGate>
    </AppShell>
  );
}
