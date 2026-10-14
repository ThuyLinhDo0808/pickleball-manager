'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { deviceId } from '@/lib/device';
import { api } from '@/lib/api';
import { Aurora, CourtLines, Logo, LiveScoreMock, DuprMock } from '@/components/Landing';

// Only same-site paths, so ?next= can't bounce people to another website.
function nextPath() {
  const next = new URLSearchParams(window.location.search).get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/home';
}

const USERNAME = /^[a-z][a-z0-9._]{2,29}$/;

// API error code -> words people understand.
function errorText(err, t) {
  const code = err?.payload?.code;
  if (err?.status === 429) return t('auth.rateLimit');
  if (code === 'terms_required') return t('legal.termsRequired');
  const known = ['invalid_login', 'email_not_confirmed', 'username_taken', 'email_taken', 'bad_username', 'weak_password', 'bad_email', 'bad_birth_date', 'bad_gender', 'bad_region', 'email_rate_limit', 'auth_unavailable'];
  return known.includes(code) ? t(`auth.err_${code}`) : err?.message || t('common.error');
}

function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="mb-3">
      <label htmlFor={htmlFor} className="text-xs font-medium text-gray-300 mb-1 block">{label}</label>
      {children}
      {hint && <div className="mt-1 text-[11px]">{hint}</div>}
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, minLength }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-16"
        type={show ? 'text' : 'password'}
        required
        minLength={minLength}
        maxLength={72}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-400 hover:text-lime-300" aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}>
        {show ? t('auth.hide') : t('auth.show')}
      </button>
    </div>
  );
}

