'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import ChipRow from '@/components/ui/ChipRow';
import EmptyState from '@/components/ui/EmptyState';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { CoachGate } from '@/components/coach/CoachGate';
import { scheduleText, dmy } from '@/lib/coach';

const KIND_TONE = { group: 'bg-lime-400/15 text-lime-300', private: 'bg-sky-400/15 text-sky-200', single: 'bg-amber-300/15 text-amber-200' };

export default function CoachClassesPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState('open');
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/coach/classes${filter === 'archived' ? '?archived=1' : ''}`), [filter]);
  const list = (data || []).filter((c) => (filter === 'all' ? c.status !== 'archived' : filter === 'archived' ? c.status === 'archived' : c.status === filter));
  const chip = (k) => (
    <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 text-sm ${filter === k ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-800 text-gray-300 hover:text-white'}`}>
      {t(`coach.cf_${k}`)}
    </button>
  );
  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader
          icon="plans"
          title={t('coach.classes')}
          subtitle={t('coach.classesLead')}
          hint={<Hint inline text={t('coach.classesHint')} />}
          actions={<Link href="/coach/classes/new" className="btn-primary">+ {t('coach.classNew')}</Link>}
        />
        <ChipRow className="mb-3" gap="gap-2">{['open', 'closed', 'all', 'archived'].map(chip)}</ChipRow>
        {loading && !data && <LoadingBlock rows={3} className="card" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {data && list.length === 0 && (
          <EmptyState title={t('coach.classEmpty')} action={<Link href="/coach/classes/new" className="btn-primary">+ {t('coach.classNew')}</Link>}>
            {t('coach.classEmptyHint')}
          </EmptyState>
        )}
        {list.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((c) => (
              <Link key={c.id} href={`/coach/classes/${c.id}`} className="card flex flex-col gap-1.5 hover:border-lime-400/60 transition">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-white font-semibold break-words">{c.title}</h2>
                  <span className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${KIND_TONE[c.kind]}`}>{t(`coach.kind_${c.kind}`)}</span>
                </div>
                <p className="text-gray-200 text-sm">{scheduleText(c, t)}</p>
                {c.court_name && <p className="text-gray-400 text-xs break-words">{c.court_name}</p>}
                <p className="text-gray-400 text-xs tabular-nums">
                  {c.kind === 'single' ? dmy(c.date_from) : `${dmy(c.date_from)} → ${dmy(c.date_to)}`} · {t('coach.cSessionsN', { up: c.upcoming, total: c.total })}
                  {c.next && ` · ${t('coach.cNext', { d: dmy(c.next) })}`}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-auto pt-1 text-[11px]">
                  <span className="rounded-full bg-navy-800 text-gray-300 px-2 py-0.5">{t('coach.cCap', { n: c.capacity })}</span>
                  <span className="rounded-full bg-navy-800 text-gray-300 px-2 py-0.5">{c.fee > 0 ? t('coach.cFeeN', { v: formatVnd(c.fee) }) : t('coach.cFeePackage')}</span>
                  {c.status !== 'open' && <span className="rounded-full bg-navy-700 text-gray-300 px-2 py-0.5">{t(`coach.cstatus_${c.status}`)}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CoachGate>
    </AppShell>
  );
}
