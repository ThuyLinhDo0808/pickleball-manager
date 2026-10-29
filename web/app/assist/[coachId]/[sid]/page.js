'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import EmptyState from '@/components/ui/EmptyState';
import { Avatar } from '@/components/PlayerChip';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { endTime } from '@/lib/coach';

const MARKS = ['present', 'absent', 'excused'];
const MARK_TONE = { present: 'bg-lime-400 text-navy-950', absent: 'bg-red-400/80 text-navy-950', excused: 'bg-sky-400/80 text-navy-950' };

// Trợ giảng → one session: Có mặt / Vắng / Báo nghỉ for each student, as the coach does
// (packages are charged by the coach's rule). No phone numbers, no fees.
export default function AssistSessionPage() {
  const { coachId, sid } = useParams();
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useLoad(() => api.get(`/api/coach-assist/${coachId}/sessions/${sid}`), [coachId, sid]);
  const [busy, setBusy] = useState(false);
  async function mark(r, status) {
    setBusy(true);
    try {
      await api.post(`/api/coach-assist/${coachId}/sessions/${sid}/attendance`, { student_id: r.student.id, status: r.attendance?.status === status ? null : status });
      reload();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  const s = data?.session;
  return (
    <PlayerShell>
      {loading && !data && <LoadingBlock rows={3} className="card" />}
      {error && <ErrorBlock message={error.message} onRetry={reload} />}
      {s && (
        <>
          <p className="text-gray-400 text-xs">{t('cassist.kicker', { coach: data.coach.display_name })}</p>
          <h1 className="text-white text-2xl font-bold capitalize">{formatDay(s.session_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit' })}</h1>
          <p className="text-gray-300 text-sm mb-4 tabular-nums">{hhmm(s.start_time)}–{endTime(hhmm(s.start_time), s.duration_min)} · {s.class?.title}{s.court_name ? ` · ${s.court_name}` : ''}</p>
          <section className="card !p-0 overflow-hidden">
            <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('coach.sPeople')} <span className="text-gray-500 font-normal text-sm">({data.rows.length})</span></h2>
            {!data.rows.length && <div className="p-4"><EmptyState title={t('coach.attEmpty')}>{t('cassist.emptyHint')}</EmptyState></div>}
            {data.rows.map((r) => (
              <div key={r.student.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
                <span className="flex items-center gap-3 flex-1 min-w-[10rem]">
                  <Avatar uid={r.student.avatar_uid} v={r.student.avatar_v} name={r.student.full_name} size={36} />
                  <span className="min-w-0">
                    <span className="block text-white font-medium break-words">{r.student.full_name}</span>
                    {r.balance?.has_package && <span className="block text-xs text-lime-300 tabular-nums">{t('coach.balLeft', { n: r.balance.remaining })}</span>}
                  </span>
                </span>
                {s.status !== 'cancelled' && (
                  <span className="inline-flex rounded-lg overflow-hidden border border-navy-600">
                    {MARKS.map((m) => (
                      <button key={m} type="button" disabled={busy} aria-pressed={r.attendance?.status === m} onClick={() => mark(r, m)} className={`px-3 min-h-[44px] text-xs font-semibold ${r.attendance?.status === m ? MARK_TONE[m] : 'bg-navy-800 text-gray-300 hover:text-white'}`}>{t(`coach.att_${m}`)}</button>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </PlayerShell>
  );
}
