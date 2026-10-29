'use client';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';

// The public address of a coach's page (shown to copy / share).
export function publicCoachUrl(slug) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/coach/${slug}`;
}

// Wraps every Coach Manager page: the product must be on for this account and (for the
// pages after the profile form) a profile must exist. Anything else explains what to do.
export function CoachGate({ error, reload, needProfile = true, children }) {
  const { t } = useI18n();
  const { coachInfo } = useWorkspace();
  const code = error?.payload?.code;
  if (coachInfo && !coachInfo.enabled) {
    return <p className="card text-gray-300 text-sm">{t('coach.offHint')}</p>;
  }
  if (code === 'coach_off') return <p className="card text-gray-300 text-sm">{t('coach.offHint')}</p>;
  if (code === 'migration_missing') return <p className="card text-amber-200 text-sm">{t('coach.migrationHint', { file: error.payload?.migration || '' })}</p>;
  if (code === 'coach_blocked') return <p className="card text-red-200 text-sm">{t('coach.blockedHint')}</p>;
  if (needProfile && (code === 'no_profile' || (coachInfo && coachInfo.enabled && !coachInfo.has_profile))) {
    return (
      <div className="card text-sm">
        <p className="text-white font-semibold">{t('coach.noProfileTitle')}</p>
        <p className="text-gray-300 mt-1">{t('coach.noProfileHint')}</p>
        <div className="flex justify-end mt-3">
          <Link href="/coach/profile?new=1" className="btn-primary">{t('coach.openProfile')} →</Link>
        </div>
      </div>
    );
  }
  return children;
}
