'use client';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import UiIcon from '@/components/ui/UiIcon';
import ErrorBlock from '@/components/ui/ErrorBlock';
import LoadingBlock from '@/components/ui/LoadingBlock';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { CoachGate, publicCoachUrl } from '@/components/coach/CoachGate';
import { SessionRow } from '@/components/coach/SessionRow';

// Coach Manager → Tổng quan: the profile's state and what to do next. Classes, students
// and money arrive in the next batches; until then the tiles say so instead of showing 0.
export default function CoachOverviewPage() {
  const { t, lang } = useI18n();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/coach/overview'), []);
  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader icon="dashboard" title={t('coach.overview')} subtitle={t('coach.overviewLead')} />
        {loading && !data && <LoadingBlock rows={3} className="card" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {data && (
          <>
            <KpiRow cols={4}>
              <StatTile label={t('coach.kpiClasses')} value={String(data.classes)} onClick={() => (window.location.href = '/coach/classes')} />
              <StatTile label={t('coach.kpiStudents')} value={String(data.students)} onClick={() => (window.location.href = '/coach/students')} />
              <StatTile label={t('coach.kpiWeek')} value={String(data.sessions_week)} onClick={() => (window.location.href = '/coach/schedule')} />
              <StatTile label={t('coach.kpiPending')} value={String(data.pending)} tone={data.pending ? 'text-amber-300' : 'text-white'} onClick={() => (window.location.href = '/coach/students?tab=pending')} />
            </KpiRow>

            <section className="card mb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-white font-semibold text-lg break-words">{data.profile.display_name}</h2>
                  <p className="text-gray-400 text-sm mt-0.5">
                    {t(`clubs.sport_${data.profile.sport}`)}
                    {data.profile.level_text ? ` · ${data.profile.level_text}` : ''}
                    {data.profile.area ? ` · ${data.profile.area}` : ''}
                  </p>
                  <p className="text-gray-400 text-xs mt-1 break-all">{publicCoachUrl(data.profile.slug)}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className={`text-[11px] rounded-full px-2 py-0.5 ${data.profile.status === 'active' ? 'bg-lime-400/15 text-lime-300' : 'bg-navy-700 text-gray-300'}`}>
                      {t(`coach.status_${data.profile.status}`)}
                    </span>
                    <span className={`text-[11px] rounded-full px-2 py-0.5 ${data.profile.public ? 'bg-sky-400/15 text-sky-200' : 'bg-navy-700 text-gray-300'}`}>
                      {t(data.profile.public ? 'coach.publicOn' : 'coach.publicOff')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 sm:justify-end">
                  <Link href={`/coach/${data.profile.slug}`} className="btn-secondary text-sm">{t('coach.viewPublic')}</Link>
                  <Link href="/coach/profile" className="btn-primary text-sm">{t('coach.editProfile')}</Link>
                </div>
              </div>
            </section>

            <section className="card !p-0 overflow-hidden mb-4">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-navy-700">
                <h2 className="text-white font-semibold">{t('coach.nextSessions')}</h2>
                <Link href="/coach/schedule" className="text-lime-400 text-sm hover:underline">{t('coach.schedule')} →</Link>
              </div>
              {data.next?.length ? data.next.map((s) => <SessionRow key={s.id} s={s} lang={lang} onChanged={reload} withClass />) : (
                <p className="text-gray-400 text-sm px-4 py-3">{t('coach.noNextSessions')} <Link href="/coach/classes/new" className="text-lime-300 underline">{t('coach.classNew')}</Link></p>
              )}
            </section>

            {(data.to_mark > 0 || data.unpaid_fees > 0) && (
              <section className="card mb-4 border border-amber-300/30">
                <h2 className="text-white font-semibold mb-2">{t('coach.todo')}</h2>
                <ul className="grid gap-1.5 text-sm">
                  {data.to_mark > 0 && <li className="flex items-center justify-between gap-2"><span className="text-gray-200">{t('coach.todoMark', { n: data.to_mark })}</span><Link href="/coach/schedule" className="text-lime-300 text-xs hover:underline whitespace-nowrap">{t('coach.schedule')} →</Link></li>}
                  {data.unpaid_fees > 0 && <li className="flex items-center justify-between gap-2"><span className="text-gray-200">{t('coach.todoFees', { n: data.unpaid_fees })}</span><span className="text-[11px] text-gray-500">{t('coach.comingSoonC5')}</span></li>}
                </ul>
              </section>
            )}
            <section className="card">
              <h2 className="text-white font-semibold mb-2">{t('coach.nextSteps')}</h2>
              <ol className="grid gap-2 text-sm">
                {[
                  ['check', t('coach.step1'), true],
                  ['share', t('coach.step2'), false],
                  ['plans', t('coach.step3'), data.classes > 0],
                  ['users', t('coach.step4'), data.students > 0],
                ].map(([icon, label, done], i) => (
                  <li key={i} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${done ? 'border-lime-400/40 bg-lime-400/5 text-gray-200' : 'border-navy-700 text-gray-300'}`}>
                    <span className={done ? 'text-lime-400' : 'text-gray-500'}><UiIcon name={icon} className="w-5 h-5" /></span>
                    <span className="flex-1">{label}</span>
                    {!done && i === 2 && <Link href="/coach/classes/new" className="text-lime-300 text-xs whitespace-nowrap hover:underline">{t('coach.classNew')} →</Link>}
                    {!done && i === 3 && <span className="text-[11px] text-gray-500 whitespace-nowrap">{t('coach.comingSoon')}</span>}
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
