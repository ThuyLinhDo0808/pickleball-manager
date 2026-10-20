'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useI18n } from '@/context/I18nContext';

// Where the sign-up confirmation email lands. The link signs the new account in for a
// moment; we sign it out again so the person logs in themselves on the sign-in page.
export default function WelcomePage() {
  const { t, lang, setLang } = useI18n();
  const [state, setState] = useState('checking'); // checking | done | expired | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const err = hash.get('error') || query.get('error');
    if (err) {
      const code = hash.get('error_code') || query.get('error_code');
      setState(code === 'otp_expired' ? 'expired' : 'error');
      setMessage(hash.get('error_description') || query.get('error_description') || '');
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    let live = true;
    (async () => {
      try {
        // PKCE links come back with ?code=…; the hash kind is picked up by the client itself.
        const code = query.get('code');
        if (code) await supabase.auth.exchangeCodeForSession(code).catch(() => {});
        const { data } = await supabase.auth.getSession();
        if (data.session) await supabase.auth.signOut({ scope: 'local' });
      } catch {
        /* the account is confirmed either way */
      }
      window.history.replaceState(null, '', window.location.pathname);
      if (live) setState('done');
    })();
    return () => {
      live = false;
    };
  }, []);

  const ok = state === 'done';
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 px-4 py-10">
      <div className="card w-full max-w-md text-center">
        <div className="flex justify-between items-center mb-2">
          <span className="text-lime-400 font-bold">{t('appName')}</span>
          <button onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="text-xs text-gray-400 border border-navy-700 rounded-full px-3 py-1">
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
        </div>

        {state === 'checking' && <p className="text-gray-400 py-10">{t('common.loading')}</p>}

        {ok && (
          <>
            <div className="text-5xl mt-4" aria-hidden="true">🎉</div>
            <h1 className="text-white text-2xl font-bold mt-3">{t('welcome.title')}</h1>
            <p className="text-gray-300 mt-2">{t('welcome.subtitle')}</p>
            <ol className="text-left text-sm text-gray-300 bg-navy-900 rounded-lg p-4 mt-5 flex flex-col gap-2 list-decimal list-inside">
              <li>{t('welcome.step1')}</li>
              <li>{t('welcome.step2')}</li>
              <li>{t('welcome.step3')}</li>
            </ol>
            <Link href="/sign-in" className="btn-primary w-full block mt-5 py-3">{t('welcome.toSignIn')} →</Link>
            <Link href="/sign-in?mode=signUp" className="block text-sm text-gray-400 hover:text-lime-400 mt-3">{t('welcome.toSignUp')}</Link>
          </>
        )}

        {(state === 'expired' || state === 'error') && (
          <>
            <div className="text-5xl mt-4" aria-hidden="true">⚠️</div>
            <h1 className="text-white text-xl font-bold mt-3">{t('welcome.failTitle')}</h1>
            <p className="text-gray-300 text-sm mt-2">{state === 'expired' ? t('auth.linkExpired') : message || t('common.error')}</p>
            <Link href="/sign-in" className="btn-primary w-full block mt-5 py-3">{t('welcome.toSignIn')} →</Link>
            <Link href="/sign-in?mode=signUp" className="block text-sm text-gray-400 hover:text-lime-400 mt-3">{t('welcome.signUpAgain')}</Link>
          </>
        )}
      </div>
    </div>
  );
}
