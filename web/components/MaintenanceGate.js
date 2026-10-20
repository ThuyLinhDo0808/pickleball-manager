'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';

const fmt = (iso, lang) => (iso ? localDate(new Date(iso), lang === 'en' ? 'en-GB' : 'vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }, true) : '');
function left(iso, now) {
  const ms = Math.max(0, Date.parse(iso) - now);
  const h = Math.floor(ms / 3600e3);
  const m = Math.floor((ms % 3600e3) / 60e3);
  const s = Math.floor((ms % 60e3) / 1000);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// Maintenance (Owner Console → Thông báo → 🛠 Bảo trì): while it runs, the whole app is covered
// by this page — what is happening, when it is back (with a countdown) — and the API refuses
// everyone but the Owner. The Owner keeps working, under a red bar. The sign-in page stays
// reachable so the Owner can sign in (it says only the Ban quản trị can).
export default function MaintenanceGate() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const pathname = usePathname() || '';
  const [m, setM] = useState(null);
  const [owner, setOwner] = useState(false);
  const [now, setNow] = useState(Date.now());

  const check = useCallback(async () => {
    try {
      const r = await api.publicGet('/api/public/maintenance');
      setM(r?.active ? r.maintenance : null);
      return r?.active ? r.maintenance : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    check();
    const onEvent = (e) => setM(e.detail || { message: '' });
    window.addEventListener('pb:maintenance', onEvent);
    return () => window.removeEventListener('pb:maintenance', onEvent);
  }, [check]);

  // Is the signed-in person the Owner (the console answers them during maintenance)?
  useEffect(() => {
    if (!m || !user) return setOwner(false);
    let live = true;
    api.get('/api/owner/me').then((r) => live && setOwner(!!r?.owner)).catch(() => live && setOwner(false));
    return () => { live = false; };
  }, [m, user]);

  // Tick the countdown; look again every 30 s and when the end time passes.
  useEffect(() => {
    if (!m) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const still = await check();
      if (!still) window.location.reload();
    }, 30000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [m, check]);

  if (!m) return null;
  if (owner) {
    return (
      <div role="status" className="sticky top-0 z-[60] bg-red-600 text-white text-xs sm:text-sm px-4 py-1.5 text-center">
        🛠 {t('maint.ownerBar', { time: fmt(m.ends_at, lang) || '—' })}{' '}
        <Link href="/owner/announcements" className="underline font-semibold">{t('maint.manage')}</Link>
      </div>
    );
  }
  if (pathname.startsWith('/sign-in')) {
    return (
      <div role="alert" className="sticky top-0 z-[60] bg-amber-400 text-navy-950 text-sm px-4 py-2 text-center font-medium">
        🛠 {t('maint.signInNote', { time: fmt(m.ends_at, lang) || '—' })}
      </div>
    );
  }
  const over = m.ends_at && Date.parse(m.ends_at) <= now;
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="maint-title" className="fixed inset-0 z-[70] bg-navy-950 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg text-center">
        <div className="text-6xl mb-4" aria-hidden="true">🛠</div>
        <h1 id="maint-title" className="text-2xl sm:text-3xl font-bold text-white">{m.title || t('maint.title')}</h1>
        {m.message && <p className="text-gray-200 mt-3 whitespace-pre-line">{m.message}</p>}
        {m.ends_at && (
          <div className="mt-6 rounded-2xl border border-lime-400/40 bg-lime-400/10 px-4 py-4">
            <p className="text-lime-200 text-sm">{t('maint.backAt', { time: fmt(m.ends_at, lang) })}</p>
            {!over && <p className="text-white text-3xl font-bold tabular-nums mt-1" aria-live="off">{left(m.ends_at, now)}</p>}
            {over && <p className="text-white text-sm mt-1">{t('maint.almost')}</p>}
          </div>
        )}
        <p className="text-gray-400 text-sm mt-6">{t('maint.sorry')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn-primary text-sm" onClick={async () => { if (!(await check())) window.location.reload(); }}>↻ {t('maint.retry')}</button>
          <Link href="/sign-in" className="text-gray-500 text-xs self-center hover:text-gray-300">{t('maint.adminSignIn')}</Link>
        </div>
      </div>
    </div>
  );
}
