'use client';
import Link from 'next/link';
import PlayerShell from '@/components/PlayerShell';
import LoadingBlock from '@/components/ui/LoadingBlock';
import EmptyState from '@/components/ui/EmptyState';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm, todayYmd } from '@/lib/dates';
import { endTime } from '@/lib/coach';

// Trợ giảng: the coaches I assist and their sessions (last week → next two weeks). Tap a
// session to take attendance. No money, no phone numbers here.
export default function AssistPage() {
  const { t, lang } = useI18n();
  const { data: coaches, loading } = useLoad(() => api.get('/api/coach-assist').catch(() => []), []);
  return (
    <PlayerShell>
      <h1 className="text-white text-2xl font-bold">{t('cassist.pageTitle')}</h1>
      <p className="text-gray-400 text-sm mb-4">{t('cassist.pageLead')}</p>
      {loading && !coaches && <LoadingBlock rows={3} className="card" />}
      {coaches && !coaches.length && <EmptyState title={t('cassist.pageNone')}>{t('cassist.pageNoneHint')}</EmptyState>}
      {(coaches || []).map((c) => <CoachSessions key={c.id} coach={c} lang={lang} t={t} />)}
    </PlayerShell>
  );
}

function CoachSessions({ coach, lang, t }) {
  const { data } = useLoad(() => api.get(`/api/coach-assist/${coach.id}/sessions`), [coach.id]);
  const today = todayYmd();
  const rows = (data || []).filter((s) => s.status !== 'cancelled');
  return (
    <section className="card !p-0 overflow-hidden mb-4">
      <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{coach.display_name}</h2>
      {data && !rows.length && <p className="text-gray-500 text-sm px-4 py-3">{t('cassist.noSessions')}</p>}
      {rows.map((s) => (
        <Link key={s.id} href={`/assist/${coach.id}/${s.id}`} className={`flex items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0 text-sm hover:bg-navy-800/60 ${s.session_date < today ? 'opacity-70' : ''}`}>
          <span className="capitalize tabular-nums text-white whitespace-nowrap">{formatDay(s.session_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
          <span className="tabular-nums text-gray-300 whitespace-nowrap">{hhmm(s.start_time)}–{endTime(hhmm(s.start_time), s.duration_min)}</span>
          <span className="flex-1 min-w-0 text-gray-200 break-words">{s.class_title}</span>
          <span className={`text-xs ${s.status === 'done' ? 'text-lime-300' : 'text-gray-400'}`}>{t(`coach.sstatus_${s.status}`)}</span>
        </Link>
      ))}
    </section>
  );
}
