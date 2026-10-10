'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';

// Time left until `until`, ticking every second: "2 ngày 03:12:45" / "03:12:45".
export function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  if (!until) return null;
  return Math.max(0, new Date(until).getTime() - now);
}

export function formatLeft(ms, t) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  return d > 0 ? `${t('countdown.days', { n: d })} ${hms}` : hms;
}

// A big live countdown, e.g. "⏳ Còn 1 ngày 02:10:05 để đăng ký".
export default function Countdown({ until, labelKey = 'countdown.signup', tone = 'amber', className = '' }) {
  const { t, lang } = useI18n();
  const left = useCountdown(until);
  if (left == null) return null;
  const when = new Date(until).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  const urgent = left < 3600 * 1000;
  const colors = urgent ? 'border-red-400/60 bg-red-500/10 text-red-100' : tone === 'sky' ? 'border-sky-400/50 bg-sky-400/10 text-sky-100' : 'border-amber-300/50 bg-amber-300/10 text-amber-100';
  return (
    <div className={`rounded-xl border px-3 py-2 text-center ${colors} ${className}`} role="timer" aria-live="off">
      {left > 0 ? (
        <>
          <p className="text-xs opacity-80">{t(labelKey)}</p>
          <p className="text-2xl font-bold tabular-nums tracking-wide">{formatLeft(left, t)}</p>
          <p className="text-[11px] opacity-70">{t('countdown.until', { when })}</p>
        </>
      ) : (
        <p className="text-sm font-semibold">{t('countdown.over')}</p>
      )}
    </div>
  );
}
