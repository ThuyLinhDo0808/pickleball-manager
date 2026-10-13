'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Asked once per account per page load; the code page clears it when confirmed.
const known = new Map(); // user id -> status
export function emailVerified() {
  known.clear();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pb:email-verified'));
}

const HIDE = ['/verify-email', '/sign-in', '/welcome', '/reset-password', '/onboarding', '/privacy', '/terms'];
const fmt = (d) => (d ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '');

// Accounts made with the quick sign-up and not confirmed yet: a bar on every page with
// the deadline and a link to type the code.
export default function EmailVerifyBanner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = usePathname() || '';
  const [st, setSt] = useState(null);
  useEffect(() => {
    if (!user) return setSt(null);
    let live = true;
    const load = () => {
      if (known.has(user.id)) return setSt(known.get(user.id));
      api
        .get('/api/host/account/email-status')
        .then((s) => {
          known.set(user.id, s);
          if (live) setSt(s);
        })
        .catch(() => {});
    };
    load();
    const on = () => setSt((s) => (s ? { ...s, verified: true } : s));
    window.addEventListener('pb:email-verified', on);
    return () => {
      live = false;
      window.removeEventListener('pb:email-verified', on);
    };
  }, [user]);
  if (!st || st.verified || HIDE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  const here = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/home';
  return (
    <div className={`sticky top-0 z-[55] text-sm px-3 py-1.5 flex items-center gap-2 justify-center flex-wrap ${st.expired ? 'bg-red-400 text-navy-950' : 'bg-amber-200 text-navy-950'}`} role="status">
      <span>📬 {st.expired ? t('everify.barExpired') : t('everify.bar', { date: fmt(st.deadline) })}</span>
      <Link href={`/verify-email?next=${encodeURIComponent(here)}`} className="rounded-full bg-navy-950 text-white px-3 py-0.5 text-xs font-semibold">{t('everify.barCta')}</Link>
    </div>
  );
}
