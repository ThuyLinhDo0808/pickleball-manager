'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import MapLink from '@/components/MapLink';
import LoadingBlock from '@/components/ui/LoadingBlock';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { scheduleText } from '@/lib/coach';
import { ENROLL_TONE } from '@/components/coach/StudentRow';
import { MySessions } from '@/components/coach/Balance';

// A quick sign-up's own page (secret link): the class, the status, cancel. The link is
// the only way back to it, so the page says to keep it.
export default function CoachEnrollmentPage() {
  const { token } = useParams();
  const { t, lang } = useI18n();
  const { data, error, loading, setData } = useLoad(() => api.publicGet(`/api/public/coach/r/${token}`), [token]);
  const [busy, setBusy] = useState(false);
  async function cancel() {
    if (!window.confirm(t('coach.myCancelAsk'))) return;
    setBusy(true);
    try {
      setData(await api.publicPost(`/api/public/coach/r/${token}/cancel`, {}));
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading && !data) return <PlayerShell requireAuth={false}><LoadingBlock rows={3} className="card" /></PlayerShell>;
  if (error || !data) return <PlayerShell requireAuth={false}><p className="card text-gray-300">{error?.status === 404 ? t('coach.rNotFound') : error?.message}</p></PlayerShell>;
  const e = data;
  const live = ['requested', 'confirmed', 'waitlist'].includes(e.status);
  return (
    <PlayerShell requireAuth={false} sport={e.coach?.sport}>
      <section className="card mb-4">
        <p className="text-gray-400 text-xs">{t('coach.rKicker')}</p>
        <h1 className="text-white text-xl font-bold break-words">{e.class?.title}</h1>
        <p className="text-gray-300 text-sm mt-1">{e.class ? scheduleText(e.class, t) : ''}{e.class?.court_name ? ` · ${e.class.court_name}` : ''}</p>
        {e.class?.map_url && <p className="text-sm mt-1"><MapLink location={e.class.court_name} mapUrl={e.class.map_url} showHint={false} /></p>}
        <p className="text-gray-300 text-sm mt-1">{t('coach.rCoach')}: <Link href={`/coach/${e.coach?.slug}`} className="text-lime-300 hover:underline">{e.coach?.display_name}</Link></p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`text-sm rounded-full px-3 py-1 ${ENROLL_TONE[e.status]}`}>{t(`coach.en_${e.status}`)}</span>
          <span className="text-gray-400 text-xs">{t(`coach.enHint_${e.status}`)}</span>
        </div>
        <p className="text-gray-300 text-sm mt-3">{t('coach.rName', { name: e.student?.full_name })}{e.student?.linked_account ? ` · ${t('coach.rLinked')}` : ''}</p>
      </section>
      {e.next_sessions?.length > 0 && (
        <section className="card mb-4">
          <h2 className="text-white font-semibold">{t('coach.nextSessionsShort')}</h2>
          {e.status === 'confirmed' ? (
            <MySessions e={e} excuse={(sid, undo) => api.publicPost(`/api/public/coach/r/${token}/sessions/${sid}/excuse`, { undo: !!undo }).then(setData)} />
          ) : (
            <ul className="text-sm text-gray-200 grid gap-1 tabular-nums mt-2">
              {e.next_sessions.map((s) => (
                <li key={s.id} className="capitalize">{formatDay(s.session_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })} · {hhmm(s.start_time)}{s.court_name ? ` · ${s.court_name}` : ''}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="card">
        <p className="text-gray-400 text-xs mb-3">{t('coach.rKeepLink')}</p>
        <div className="flex flex-wrap gap-2 justify-between">
          {!e.student?.linked_account && <Link href={`/sign-in?next=${encodeURIComponent('/p')}`} className="btn-secondary text-sm">{t('coach.rMakeAccount')}</Link>}
          {live && <button type="button" className="text-red-300 hover:text-red-200 text-sm px-2 min-h-[44px] ml-auto" disabled={busy} onClick={cancel}>{t('coach.myCancel')}</button>}
        </div>
      </section>
    </PlayerShell>
  );
}
