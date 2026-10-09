'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useI18n } from '@/context/I18nContext';

// Opened from the "reset your password" email. Supabase signs the person in from the
// link (recovery session); here they choose a new password.
export default function ResetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [ready, setReady] = useState(null); // null = checking, true = can set, false = bad link
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    if (h.get('error')) {
      setError(h.get('error_code') === 'otp_expired' ? t('auth.resetExpired') : h.get('error_description') || t('common.error'));
      setReady(false);
      return undefined;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else setTimeout(() => setReady((r) => (r === null ? false : r)), 2500);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    if (pw.length < 8) return setError(t('auth.err_weak_password'));
    if (pw !== pw2) return setError(t('auth.passwordMismatch'));
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) return setError(err.message);
    setDone(true);
    setTimeout(() => router.replace('/home'), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 px-4">
      <div className="card w-full max-w-sm !p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="h-9 w-9 rounded-lg bg-lime-400 text-navy-950 flex items-center justify-center text-xl" aria-hidden="true">🏓</span>
          <span className="text-lime-400 font-bold text-lg">{t('appName')}</span>
        </div>
        <h1 className="text-white text-2xl font-bold mb-1">{t('auth.newPasswordTitle')}</h1>
        {error && <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm rounded-lg p-3 my-3" role="alert">{error}</div>}
        {done && <div className="bg-lime-400/10 border border-lime-400/40 text-lime-200 text-sm rounded-lg p-3 my-3" role="status">✓ {t('auth.passwordChanged')}</div>}
        {ready === null && <p className="text-gray-400 text-sm mt-3">{t('common.loading')}</p>}
        {ready === false && (
          <div className="mt-3">
            {!error && <p className="text-gray-300 text-sm mb-3">{t('auth.resetBadLink')}</p>}
            <Link href="/sign-in?mode=forgot" className="btn-primary w-full block text-center">{t('auth.sendReset')}</Link>
          </div>
        )}
        {ready && !done && (
          <form onSubmit={save} className="mt-4">
            <label htmlFor="np1" className="text-xs font-medium text-gray-300 mb-1 block">{t('auth.newPassword')}</label>
            <input id="np1" className="input mb-1" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <p className="text-[11px] text-gray-500 mb-3">{t('auth.passwordRule')}</p>
            <label htmlFor="np2" className="text-xs font-medium text-gray-300 mb-1 block">{t('auth.password2')}</label>
            <input id="np2" className="input mb-5" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? t('auth.working') : t('auth.savePassword')}</button>
          </form>
        )}
      </div>
    </div>
  );
}
