'use client';
import { peekReturn } from '@/lib/returnTo';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { emailVerified } from '@/components/EmailVerifyBanner';
import { localDate } from '@/lib/dates';
import Hint from '@/components/ui/Hint';
import UiIcon from '@/components/ui/UiIcon';
import BrandLogo from '@/components/BrandLogo';

const COOLDOWN = 60; // seconds between two "send a new link"

// Only same-site paths, so ?next= can't bounce people to another website.
function nextPath() {
  const next = new URLSearchParams(window.location.search).get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') ? next : peekReturn() || '/home';
}

const fmt = (d) => (d ? localDate(new Date(d), 'vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }, true) : '');

// Right after sign-up (and from the reminder bar): "open the link we emailed you", with
// "send the link again". The link (?t=…) lands here and confirms on its own — on any
// device, signed in or not. "Later" goes on to the kèo: an unconfirmed account can hold
// one place for 48 hours.
export default function VerifyEmailPage() {
  const { t, lang, setLang } = useI18n();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [st, setSt] = useState(null);
  const [linkState, setLinkState] = useState(null); // null | 'checking' | 'done' | 'bad' | 'expired'
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [wait, setWait] = useState(0);
  const tried = useRef(false);

  // The email link: PKCE (?code=) or hash; the client picks the hash up by itself.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('code')) supabase.auth.exchangeCodeForSession(q.get('code')).catch(() => {});
    if (q.get('resend') === '1') setInfo(t('everify.notSentYet'));
    // Our own link: confirm it, signed in or not.
    const tok = q.get('t');
    if (tok) {
      setLinkState('checking');
      api
        .publicPost('/api/public/auth/verify-link', { t: tok })
        .then(() => {
          emailVerified();
          setLinkState('done');
        })
        .catch((err) => setLinkState(err.payload?.code === 'link_expired' ? 'expired' : 'bad'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading || linkState === 'checking' || linkState === 'done') return;
    if (!user) {
      if (linkState) return; // a bad / expired link: say so first
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
  }, [user, loading, router, linkState]);

  useEffect(() => {
    if (!wait) return undefined;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  // Confirmed: back to where they came from (a full load, so every page sees it).
  const done = st?.verified || (linkState === 'done' && !!user);
  useEffect(() => {
    if (!done) return;
    emailVerified();
    const id = window.setTimeout(() => window.location.assign(nextPath()), 1200);
    return () => window.clearTimeout(id);
  }, [done]);

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
          <BrandLogo markClass="h-7" wordClass="h-4" />
          <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
        </div>
        {!st && !linkState && <p className="text-gray-400 py-10 text-center">{t('common.loading')}</p>}
        {linkState === 'checking' && <p className="text-gray-400 py-10 text-center">{t('everify.checking')}</p>}

        {(st?.verified || linkState === 'done') && (
          <div className="text-center py-6">
            <div className="text-5xl" aria-hidden="true"><UiIcon name="checkCircle" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></div>
            <h1 className="text-white text-xl font-bold mt-3">{t('everify.doneTitle')}</h1>
            {user || loading ? (
              <p className="text-gray-300 text-sm mt-1">{t('everify.doneBody')}</p>
            ) : (
              <>
                <p className="text-gray-300 text-sm mt-1">{t('everify.doneSignIn')}</p>
                <div className="flex justify-end mt-4"><Link href="/sign-in" className="btn-primary">{t('everify.signIn')}</Link></div>
              </>
            )}
          </div>
        )}

        {(linkState === 'bad' || linkState === 'expired') && !st?.verified && (
          <div role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-200 mb-4">
            {t(linkState === 'expired' ? 'everify.linkExpired' : 'everify.linkBad')}
            {!user && !loading && <> <Link href={`/sign-in?next=${encodeURIComponent('/verify-email')}`} className="underline font-semibold">{t('everify.signIn')}</Link></>}
          </div>
        )}

        {st && !st.verified && linkState !== 'done' && linkState !== 'checking' && (
          <>
            <div className="text-4xl" aria-hidden="true"><UiIcon name="mail" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></div>
            <h1 className="text-white text-xl font-bold mt-2">{t('everify.title')}</h1>
            <p className="text-gray-300 text-sm mt-1">{t('everify.body', { email: st.email })}</p>
            <Hint text={t('everify.spamHint')} className="mt-1" />
            {error && <p className="text-red-300 text-sm mt-3" role="alert">{error}</p>}
            {info && <p className="text-lime-300 text-sm mt-3" role="status">{info}</p>}
            <button type="button" onClick={resend} disabled={wait > 0} className="btn-secondary w-full py-3 mt-4 disabled:opacity-60">
              {wait > 0 ? t('everify.resendIn', { s: wait }) : t('everify.resend')}
            </button>
            <div className="mt-5 rounded-lg border border-navy-700 bg-navy-900/60 p-3 text-sm">
              {st.expired ? (
                <p className="text-amber-200">{t('everify.expired')}</p>
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
