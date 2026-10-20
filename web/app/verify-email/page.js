'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { emailVerified } from '@/components/EmailVerifyBanner';
import { localDate } from '@/lib/dates';

const COOLDOWN = 60; // seconds between two "send a new code"

// Only same-site paths, so ?next= can't bounce people to another website.
function nextPath() {
  const next = new URLSearchParams(window.location.search).get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/home';
}

const fmt = (d) => (d ? localDate(new Date(d), 'vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }, true) : '');

// Right after sign-up (and from the reminder bar): type the 6-digit code emailed to the
// account. The link in the same email lands here too and confirms on its own. "Later"
// goes on to the kèo: an unconfirmed account can hold one place for 48 hours.
export default function VerifyEmailPage() {
  const { t, lang, setLang } = useI18n();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [st, setSt] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [wait, setWait] = useState(0);
  const tried = useRef(false);

  // The email link: PKCE (?code=) or hash; the client picks the hash up by itself.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('code')) supabase.auth.exchangeCodeForSession(q.get('code')).catch(() => {});
    if (q.get('resend') === '1') setInfo(t('everify.notSentYet'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/sign-in?next=${encodeURIComponent(`/verify-email?next=${encodeURIComponent(nextPath())}`)}`);
      return;
    }
    let live = true;
    (async () => {
      let s = await api.get('/api/host/account/email-status').catch(() => null);
      // Came from the link in the email: that sign-in proves the address.
      if (s && !s.verified && !tried.current) {
        tried.current = true;
        const r = await api.post('/api/host/account/verify-email', {}).catch(() => null);
        if (r?.verified) s = { ...s, verified: true };
      }
      if (live) setSt(s);
    })();
    return () => {
      live = false;
    };
  }, [user, loading, router]);

  useEffect(() => {
    if (!wait) return undefined;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  // Confirmed: back to where they came from (a full load, so every page sees it).
  const done = st?.verified;
  useEffect(() => {
    if (!done) return;
    emailVerified();
    const id = window.setTimeout(() => window.location.assign(nextPath()), 1200);
    return () => window.clearTimeout(id);
  }, [done]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/host/account/verify-email', { code });
      setSt((s) => ({ ...s, verified: true }));
    } catch (err) {
      const c = err.payload?.code;
      setError(c === 'bad_code' ? t('everify.badCode') : c === 'rate_limited' ? t('everify.tooMany') : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    setInfo('');
    try {
      await api.post('/api/host/account/verify-email/send', { origin: window.location.origin });
      setInfo(t('everify.sent'));
      setWait(COOLDOWN);
    } catch (err) {
      setError(err.payload?.code === 'code_rate_limit' || err.status === 429 ? t('everify.waitResend') : err.message);
      setWait(COOLDOWN);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 px-4 py-10">
      <div className="card w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <span className="text-lime-400 font-bold">{t('appName')}</span>
          <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
        </div>
        {!st && <p className="text-gray-400 py-10 text-center">{t('common.loading')}</p>}

        {st?.verified && (
          <div className="text-center py-6">
            <div className="text-5xl" aria-hidden="true">✅</div>
            <h1 className="text-white text-xl font-bold mt-3">{t('everify.doneTitle')}</h1>
            <p className="text-gray-300 text-sm mt-1">{t('everify.doneBody')}</p>
          </div>
        )}

        {st && !st.verified && (
          <>
            <div className="text-4xl" aria-hidden="true">📬</div>
            <h1 className="text-white text-xl font-bold mt-2">{t('everify.title')}</h1>
            <p className="text-gray-300 text-sm mt-1">{t('everify.body', { email: st.email })}</p>
            <p className="text-gray-500 text-xs mt-1">{t('everify.spamHint')}</p>
            <form onSubmit={submit} className="mt-4">
              <label htmlFor="verify-code" className="text-xs text-gray-400">{t('everify.codeLabel')}</label>
              <input
                id="verify-code"
                className="input text-center text-2xl tracking-[0.4em] tabular-nums"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={7}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
              />
              {error && <p className="text-red-300 text-sm mt-2" role="alert">{error}</p>}
              {info && <p className="text-lime-300 text-sm mt-2" role="status">{info}</p>}
              <button className="btn-primary w-full py-3 mt-3" disabled={busy || code.replace(/\s/g, '').length !== 6}>{busy ? t('auth.working') : t('everify.confirm')}</button>
            </form>
            <button type="button" onClick={resend} disabled={wait > 0} className="w-full text-sm text-gray-300 hover:text-white mt-3 disabled:text-gray-500">
              {wait > 0 ? t('everify.resendIn', { s: wait }) : t('everify.resend')}
            </button>
            <div className="mt-5 rounded-lg border border-navy-700 bg-navy-900/60 p-3 text-sm">
              {st.expired ? (
                <p className="text-amber-200">⚠️ {t('everify.expired')}</p>
              ) : (
                <>
                  <p className="text-gray-300">{t('everify.laterHint', { date: fmt(st.deadline), h: st.grace_hours })}</p>
                  <Link href={nextPath()} className="inline-block mt-2 text-lime-300 font-semibold hover:underline">{t('everify.later')} →</Link>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
