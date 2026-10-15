'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Modal from '@/components/Modal';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

// Two-step sign-in prompt. The API answers 403 mfa_required when this sign-in session
// still needs the code from the authenticator app (lib/api.js fires `pb:mfa`); 403
// mfa_enroll_required when the owner console — or managing a club / community (scope
// 'manager') — needs two-step sign-in turned on first.
export default function MfaGate() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const [need, setNeed] = useState(null); // 'mfa_required' | 'mfa_enroll_required'
  const [scope, setScope] = useState(null); // 'manager': managing a club / community
  const [resetAt, setResetAt] = useState(null); // an Owner reset (lost phone) is waiting
  const pathname = usePathname() || '';
  // Player pages (home, profile where it is turned on, kèo / club pages) stay usable; the
  // manager prompt shows on the manager pages only.
  const playerPage = ['/home', '/p', '/c/', '/e/', '/t/', '/s/', '/v/', '/l/', '/discover', '/claim', '/invite', '/join', '/verify-email', '/onboarding', '/privacy', '/terms', '/club-request', '/leaderboard', '/mfa-reset'].some((x) => pathname === x || pathname.startsWith(x.endsWith('/') ? x : `${x}/`));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const on = (e) => {
      setNeed((cur) => (cur === 'mfa_required' ? cur : e.detail?.code || 'mfa_required'));
      if (e.detail?.code === 'mfa_enroll_required') setScope(e.detail?.scope || null);
      if (e.detail?.code === 'mfa_required') setResetAt(e.detail?.reset_at || null);
    };
    window.addEventListener('pb:mfa', on);
    return () => window.removeEventListener('pb:mfa', on);
  }, []);
  useEffect(() => {
    if (!user) setNeed(null);
  }, [user]);

  if (!need || !user) return null;

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/host/security/mfa/verify', { code: code.trim() });
      window.location.reload();
    } catch (err) {
      const c = err.payload?.code;
      setError(c === 'mfa_bad_code' ? t('sec.badCode') : c === 'mfa_code_reused' ? t('sec.codeReused') : c === 'rate_limited' ? t('sec.tooMany') : err.message);
      setBusy(false);
    }
  }

  // Managing a club / community: no way around it — turn it on, or go back to the home page.
  if (need === 'mfa_enroll_required' && scope === 'manager') {
    if (playerPage) return null;
    return (
      <Modal open title={`🔐 ${t('sec.enrollTitle')}`} onClose={() => {}}>
        <p className="text-gray-300 text-sm mb-2">{t('sec.enrollManagerBody')}</p>
        <p className="text-gray-500 text-xs mb-4">{t('sec.enrollManagerHint')}</p>
        <div className="flex flex-wrap gap-2 justify-end">
          <a href="/home" className="btn-secondary text-sm">{t('sec.backHome')}</a>
          <Link href="/p/profile#security" className="btn-primary text-sm" onClick={() => setNeed(null)}>{t('sec.goEnable')}</Link>
        </div>
      </Modal>
    );
  }

  if (need === 'mfa_enroll_required') {
    return (
      <Modal open title={`🔐 ${t('sec.enrollTitle')}`} onClose={() => setNeed(null)}>
        <p className="text-gray-300 text-sm mb-4">{t('sec.enrollBody')}</p>
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-secondary text-sm" onClick={() => setNeed(null)}>{t('common.close')}</button>
          <Link href="/p/profile#security" className="btn-primary text-sm" onClick={() => setNeed(null)}>{t('sec.goEnable')}</Link>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open title={`🔐 ${t('sec.verifyTitle')}`} onClose={() => {}}>
      <form onSubmit={verify}>
        <p className="text-gray-300 text-sm mb-3">{t('sec.verifyBody')}</p>
        <label htmlFor="mfa-code" className="text-xs text-gray-400">{t('sec.codeLabel')}</label>
        <input
          id="mfa-code"
          className="input text-center text-xl tracking-[0.3em] tabular-nums"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          maxLength={11}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <p className="text-[11px] text-gray-500 mt-1">{t('sec.recoveryHint')}</p>
        {resetAt ? (
          <p className="text-[11px] text-amber-200 mt-2">⏳ {t('sec.resetWaiting', { at: new Date(resetAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) })}</p>
        ) : (
          <p className="text-[11px] text-gray-500 mt-2">{t('sec.lostAll')}</p>
        )}
        {error && <p className="text-red-300 text-sm mt-2" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2 justify-between mt-4">
          <button type="button" className="btn-secondary text-sm" onClick={() => signOut()}>{t('nav.signOut')}</button>
          <button type="submit" className="btn-primary text-sm" disabled={busy || code.trim().length < 6}>{busy ? t('auth.working') : t('sec.verify')}</button>
        </div>
      </form>
    </Modal>
  );
}
