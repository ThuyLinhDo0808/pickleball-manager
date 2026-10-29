'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import MapLink from '@/components/MapLink';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import EmptyState from '@/components/ui/EmptyState';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { CoachGate } from '@/components/coach/CoachGate';
import { endTime } from '@/lib/coach';
import { SessionRow } from '@/components/coach/SessionRow';

// One session: when and where, with move / cancel. Attendance and fees come in C4 / C5.
export default function CoachSessionPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { data: s, loading, error, reload } = useLoad(() => api.get(`/api/coach/sessions/${id}`), [id]);
  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        {loading && !s && <LoadingBlock rows={3} className="card mt-3" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {s && (
          <>
            <PageHeader
              icon="schedule"
              title={<span className="capitalize">{formatDay(s.session_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit' })}</span>}
              subtitle={`${hhmm(s.start_time)}–${endTime(s.start_time, s.duration_min)} · ${s.class?.title || ''}${s.status === 'cancelled' ? ` · ${t('coach.sstatus_cancelled')}` : ''}`}
            />
            <section className="card !p-0 overflow-hidden mb-4">
              <SessionRow s={{ ...s, class_title: s.class?.title }} lang={lang} onChanged={reload} />
              {(s.court_name || s.class?.map_url) && (
                <p className="px-4 py-2 text-sm text-gray-300 border-t border-navy-700">
                  {s.court_name || '—'}
                  {s.class?.map_url && <span className="ml-2"><MapLink location={s.court_name} mapUrl={s.class.map_url} showHint={false} /></span>}
                </p>
              )}
              {s.note && <p className="px-4 py-2 text-sm text-gray-400 border-t border-navy-700 whitespace-pre-line">{s.note}</p>}
            </section>
            <section className="card">
              <h2 className="text-white font-semibold mb-2">{t('coach.sPeople')}</h2>
              <EmptyState title={t('coach.attendanceSoon')}>{t('coach.attendanceSoonHint')}</EmptyState>
            </section>
          </>
        )}
      </CoachGate>
    </AppShell>
  );
}
