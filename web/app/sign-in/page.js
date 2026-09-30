'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

// Only same-site paths, so ?next= can't bounce people to another website.
function nextPath() {
  const next = new URLSearchParams(window.location.search).get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export default function SignInPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!loading && user) router.replace(nextPath());
  }, [loading, user, router]);

  // Coming back from an expired / already-used confirmation link (#error_code=otp_expired…).
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    if (!h.get('error')) return;
    setError(h.get('error_code') === 'otp_expired' ? t('auth.linkExpired') : h.get('error_description') || t('common.error'));
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data, error: authErr } = mode === 'signIn' ? await signIn(email, password) : await signUp(email, password);
      if (authErr) throw authErr;
      if (mode === 'signUp' && !data?.session) {
        setInfo(t('auth.checkEmail'));
        return;
      }
      router.replace(nextPath());
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm">
        <h1 className="text-lime-400 font-bold text-xl mb-1">{t('appName')}</h1>
        <p className="text-gray-400 text-sm mb-4">{mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}</p>

        {info && <div className="bg-lime-400/10 border border-lime-400/40 text-lime-200 text-sm rounded-lg p-2 mb-3">{info}</div>}
        {error && <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm rounded-lg p-2 mb-3">{error}</div>}

        <label className="text-xs text-gray-400 mb-1 block">{t('auth.email')}</label>
        <input className="input mb-3" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="text-xs text-gray-400 mb-1 block">{t('auth.password')}</label>
        <input className="input mb-4" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />

        <button type="submit" disabled={busy} className="btn-primary w-full mb-3">
          {t('auth.submit')}
        </button>

        <button
          type="button"
          className="text-sm text-gray-400 hover:text-lime-400 w-full text-center"
          onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
        >
          {mode === 'signIn' ? t('auth.noAccount') : t('auth.haveAccount')}
        </button>
      </form>
    </div>
  );
}
