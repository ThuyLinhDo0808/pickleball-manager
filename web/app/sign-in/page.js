'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { deviceId } from '@/lib/device';
import { api } from '@/lib/api';
import { Logo, Stage, Words, F, useCurtain, curtainClick } from '@/components/Landing';

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
  if (code === 'maintenance') return t('auth.err_maintenance', { time: err.payload.maintenance?.ends_at ? new Date(err.payload.maintenance.ends_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—' });
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

// The court behind the form changes its camera with the form (same look as the landing page).
const AUTH_SCENES = {
  signIn: { cam: [58, -30, 1.25, '-12vw', '14vh'], ball: [48, 68], glow: ['#B6F03B', '#38BDF8'] },
  signUp: { cam: [52, 36, 1.5, '-14vw', '10vh'], ball: [34, 30], glow: ['#38BDF8', '#B6F03B'] },
  forgot: { cam: [0, 0, 0.8, '4vw', '6vh'], ball: [70, 40], glow: ['#FBBF24', '#B6F03B'] },
  sent: { cam: [70, 90, 1.2, '-14vw', '16vh'], ball: [50, 50], glow: ['#34D399', '#B6F03B'] },
};
const ORDER = ['signIn', 'signUp', 'forgot', 'sent'];
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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

  // Switching form plays a scene change: the heading and the card leave upwards, the court
  // moves its camera, then the new heading and card come in.
  const [state, setState] = useState('future'); // future → active; past while leaving
  const [sweep, setSweep] = useState({ n: 0, dir: 1 });
  const timers = useRef([]);
  useEffect(() => {
    const id = setTimeout(() => setState('active'), reduced() ? 0 : 350);
    const list = timers.current;
    return () => {
      clearTimeout(id);
      list.forEach(clearTimeout);
    };
  }, []);
  const go = (m, note = '') => {
    const apply = () => {
      setMode(m);
      setError('');
      setInfo(note);
      setUnconfirmed(false);
    };
    if (m === mode || reduced()) return apply();
    setSweep((x) => ({ n: x.n + 1, dir: ORDER.indexOf(m) > ORDER.indexOf(mode) ? 1 : -1 }));
    setState('past');
    timers.current.push(
      setTimeout(() => {
        apply();
        setState('future');
        timers.current.push(setTimeout(() => setState('active'), 40));
      }, 520),
    );
    return undefined;
  };
  const { curtain, leave } = useCurtain();
  const rootRef = useRef(null);
  const onMove = (e) => {
    if (reduced() || e.pointerType !== 'mouse' || !rootRef.current) return;
    rootRef.current.style.setProperty('--px', (e.clientX / window.innerWidth - 0.5).toFixed(3));
    rootRef.current.style.setProperty('--py', (e.clientY / window.innerHeight - 0.5).toFixed(3));
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
      go('sent', t('auth.checkEmailTo', { email: f.email }));
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

  const title = t(`auth.scene_${mode}`);

  return (
    <div ref={rootRef} onPointerMove={onMove} onClickCapture={curtainClick(leave, ['/'])} className="lp-root relative flex min-h-[100svh] flex-col overflow-x-hidden bg-navy-950">
      <Stage scene={AUTH_SCENES[mode]} idx={ORDER.indexOf(mode)} />
      {sweep.n > 0 && <span key={sweep.n} className={`lp-sweep ${sweep.dir > 0 ? 'down' : 'up'}`} aria-hidden="true" />}
      <header className="relative z-20 mx-auto flex h-20 w-full max-w-[1440px] items-center gap-3 px-5 sm:px-10 lg:px-16">
        <Link href="/" aria-label={t('auth.toLanding')}><Logo className="text-base" /></Link>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/" className="hidden items-center gap-1.5 rounded-full px-3 h-9 text-sm text-gray-300 hover:text-white sm:inline-flex">
            <span aria-hidden="true">←</span> {t('auth.toLanding')}
          </Link>
          <button type="button" onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')} className="h-9 rounded-full border border-white/15 px-3 text-xs font-semibold text-gray-300 hover:text-white" aria-label={t('landing.switchLang')}>
            {lang === 'vi' ? 'EN' : 'VI'}
          </button>
        </div>
      </header>
      <main data-state={state} className="lp-snap relative z-10 mx-auto grid w-full max-w-[1440px] flex-1 content-center items-center gap-8 px-5 pb-10 sm:px-10 lg:grid-cols-[1fr_minmax(0,32rem)] lg:gap-16 lg:px-16">
        <div>
          <F d={0} as="p" className="hidden items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-lime-300 lg:flex">
            <span className="tabular-nums text-gray-500">{String(ORDER.indexOf(mode) + 1).padStart(2, '0')}</span>
            <span className="h-px w-10 bg-lime-400/60" aria-hidden="true" />
            {t('landing.hero_eyebrow')}
          </F>
          <h1 className="text-[clamp(2.4rem,3.4vw+2.4vh,6rem)] font-extrabold leading-[1.04] tracking-tight text-white [text-wrap:balance] lg:mt-6">
            <Words text={title} />
          </h1>
        </div>
        <div className={`lp-v w-full justify-self-center ${mode === 'signUp' ? 'max-w-xl' : 'max-w-md'} lg:justify-self-end`}>
        <div className="rounded-3xl border border-white/10 bg-navy-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
          {(mode === 'signIn' || mode === 'signUp') && (
            <div className="mb-6 grid grid-cols-2 rounded-full border border-white/10 bg-navy-950/60 p-1 text-sm font-semibold" role="tablist">
              {['signIn', 'signUp'].map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => go(m)} className={`h-10 rounded-full transition ${mode === m ? 'bg-lime-400 text-navy-950 shadow-[0_4px_20px_rgba(182,240,59,0.35)]' : 'text-gray-300 hover:text-white'}`}>
                  {t(m === 'signIn' ? 'auth.signIn' : 'auth.signUp')}
                </button>
              ))}
            </div>
          )}
          {mode === 'forgot' && <p className="mb-5 text-sm text-gray-400">{t('auth.forgotSub')}</p>}

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
      </main>
      <p className="relative z-10 pb-6 text-center text-xs text-gray-500">
        <a href="/terms" className="hover:text-gray-300 underline underline-offset-2">{t('legal.termsTitle')}</a>
        {' · '}
        <a href="/privacy" className="hover:text-gray-300 underline underline-offset-2">{t('legal.privacyTitle')}</a>
      </p>
      {curtain}
    </div>
  );
}
