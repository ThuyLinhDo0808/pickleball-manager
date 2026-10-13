'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Modal from '@/components/Modal';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { LEGAL_VERSION } from '@/lib/legal';

// Accounts that have not accepted the current Terms / Privacy Policy (older accounts, or
// after a new version) are asked once, after sign-in. Checked once per browser session.
const OPEN = ['/privacy', '/terms', '/sign-in', '/welcome', '/reset-password', '/onboarding'];
const KEY = 'pb_consent';

export default function ConsentGate() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const pathname = usePathname() || '';
  const [need, setNeed] = useState(null); // null | { updated }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || OPEN.some((p) => pathname.startsWith(p))) return;
    try {
      if (sessionStorage.getItem(KEY) === `${user.id}:${LEGAL_VERSION}`) return;
    } catch {
      /* ignore */
    }
    let alive = true;
    api
      .get('/api/host/privacy/consent')
      .then((c) => {
        if (!alive) return;
        if (c?.needs && c.ready !== false) setNeed({ updated: !!c.accepted_version });
        else sessionStorage.setItem(KEY, `${user.id}:${LEGAL_VERSION}`);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, pathname]);

  if (!need || !user) return null;

  async function accept() {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/host/privacy/consent', { accept: true });
      try {
        sessionStorage.setItem(KEY, `${user.id}:${LEGAL_VERSION}`);
      } catch {
        /* ignore */
      }
      setNeed(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={`📄 ${t('legal.consentTitle')}`} onClose={() => {}}>
      {need.updated && <p className="text-amber-200 text-sm mb-2">{t('legal.consentUpdated')}</p>}
      <p className="text-gray-300 text-sm">{t('legal.consentBody', { version: LEGAL_VERSION })}</p>
      <div className="flex flex-wrap gap-3 text-sm mt-3">
        <a href="/terms" target="_blank" rel="noopener" className="text-lime-300 underline underline-offset-2">{t('legal.termsTitle')}</a>
        <a href="/privacy" target="_blank" rel="noopener" className="text-lime-300 underline underline-offset-2">{t('legal.privacyTitle')}</a>
      </div>
      {error && <p className="text-red-300 text-sm mt-2" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2 justify-between mt-5">
        <button type="button" className="btn-secondary text-sm" onClick={() => signOut()}>{t('nav.signOut')}</button>
        <button type="button" className="btn-primary text-sm" disabled={busy} onClick={accept}>{busy ? t('auth.working') : t('legal.accept')}</button>
      </div>
    </Modal>
  );
}
