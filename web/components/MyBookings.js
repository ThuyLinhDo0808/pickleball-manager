'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatDay } from '@/lib/dates';

// Quick bookings (link đặt nhanh) remembered on this device: the booking page link is the
// only key, so it is kept here to open the tickets / QR again after leaving the site.
const KEY = 'pb_my_bookings';
const readLocal = () => {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};
export function rememberBooking(b) {
  const list = readLocal().filter((x) => x.token !== b.token);
  list.unshift({ ...b, at: new Date().toISOString() });
  window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
}

// "Lịch đã đăng ký": quick bookings on this device + those made while signed in, coming
// up (or played in the last 2 days), each slot with its ticket (QR) once confirmed.
export default function MyBookings({ signedIn = false }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const local = readLocal().filter((b) => !b.event_date || b.event_date >= since);
    Promise.all([
      signedIn ? api.get('/api/player/bookings').catch(() => []) : Promise.resolve([]),
      Promise.all(local.map((b) => api.publicGet(`/api/public/quick/booking/${b.token}`).then((v) => ({ ...v, token: b.token })).catch(() => null))),
    ]).then(([mine, fromDevice]) => {
      const all = [...(fromDevice || []).filter(Boolean), ...(mine || [])].filter((b) => b.event?.event_date >= since && b.state !== 'cancelled');
      const seen = new Set();
      setRows(all.filter((b) => {
        const k = `${b.event.id}:${b.contact?.full_name}:${b.slots?.length}`;
        return seen.has(k) ? false : seen.add(k);
      }).sort((a, b) => a.event.event_date.localeCompare(b.event.event_date)));
    });
  }, [signedIn]);
  if (!rows || !rows.length) return null;
  return (
    <section className="mb-4">
      <h2 className="text-white font-semibold mb-2">🎟 {t('mybook.title')}</h2>
      <div className="flex flex-col gap-2">
        {rows.map((b) => (
          <div key={`${b.event.id}:${b.token || b.id}`} className="card !p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white font-semibold break-words">{b.event.title}</p>
                <p className="text-gray-400 text-xs capitalize">{formatDay(b.event.event_date, lang, { weekday: 'long', day: '2-digit', month: '2-digit' })}{b.event.club_name ? ` · ${b.event.club_name}` : ''}</p>
              </div>
              <span className={`text-[11px] rounded-full border px-2 py-0.5 ${b.state === 'confirmed' ? 'border-lime-400/60 text-lime-200' : 'border-amber-300/60 text-amber-200'}`}>{t(`mybook.st_${b.state}`)}</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(b.slots || []).filter((s) => s.ticket_code).map((s) => (
                <Link key={s.ticket_code} href={`/t/${s.ticket_code}`} className="btn-secondary text-sm">📱 {t('mybook.qr', { name: s.full_name })}</Link>
              ))}
              {b.token && <Link href={`/g/b/${b.token}`} className="btn-primary text-sm">{b.state === 'confirmed' ? t('mybook.open') : t('mybook.pay')} →</Link>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
