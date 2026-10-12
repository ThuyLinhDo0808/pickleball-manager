'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

// Two-step sign-in prompt. The API answers 403 mfa_required when this sign-in session
// still needs the code from the authenticator app (lib/api.js fires `pb:mfa`); 403
// mfa_enroll_required when the owner console needs two-step sign-in turned on first.
export default function MfaGate() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const [need, setNeed] = useState(null); // 'mfa_required' | 'mfa_enroll_required'
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const on = (e) => setNeed((cur) => (cur === 'mfa_required' ? cur : e.detail?.code || 'mfa_required'));
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
        {error && <p className="text-red-300 text-sm mt-2" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2 justify-between mt-4">
          <button type="button" className="btn-secondary text-sm" onClick={() => signOut()}>{t('nav.signOut')}</button>
          <button type="submit" className="btn-primary text-sm" disabled={busy || code.trim().length < 6}>{busy ? t('auth.working') : t('sec.verify')}</button>
        </div>
      </form>
    </Modal>
  );
}
