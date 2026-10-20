'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { localDate } from '@/lib/dates';

const KEY = 'pb_dismissed_announcements';
const readDismissed = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};
const fmt = (iso, lang) => (iso ? localDate(new Date(iso), lang === 'en' ? 'en-GB' : 'vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }, true) : '');

// The owner's notices (set in /owner/announcements): shown at the top until they end or the
// viewer closes them. Signed in: also the ones for my audience (Host / players) or my clubs.
// `publicOnly` = only notices meant for public pages. Maintenance announced ahead shows as a
// warning that cannot be closed (from / to times added).
export default function AnnouncementBanner({ publicOnly = false, className = '' }) {
  const { user, loading } = useAuth();
  const { t, lang } = useI18n();
  const [rows, setRows] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  useEffect(() => {
    if (loading) return;
    setDismissed(readDismissed());
    const load = user && !publicOnly ? api.get('/api/announcements/mine') : api.publicGet(`/api/public/announcements${publicOnly ? '?public=1' : ''}`);
    load.then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => {});
  }, [publicOnly, user, loading]);
  const shown = rows.filter((a) => a.kind === 'maintenance' || !dismissed.includes(a.id));
  if (!shown.length) return null;
  const close = (id) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {shown.map((a) => {
        const maint = a.kind === 'maintenance';
        const warn = maint || a.level === 'warning';
        return (
          <div
            key={a.id}
            role={warn ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${maint ? 'border-red-400/60 bg-red-500/10 text-red-100' : warn ? 'border-amber-300/60 bg-amber-300/10 text-amber-100' : 'border-sky-400/50 bg-sky-400/10 text-sky-100'}`}
          >
            <span aria-hidden="true">{maint ? '🛠' : warn ? '⚠️' : '📣'}</span>
            <div className="flex-1 min-w-0">
              {maint && <p className="font-semibold">{t('maint.upcoming', { from: fmt(a.starts_at, lang), to: fmt(a.ends_at, lang) || '—' })}</p>}
              {a.title && <p className="font-semibold">{a.title}</p>}
              <p className="whitespace-pre-line">{a.message}</p>
            </div>
            {!maint && <button type="button" onClick={() => close(a.id)} className="shrink-0 px-1 opacity-70 hover:opacity-100" aria-label={t('common.close')}>✕</button>}
          </div>
        );
      })}
    </div>
  );
}