// Left side on wide screens: what the app is for.
// Left half on large screens: the same look as the landing page (glows, court lines, product
// cards) with what the account gives you.
function BrandPanel() {
  const { t } = useI18n();
  return (
    <aside className="relative hidden lg:flex flex-col justify-between gap-10 overflow-hidden border-r border-white/5 bg-navy-900/40 p-12 xl:p-16">
      <Aurora />
      <CourtLines />
      <Link href="/" className="relative z-10 w-fit" aria-label={t('auth.toLanding')}><Logo className="text-lg" /></Link>
      <div className="relative z-10">
        <h2 className="lp-rise max-w-lg text-4xl xl:text-[2.9rem] font-black leading-[1.08] tracking-tight text-white">{t('auth.heroTitle')}</h2>
        <p className="lp-rise mt-4 max-w-md text-lg text-gray-300" style={{ animationDelay: '120ms' }}>{t('auth.heroBody')}</p>
        <div className="relative mt-10 h-48 max-w-md" aria-hidden="true">
          <DuprMock className="absolute left-0 top-0 w-48 lp-float-slow" />
          <LiveScoreMock className="absolute right-0 top-14 w-48 lp-float" />
        </div>
      </div>
      <ul className="relative z-10 space-y-3 text-sm text-gray-200">
        {['hero1', 'hero2', 'hero3'].map((k, i) => (
          <li key={k} className="lp-rise flex items-start gap-3" style={{ animationDelay: `${300 + i * 120}ms` }}>
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-lime-400/15 text-xs text-lime-300" aria-hidden="true">✓</span>
            {t(`auth.${k}`)}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default function SignInPage() {
  const { user, loading, adoptSession } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState('signIn'); // signIn | signUp | forgot | sent
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  // sign in / forgot
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  // sign up
  const [f, setF] = useState({ username: '', password: '', password2: '', email: '', gender: '' });
  const [agree, setAgree] = useState(false);
  const [nameState, setNameState] = useState(null); // null | 'checking' | 'free' | 'taken' | 'invalid'
  const set = (k) => (e) => setF({ ...f, [k]: typeof e === 'string' ? e : e.target.value });

  // The owner console signs out after 30 idle minutes and lands here with ?idle=1.
  const [idleOut, setIdleOut] = useState(false);
  useEffect(() => {
    setIdleOut(new URLSearchParams(window.location.search).get('idle') === '1');
  }, []);
  // Just signed up: the page goes on to the email code instead (see signUp below).
  const [justSignedUp, setJustSignedUp] = useState(false);
  useEffect(() => {
    if (!loading && user && !justSignedUp) router.replace(nextPath());
  }, [loading, user, router, justSignedUp]);

  // /sign-in?mode=signUp opens the sign-up form; a flag in sessionStorage comes from
  // deleting an account; an expired confirmation link comes back with #error_code.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('mode') === 'signUp') setMode('signUp');
    if (q.get('mode') === 'forgot') setMode('forgot');
    try {
      if (window.sessionStorage.getItem('pickleball_deleted')) {
        window.sessionStorage.removeItem('pickleball_deleted');
        setInfo(t('deleteAccount.done'));
      }
    } catch {
      /* ignore */
    }
    const h = new URLSearchParams(window.location.hash.slice(1));
    if (h.get('error')) {
      setError(h.get('error_code') === 'otp_expired' ? t('auth.linkExpired') : h.get('error_description') || t('common.error'));
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Is the username free? Checked as you type, after a short pause.
  useEffect(() => {
    if (mode !== 'signUp') return undefined;
    const u = f.username.trim().toLowerCase();
    if (!u) return setNameState(null);
    if (!USERNAME.test(u)) return setNameState('invalid');
    setNameState('checking');
    const id = setTimeout(() => {
      api.publicGet(`/api/public/auth/username?u=${encodeURIComponent(u)}`).then((r) => setNameState(r.available ? 'free' : 'taken')).catch(() => setNameState(null));
    }, 400);
    return () => clearTimeout(id);
  }, [f.username, mode]);

  const go = (m) => {
    setMode(m);
    setError('');
    setInfo('');
    setUnconfirmed(false);
  };

  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setUnconfirmed(false);
    try {
      const r = await api.publicPost('/api/public/auth/login', { login, password, device_id: deviceId() });
      const { error: err } = await adoptSession(r.session);
      if (err) throw err;
      router.replace(nextPath());
    } catch (err) {
      if (err?.payload?.code === 'email_not_confirmed') setUnconfirmed(true);
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function signUp(e) {
    e.preventDefault();
    setError('');
    if (f.password !== f.password2) return setError(t('auth.passwordMismatch'));
    if (nameState === 'taken') return setError(t('auth.err_username_taken'));
    if (!agree) return setError(t('legal.termsRequired'));
    setBusy(true);
    try {
      const { password2, ...body } = f;
      const r = await api.publicPost('/api/public/auth/signup', { ...body, username: f.username.trim().toLowerCase(), origin: window.location.origin, accept_terms: agree, device_id: deviceId() });
      if (r.session) {
        // Signed in at once; next: the 6-digit code (it can be skipped to hold a place first).
        setJustSignedUp(true);
        await adoptSession(r.session);
        router.replace(r.verify_email ? `/verify-email?next=${encodeURIComponent(nextPath())}${r.code_sent === false ? '&resend=1' : ''}` : nextPath());
        return;
      }
      setLogin(f.username.trim().toLowerCase());
      setInfo(t('auth.checkEmailTo', { email: f.email }));
      setMode('sent');
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function forgot(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.publicPost('/api/public/auth/forgot', { login, origin: window.location.origin });
      setInfo(t('auth.resetSent'));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    try {
      await api.publicPost('/api/public/auth/resend', { login: login || f.username || f.email, origin: window.location.origin });
      setUnconfirmed(false);
      setInfo(t('auth.resentGeneric'));
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  const nameHint = {
    checking: <span className="text-gray-400">{t('auth.nameChecking')}</span>,
    free: <span className="text-lime-300">✓ {t('auth.nameFree')}</span>,
    taken: <span className="text-red-300">✗ {t('auth.err_username_taken')}</span>,
    invalid: <span className="text-amber-200">{t('auth.usernameRule')}</span>,
  }[nameState] || <span className="text-gray-500">{t('auth.usernameRule')}</span>;

  const title = { signIn: t('auth.welcomeBack'), signUp: t('auth.createAccount'), forgot: t('auth.forgotTitle'), sent: t('auth.checkInbox') }[mode];
  const sub = { signIn: t('auth.signInSub'), signUp: t('auth.signUpSub'), forgot: t('auth.forgotSub'), sent: '' }[mode];

  return (
    <div className="min-h-screen bg-navy-950 lg:grid lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="lg:hidden"><Aurora /></div>
        <div className="relative z-10 flex items-center justify-between gap-3 px-4 sm:px-8 h-16">
          <Link href="/" className="lg:hidden" aria-label={t('auth.toLanding')}><Logo className="text-base" /></Link>
          <Link href="/" className="hidden lg:inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
            <span aria-hidden="true">←</span> {t('auth.toLanding')}
          </Link>
          <button type="button" onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="h-9 rounded-full border border-white/10 px-3 text-xs font-semibold text-gray-300 hover:text-white" aria-label={t('landing.switchLang')}>
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
        </div>
        <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
        <div className={`lp-rise w-full ${mode === 'signUp' ? 'max-w-xl' : 'max-w-md'} rounded-3xl border border-white/10 bg-navy-900/80 p-6 sm:p-9 shadow-2xl shadow-black/40 backdrop-blur-xl`}>
          {(mode === 'signIn' || mode === 'signUp') && (
            <div className="mb-7 grid grid-cols-2 rounded-full border border-white/10 bg-navy-950/60 p-1 text-sm font-semibold" role="tablist">
              {['signIn', 'signUp'].map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => go(m)} className={`h-10 rounded-full transition ${mode === m ? 'bg-lime-400 text-navy-950 shadow-[0_4px_20px_rgba(182,240,59,0.35)]' : 'text-gray-300 hover:text-white'}`}>
                  {t(m === 'signIn' ? 'auth.signIn' : 'auth.signUp')}
                </button>
              ))}
            </div>
          )}
          <h1 className="text-white text-3xl font-black tracking-tight">{title}</h1>
          {sub && <p className="text-gray-400 text-sm mt-1 mb-5">{sub}</p>}

          {info && <div className="bg-lime-400/10 border border-lime-400/40 text-lime-200 text-sm rounded-lg p-3 mb-4" role="status">{info}</div>}
          {idleOut && !error && <div className="bg-amber-900/30 border border-amber-600/60 text-amber-100 text-sm rounded-lg p-3 mb-4" role="status">🔒 {t('sec.idleOut')}</div>}
          {error && <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm rounded-lg p-3 mb-4" role="alert">{error}</div>}
          {unconfirmed && (
            <button type="button" className="text-sm text-lime-400 underline mb-4" disabled={busy} onClick={resend}>{t('auth.resend')}</button>
          )}

          {mode === 'signIn' && (
            <form onSubmit={signIn}>
              <Field label={t('auth.username')} htmlFor="login">
                <input id="login" className="input" required autoComplete="username" autoCapitalize="none" placeholder={t('auth.usernamePh')} value={login} onChange={(e) => setLogin(e.target.value)} />
              </Field>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="pw" className="text-xs font-medium text-gray-300">{t('auth.password')}</label>
                <button type="button" className="text-xs text-lime-400 hover:underline" onClick={() => go('forgot')}>{t('auth.forgot')}</button>
              </div>
              <div className="mb-5">
                <PasswordInput id="pw" value={password} onChange={setPassword} autoComplete="current-password" />
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? t('auth.working') : t('auth.signIn')}</button>
              <p className="text-sm text-gray-400 text-center mt-5">
                {t('auth.noAccountQ')}{' '}
                <button type="button" className="text-lime-400 font-semibold hover:underline" onClick={() => go('signUp')}>{t('auth.signUp')}</button>
              </p>
            </form>
          )}

          {mode === 'signUp' && (
            <form onSubmit={signUp}>
              <div className="grid sm:grid-cols-2 gap-x-3">
                <Field label={`${t('auth.usernameNew')} *`} htmlFor="su-user" hint={nameHint}>
                  <input id="su-user" className="input" required autoComplete="username" autoCapitalize="none" maxLength={30} value={f.username} onChange={(e) => set('username')(e.target.value.toLowerCase())} />
                </Field>
                <Field label={`${t('auth.email')} *`} htmlFor="su-email">
                  <input id="su-email" className="input" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
                </Field>
                <Field label={`${t('auth.password')} *`} htmlFor="su-pw" hint={<span className="text-gray-500">{t('auth.passwordRule')}</span>}>
                  <PasswordInput id="su-pw" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={8} />
                </Field>
                <Field
                  label={`${t('auth.password2')} *`}
                  htmlFor="su-pw2"
                  hint={f.password2 && f.password2 !== f.password ? <span className="text-red-300">{t('auth.passwordMismatch')}</span> : null}
                >
                  <PasswordInput id="su-pw2" value={f.password2} onChange={set('password2')} autoComplete="new-password" minLength={8} />
                </Field>
              </div>
              <fieldset className="mb-5">
                <legend className="text-xs font-medium text-gray-300 mb-1">{t('auth.gender')} *</legend>
                <div className="grid grid-cols-3 gap-2" role="radiogroup">
                  {['male', 'female', 'other'].map((g) => (
                    <label key={g} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm text-center ${f.gender === g ? 'border-lime-400 bg-lime-400 text-navy-950 font-semibold' : 'border-navy-600 text-gray-200 hover:border-navy-500'}`}>
                      <input type="radio" name="gender" value={g} required className="sr-only" checked={f.gender === g} onChange={() => set('gender')(g)} />
                      {t(`auth.g_${g}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-start gap-2 mb-4 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" className="mt-1" required checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>
                  {t('legal.agreePrefix')}{' '}
                  <a href="/terms" target="_blank" rel="noopener" className="text-lime-300 underline underline-offset-2">{t('legal.termsTitle')}</a>{' '}
                  {t('legal.agreeAnd')}{' '}
                  <a href="/privacy" target="_blank" rel="noopener" className="text-lime-300 underline underline-offset-2">{t('legal.privacyTitle')}</a>.
                </span>
              </label>
              <button type="submit" disabled={busy || nameState === 'taken' || !agree} className="btn-primary w-full">{busy ? t('auth.working') : t('auth.createAccount')}</button>
              <p className="text-sm text-gray-400 text-center mt-5">
                {t('auth.haveAccountQ')}{' '}
                <button type="button" className="text-lime-400 font-semibold hover:underline" onClick={() => go('signIn')}>{t('auth.signIn')}</button>
              </p>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={forgot}>
              <Field label={t('auth.username')} htmlFor="fg-login">
                <input id="fg-login" className="input" required autoCapitalize="none" placeholder={t('auth.usernamePh')} value={login} onChange={(e) => setLogin(e.target.value)} />
              </Field>
              <button type="submit" disabled={busy} className="btn-primary w-full mt-2">{busy ? t('auth.working') : t('auth.sendReset')}</button>
              <p className="text-sm text-center mt-5">
                <button type="button" className="text-lime-400 hover:underline" onClick={() => go('signIn')}>← {t('auth.backToSignIn')}</button>
              </p>
            </form>
          )}

          {mode === 'sent' && (
            <div>
              <p className="text-gray-300 text-sm mb-4">{t('auth.sentHint')}</p>
              <button type="button" className="btn-secondary w-full mb-3" disabled={busy} onClick={resend}>{t('auth.resend')}</button>
              <button type="button" className="btn-primary w-full" onClick={() => go('signIn')}>{t('auth.signIn')}</button>
            </div>
          )}
        </div>
        </div>
        <p className="relative z-10 pb-6 text-center text-xs text-gray-500">
          <a href="/terms" className="hover:text-gray-300 underline underline-offset-2">{t('legal.termsTitle')}</a>
          {' · '}
          <a href="/privacy" className="hover:text-gray-300 underline underline-offset-2">{t('legal.privacyTitle')}</a>
        </p>
      </div>
    </div>
  );
}
