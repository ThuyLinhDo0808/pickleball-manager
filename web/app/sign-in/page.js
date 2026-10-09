'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { REGIONS, ABROAD } from '@/lib/regions';

// Only same-site paths, so ?next= can't bounce people to another website.
function nextPath() {
  const next = new URLSearchParams(window.location.search).get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/home';
}

const USERNAME = /^[a-z][a-z0-9._]{2,29}$/;
const todayYmd = () => new Date().toISOString().slice(0, 10);

// API error code -> words people understand.
function errorText(err, t) {
  const code = err?.payload?.code;
  if (err?.status === 429) return t('auth.rateLimit');
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
function BrandPanel() {
  const { t } = useI18n();
  return (
    <div className="hidden lg:flex flex-col justify-between rounded-l-2xl bg-gradient-to-br from-lime-400/15 via-navy-800 to-navy-900 p-10 border-r border-navy-700">
      <div>
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 rounded-xl bg-lime-400 text-navy-950 flex items-center justify-center text-2xl" aria-hidden="true">🏓</span>
          <span className="text-lime-400 font-bold text-xl">{t('appName')}</span>
        </div>
        <h2 className="text-white text-3xl font-bold leading-tight mt-10">{t('auth.heroTitle')}</h2>
        <p className="text-gray-300 mt-3">{t('auth.heroBody')}</p>
      </div>
      <ul className="space-y-3 text-sm text-gray-200 mt-10">
        {['hero1', 'hero2', 'hero3'].map((k) => (
          <li key={k} className="flex items-start gap-2">
            <span className="text-lime-400 mt-0.5" aria-hidden="true">✓</span>
            {t(`auth.${k}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SignInPage() {
  const { user, loading, adoptSession } = useAuth();
  const { t } = useI18n();
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
  const [f, setF] = useState({ username: '', password: '', password2: '', email: '', birth_date: '', gender: '', region: '' });
  const [nameState, setNameState] = useState(null); // null | 'checking' | 'free' | 'taken' | 'invalid'
  const set = (k) => (e) => setF({ ...f, [k]: typeof e === 'string' ? e : e.target.value });

  useEffect(() => {
    if (!loading && user) router.replace(nextPath());
  }, [loading, user, router]);

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
      const r = await api.publicPost('/api/public/auth/login', { login, password });
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
    setBusy(true);
    try {
      const { password2, ...body } = f;
      const r = await api.publicPost('/api/public/auth/signup', { ...body, username: f.username.trim().toLowerCase(), origin: window.location.origin });
      if (r.session) {
        await adoptSession(r.session);
        router.replace(nextPath());
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
    <div className="min-h-screen flex items-center justify-center bg-navy-950 px-4 py-8">
      <div className={`w-full ${mode === 'signUp' ? 'max-w-4xl' : 'max-w-3xl'} grid lg:grid-cols-[5fr_6fr] rounded-2xl border border-navy-700 bg-navy-900 shadow-2xl shadow-black/40`}>
        <BrandPanel />
        <div className="p-6 sm:p-8">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <span className="h-9 w-9 rounded-lg bg-lime-400 text-navy-950 flex items-center justify-center text-xl" aria-hidden="true">🏓</span>
            <span className="text-lime-400 font-bold text-lg">{t('appName')}</span>
          </div>
          <h1 className="text-white text-2xl font-bold">{title}</h1>
          {sub && <p className="text-gray-400 text-sm mt-1 mb-5">{sub}</p>}

          {info && <div className="bg-lime-400/10 border border-lime-400/40 text-lime-200 text-sm rounded-lg p-3 mb-4" role="status">{info}</div>}
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
                <Field label={`${t('auth.birthDate')} *`} htmlFor="su-dob">
                  <input id="su-dob" className="input" type="date" required min="1900-01-01" max={todayYmd()} value={f.birth_date} onChange={set('birth_date')} />
                </Field>
                <Field label={`${t('auth.region')} *`} htmlFor="su-region">
                  <select id="su-region" className="input" required value={f.region} onChange={set('region')}>
                    <option value="" disabled>{t('auth.regionPick')}</option>
                    {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    <option value={ABROAD}>{t('auth.abroad')}</option>
                  </select>
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
              <button type="submit" disabled={busy || nameState === 'taken'} className="btn-primary w-full">{busy ? t('auth.working') : t('auth.createAccount')}</button>
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
    </div>
  );
}
