'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/context/I18nContext';
import UiIcon from '@/components/ui/UiIcon';

// Opened from the "reset two-step sign-in" email: the account holder stops a reset they
// did not ask for. No sign-in needed (they may have neither the phone nor the password).
export default function MfaResetCancelPage() {
  const { t } = useI18n();
  const { token } = useParams();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await api.publicPost('/api/public/auth/mfa-reset/cancel', { token });
      setDone(true);
    } catch (err) {
      setError(err.payload?.code === 'reset_link_invalid' ? t('sec.resetLinkInvalid') : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 px-4">
      <div className="card w-full max-w-sm !p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="h-9 w-9 rounded-lg bg-lime-400 text-navy-950 flex items-center justify-center text-xl" aria-hidden="true"><UiIcon name="paddle" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></span>
          <span className="text-lime-400 font-bold text-lg">{t('appName')}</span>
        </div>
        <h1 className="text-white text-xl font-bold mb-2">{t('sec.resetCancelTitle')}</h1>
        {done ? (
          <>
            <div className="bg-lime-400/10 border border-lime-400/40 text-lime-200 text-sm rounded-lg p-3 my-3" role="status">✓ {t('sec.resetCancelled')}</div>
            <p className="text-gray-300 text-sm mb-4">{t('sec.resetCancelledHint')}</p>
            <Link href="/sign-in" className="btn-primary w-full block text-center">{t('sec.resetGoSignIn')}</Link>
          </>
        ) : (
          <>
            <p className="text-gray-300 text-sm mb-4">{t('sec.resetCancelBody')}</p>
            {error && <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm rounded-lg p-3 mb-3" role="alert">{error}</div>}
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={cancel}>{busy ? t('auth.working') : t('sec.resetCancelBtn')}</button>
          </>
        )}
      </div>
    </div>
  );
}
