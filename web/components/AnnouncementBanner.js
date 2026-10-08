'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const KEY = 'pb_dismissed_announcements';
const readDismissed = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};

// The owner's notice to everyone (set in /owner/announcements): shown at the top until
// it ends or the viewer closes it. `publicOnly` = only notices meant for public pages.
export default function AnnouncementBanner({ publicOnly = false, className = '' }) {
  const [rows, setRows] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  useEffect(() => {
    setDismissed(readDismissed());
    api.publicGet(`/api/public/announcements${publicOnly ? '?public=1' : ''}`).then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => {});
  }, [publicOnly]);
  const shown = rows.filter((a) => !dismissed.includes(a.id));
  if (!shown.length) return null;
  const close = (id) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {shown.map((a) => (
        <div
          key={a.id}
          role={a.level === 'warning' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${a.level === 'warning' ? 'border-amber-300/60 bg-amber-300/10 text-amber-100' : 'border-sky-400/50 bg-sky-400/10 text-sky-100'}`}
        >
          <span aria-hidden="true">{a.level === 'warning' ? '⚠️' : '📣'}</span>
          <p className="flex-1 whitespace-pre-line">{a.message}</p>
          <button type="button" onClick={() => close(a.id)} className="shrink-0 px-1 opacity-70 hover:opacity-100" aria-label="✕">✕</button>
        </div>
      ))}
    </div>
  );
}
