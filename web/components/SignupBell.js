'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';
import UiIcon from '@/components/ui/UiIcon';

const SEEN_KEY = 'pb_signups_seen';
const readSeen = () => {
  try {
    return window.localStorage.getItem(SEEN_KEY) || '';
  } catch {
    return '';
  }
};

// The bell for the Host: everything that changed in the last 7 days — new sign-ups (and who waits
// for the info check), transfer screenshots sent, ticket passes, cancellations, people
// asking to join a club / community. The red number is what came in since the bell was
// last opened; checked every minute.
// `side`: where the bell sits. 'sidebar' / 'rail' (desktop sidebar, open or folded): the list
// opens beside the sidebar, at its foot; otherwise it drops down under the bell.
export default function SignupBell({ className = '', side = null }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState([]);
  const [seen, setSeen] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  const load = useCallback(() => api.get('/api/events/recent-signups').then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => {}), []);
  useEffect(() => {
    setSeen(readSeen());
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const fresh = rows.filter((r) => !seen || r.joined_at > seen).length;
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows[0]) {
      try {
        window.localStorage.setItem(SEEN_KEY, rows[0].joined_at);
      } catch {
        /* the badge just comes back next time */
      }
      setTimeout(() => setSeen(rows[0].joined_at), 4000); // keep the "new" dots while the list is read
    }
  }
  const KINDS = ['pass_open', 'pass_proof', 'proof_sent', 'cancelled', 'join'];
  const state = (r) => (KINDS.includes(r.status) ? r.status : r.status === 'requested' ? 'requested' : r.status === 'pending' ? (r.payment_status === 'proof_submitted' ? 'proof' : 'pay') : r.status === 'waitlisted' ? 'waitlisted' : 'registered');
  const ICON = { requested: 'hourglass', pay: 'card', proof: 'list', proof_sent: 'list', waitlisted: 'hourglass', registered: 'checkCircle', pass_open: 'ticket', pass_proof: 'ticket', cancelled: 'x', join: 'userPlus' };

  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" onClick={toggle} aria-label={t('bell.title')} title={t('bell.title')} className="relative w-10 h-10 flex items-center justify-center rounded-lg bg-navy-800 text-gray-200 hover:bg-navy-700 transition-colors">
        <UiIcon name="bell" className="w-5 h-5" />
        {fresh > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{fresh > 9 ? '9+' : fresh}</span>}
      </button>
      {open && (
        <div className={`${side ? `fixed bottom-4 ${side === 'rail' ? 'left-[4.5rem]' : 'left-[16.5rem]'}` : 'absolute right-0 mt-2'} w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-xl border border-navy-600 bg-navy-900 shadow-2xl z-50`}>
          <p className="px-4 pt-3 pb-2 text-white font-semibold">{t('bell.title')}</p>
          {rows.length === 0 && <p className="px-4 pb-4 text-gray-400 text-sm">{t('bell.empty')}</p>}
          <ul className="divide-y divide-navy-700">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={r.href || `/events/${r.event_id}`} onClick={() => setOpen(false)} className="flex gap-2.5 px-4 py-3 hover:bg-navy-800">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${!seen || r.joined_at > seen ? 'bg-red-500' : 'bg-transparent'}`} aria-hidden />
                  <span className="shrink-0 mt-0.5 text-gray-400"><UiIcon className="w-4 h-4" name={ICON[state(r)]} /></span>
                  <span className="min-w-0">
                    <span className="block text-white text-sm">
                      <b>{r.full_name}</b> · {t(`bell.st_${state(r)}`)}
                      {r.guest_booking_id ? <UiIcon name="bolt" className="inline w-3.5 h-3.5 ml-1 -mt-0.5 text-gray-400" /> : null}
                    </span>
                    <span className="block text-gray-400 text-xs break-words">{r.event?.title}{r.event?.event_date ? ` · ${localDate(`${r.event.event_date}T00:00:00`, lang === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit' })}` : ''}</span>
                    <span className="block text-gray-400 text-xs tabular-nums">{localDate(r.joined_at, lang === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
