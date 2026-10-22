'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';
import UiIcon from '@/components/ui/UiIcon';

const SEEN_KEY = 'pb_player_updates_seen';
const readSeen = () => {
  try {
    return window.localStorage.getItem(SEEN_KEY) || '';
  } catch {
    return '';
  }
};
const ICON = { wait_check: 'hourglass', pay_now: 'card', proof_wait: 'list', pay_rejected: 'alert', confirmed: 'checkCircle', waitlisted: 'hourglass', cancelled: 'x', cancelled_host: 'x', notice_warning: 'alert', notice_restored: 'checkCircle', notice_removed: 'x', link_request: 'link', court_moved: 'court' };

// for players, like the Host's: where each sign-up stands, messages from clubs, link
// requests (last 14 days). Red number = new since the bell was last opened; checked every minute.
export default function PlayerBell({ className = '' }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState([]);
  const [seen, setSeen] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const load = useCallback(() => api.get('/api/player/updates').then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => {}), []);
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

  const isNew = (r) => !seen || r.at > seen;
  const fresh = rows.filter(isNew).length;
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows[0]) {
      try {
        window.localStorage.setItem(SEEN_KEY, rows[0].at);
      } catch {
        /* the badge just comes back next time */
      }
      setTimeout(() => setSeen(rows[0].at), 4000);
    }
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" onClick={toggle} aria-label={t('bell.title')} title={t('bell.title')} className="relative w-10 h-10 flex items-center justify-center rounded-lg bg-navy-800 text-gray-200 hover:bg-navy-700 transition-colors">
        <UiIcon name="bell" className="w-5 h-5" />
        {fresh > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{fresh > 9 ? '9+' : fresh}</span>}
      </button>
      {open && (
        <div className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+3.75rem)] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem] max-h-[70vh] overflow-y-auto rounded-xl border border-navy-600 bg-navy-900 shadow-2xl z-50">
          <p className="px-4 pt-3 pb-2 text-white font-semibold">{t('bell.title')}</p>
          {rows.length === 0 && <p className="px-4 pb-4 text-gray-400 text-sm">{t('pbell.empty')}</p>}
          <ul className="divide-y divide-navy-700">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={r.href} onClick={() => setOpen(false)} className="flex gap-2.5 px-4 py-3 hover:bg-navy-800">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isNew(r) ? 'bg-red-500' : 'bg-transparent'}`} aria-hidden />
                  <span className="shrink-0 mt-0.5 text-gray-400"><UiIcon className="w-4 h-4" name={ICON[r.kind] || 'bell'} /></span>
                  <span className="min-w-0">
                    <span className="block text-white text-sm">{t(`pbell.k_${r.kind}`, { court: r.court || '?' })}</span>
                    <span className="block text-gray-400 text-xs break-words">
                      {r.title}
                      {r.event_date ? ` · ${localDate(`${r.event_date}T00:00:00`, lang === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit' })}` : ''}
                    </span>
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
