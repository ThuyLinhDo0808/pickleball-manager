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

// Coach Manager → Tổng quan: the profile's state and what to do next. Classes, students
// and money arrive in the next batches; until then the tiles say so instead of showing 0.
export default function CoachOverviewPage() {
  const { t } = useI18n();
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
              <StatTile label={t('coach.kpiClasses')} value="—" sub={t('coach.comingSoon')} />
              <StatTile label={t('coach.kpiStudents')} value="—" sub={t('coach.comingSoon')} />
              <StatTile label={t('coach.kpiWeek')} value="—" sub={t('coach.comingSoon')} />
              <StatTile label={t('coach.kpiPending')} value="—" sub={t('coach.comingSoon')} />
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

            <section className="card">
              <h2 className="text-white font-semibold mb-2">{t('coach.nextSteps')}</h2>
              <ol className="grid gap-2 text-sm">
                {[
                  ['check', t('coach.step1'), true],
                  ['share', t('coach.step2'), false],
                  ['plans', t('coach.step3'), false],
                  ['users', t('coach.step4'), false],
                ].map(([icon, label, done], i) => (
                  <li key={i} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${done ? 'border-lime-400/40 bg-lime-400/5 text-gray-200' : 'border-navy-700 text-gray-300'}`}>
                    <span className={done ? 'text-lime-400' : 'text-gray-500'}><UiIcon name={icon} className="w-5 h-5" /></span>
                    <span className="flex-1">{label}</span>
                    {!done && i > 1 && <span className="text-[11px] text-gray-500 whitespace-nowrap">{t('coach.comingSoon')}</span>}
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
