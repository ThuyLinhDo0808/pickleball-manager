'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/useLoad';
import { useI18n } from '@/context/I18nContext';
import { PROOF_RETENTION_DAYS } from '@/lib/legal';
import { localDate } from '@/lib/dates';

// "My data": download everything the app keeps about this account (JSON), and which
// version of the Terms / Privacy Policy was accepted.
export default function MyData() {
  const { t } = useI18n();
  const { data: consent } = useLoad(() => api.get('/api/host/privacy/consent').catch(() => null), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    try {
      const data = await api.get('/api/host/privacy/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `du-lieu-cua-toi-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm">
      <p className="text-gray-400">{t('legal.myDataHint', { days: PROOF_RETENTION_DAYS })}</p>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={download}>{busy ? t('legal.downloading') : t('legal.download')}</button>
        <a href="/privacy" target="_blank" rel="noopener" className="text-lime-300 underline underline-offset-2">{t('legal.privacyTitle')}</a>
        <a href="/terms" target="_blank" rel="noopener" className="text-lime-300 underline underline-offset-2">{t('legal.termsTitle')}</a>
      </div>
      {consent?.accepted_at && (
        <p className="text-gray-500 text-xs mt-3">
          {t('legal.acceptedOn', { version: consent.accepted_version, date: localDate(new Date(consent.accepted_at), 'vi-VN', { dateStyle: 'short', timeStyle: 'short' }, true) })}
        </p>
      )}
      {error && <p className="text-red-300 text-sm mt-2" role="alert">{error}</p>}
    </div>
  );
}
