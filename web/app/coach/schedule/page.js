'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import EmptyState from '@/components/ui/EmptyState';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { addDays, formatDay, todayYmd } from '@/lib/dates';
import { CoachGate } from '@/components/coach/CoachGate';
import { weekStart, dmy } from '@/lib/coach';
import { SessionRow } from '@/components/coach/SessionRow';

// Lịch dạy: one week at a time, every session of every class, grouped by day.
export default function CoachSchedulePage() {
  const { t, lang } = useI18n();
  const today = todayYmd();
  const [start, setStart] = useState(() => weekStart(today));
  const end = addDays(start, 6);
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/coach/sessions?from=${start}&to=${end}`), [start]);
  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(start, i);
      out.push({ date: d, items: (data || []).filter((s) => s.session_date === d) });
    }
    return out;
  }, [data, start]);
  const total = (data || []).filter((s) => s.status !== 'cancelled').length;
  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader
          icon="schedule"
          title={t('coach.schedule')}
          subtitle={t('coach.scheduleLead')}
          hint={<Hint inline text={t('coach.scheduleHint')} />}
          actions={<Link href="/coach/classes/new" className="btn-primary">+ {t('coach.classNew')}</Link>}
        />
        <div className="card !p-2 mb-3 flex items-center justify-between gap-2">
          <button type="button" className="btn-secondary !px-3" aria-label={t('rankings.prev')} onClick={() => setStart(addDays(start, -7))}>‹</button>
          <div className="text-center min-w-0">
            <span className="text-white font-semibold tabular-nums">{dmy(start)} – {dmy(end)}</span>
            <span className="block text-gray-400 text-xs">{t('coach.weekN', { n: total })}</span>
          </div>
          <div className="flex gap-1">
            {start !== weekStart(today) && <button type="button" className="btn-secondary !px-3 text-sm" onClick={() => setStart(weekStart(today))}>{t('hub.today')}</button>}
            <button type="button" className="btn-secondary !px-3" aria-label={t('rankings.next')} onClick={() => setStart(addDays(start, 7))}>›</button>
          </div>
        </div>
        {loading && !data && <LoadingBlock rows={4} className="card" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {data && total === 0 && (
          <EmptyState title={t('coach.weekEmpty')} action={<Link href="/coach/classes/new" className="btn-primary">+ {t('coach.classNew')}</Link>}>
            {t('coach.weekEmptyHint')}
          </EmptyState>
        )}
        {data && total > 0 && (
          <div className="grid gap-3">
            {days.map((d) => (
              <section key={d.date} className={`card !p-0 overflow-hidden ${d.date === today ? 'border-lime-400/50' : ''} ${d.items.length === 0 ? 'opacity-60' : ''}`}>
                <h2 className={`px-4 py-2 border-b border-navy-700 text-sm font-semibold capitalize ${d.date === today ? 'text-lime-300' : 'text-white'}`}>
                  {formatDay(d.date, lang, { weekday: 'long', day: '2-digit', month: '2-digit' })}
                  {d.date === today && <span className="ml-2 text-[11px] rounded-full bg-lime-400/15 px-2 py-0.5">{t('hub.today')}</span>}
                </h2>
                {d.items.length === 0 ? <p className="text-gray-500 text-xs px-4 py-2">—</p> : d.items.map((s) => <SessionRow key={s.id} s={s} lang={lang} onChanged={reload} withClass past={d.date < today} />)}
              </section>
            ))}
          </div>
        )}
      </CoachGate>
    </AppShell>
  );
}
