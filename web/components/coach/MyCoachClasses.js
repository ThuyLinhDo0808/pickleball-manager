'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { scheduleText } from '@/lib/coach';
import { ENROLL_TONE } from '@/components/coach/StudentRow';
import { MySessions } from '@/components/coach/Balance';
import CoachBuy from '@/components/coach/CoachBuy';
import { MyCoachNotes } from '@/components/coach/Notes';

// "Lớp học của tôi" on the player's activity page: every class signed up for, its status,
// the next sessions, and the way out.
export default function MyCoachClasses() {
  const { t, lang } = useI18n();
  const { data, reload } = useLoad(() => api.get('/api/player/coach').catch(() => []), []);
  const { data: money, reload: reloadMoney } = useLoad(() => api.get('/api/player/coach/purchases').catch(() => []), []);
  const [busy, setBusy] = useState(false);
  const list = (data || []).filter((e) => e.class);
  const shops = (money || []).filter((m) => m.mine.length || m.for_sale.length);
  if (!list.length && !shops.length) return null;
  async function cancel(e) {
    if (!window.confirm(t('coach.myCancelAsk'))) return;
    setBusy(true);
    try {
      await api.post(`/api/player/coach/enrollments/${e.id}/cancel`, {});
      reload();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="my-coach" className="card mb-4 scroll-mt-20">
      <h2 className="text-white font-semibold mb-2">{t('coach.myClasses')}</h2>
      <div className="grid gap-2">
        {list.map((e) => {
          const live = ['requested', 'confirmed', 'waitlist'].includes(e.status);
          return (
            <div key={e.id} className={`rounded-lg border border-navy-700 px-3 py-2 ${live ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white font-medium break-words">{e.class.title}</p>
                  <p className="text-gray-400 text-xs">{scheduleText(e.class, t)}{e.class.court_name ? ` · ${e.class.court_name}` : ''} · <Link href={`/coach/${e.coach?.slug}`} className="text-sky-300 hover:underline">{e.coach?.display_name}</Link></p>
                </div>
                <span className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${ENROLL_TONE[e.status]}`}>{t(`coach.en_${e.status}`)}</span>
              </div>
              {live && e.status !== 'confirmed' && e.next_sessions?.length > 0 && (
                <p className="text-gray-300 text-xs mt-1 tabular-nums">{t('coach.nextSessionsShort')}: {e.next_sessions.slice(0, 3).map((s) => `${formatDay(s.session_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })} ${hhmm(s.start_time)}`).join(' · ')}</p>
              )}
              {e.status === 'confirmed' && <MySessions e={e} excuse={(sid, undo) => api.post(`/api/player/coach/enrollments/${e.id}/sessions/${sid}/excuse`, { undo: !!undo }).then(reload)} />}
              {live && (
                <div className="flex justify-end mt-1">
                  <button type="button" className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" disabled={busy} onClick={() => cancel(e)}>{t('coach.myCancel')}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <MyCoachNotes />
      {shops.map((m) => (
        <div key={m.coach.slug} className="mt-4">
          <CoachBuy
            title={t('coach.myPackages', { coach: m.coach.display_name })}
            forSale={m.for_sale}
            mine={m.mine}
            buy={(pid) => api.post(`/api/player/coach/coaches/${m.coach.slug}/packages/${pid}/buy`, {}).then(() => { reloadMoney(); reload(); })}
            proof={(id, image) => api.post(`/api/player/coach/purchases/${id}/proof`, { image }).then(reloadMoney)}
          />
        </div>
      ))}
    </section>
  );
}

// "Bạn là trợ giảng của …" on the activity page: a link to take attendance.
export function AssistEntry() {
  const { t } = useI18n();
  const { data } = useLoad(() => api.get('/api/coach-assist').catch(() => []), []);
  if (!data?.length) return null;
  return (
    <Link href="/assist" className="card mb-4 flex items-center gap-3 hover:border-lime-400/40">
      <span className="flex-1 min-w-0">
        <span className="block text-white font-semibold">{t('cassist.entryTitle')}</span>
        <span className="block text-gray-400 text-sm break-words">{data.map((c) => c.display_name).join(', ')}</span>
      </span>
      <span className="text-lime-300 text-sm whitespace-nowrap">{t('cassist.entryGo')} →</span>
    </Link>
  );
}
