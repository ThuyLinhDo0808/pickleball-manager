'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Danger zone: delete this account for good. Shows what goes with it and asks for the
// account email before deleting.
export default function DeleteAccount() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const email = user?.email || '';

  async function start() {
    setOpen(true);
    setTyped('');
    setError('');
    setPreview(null);
    try {
      setPreview(await api.get('/api/host/account/delete-preview'));
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await api.del(`/api/host/account?confirm=${encodeURIComponent(typed.trim())}`);
      try {
        window.localStorage.removeItem('pickleball_club');
        window.localStorage.removeItem('pickleball_workspace');
        window.localStorage.removeItem('pickleball_mode');
        // The page shell sends signed-out people to /sign-in on its own; this tells it why.
        window.sessionStorage.setItem('pickleball_deleted', '1');
      } catch {
        /* ignore */
      }
      await signOut().catch(() => {});
      router.replace('/sign-in');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const matches = typed.trim().toLowerCase() === email.toLowerCase() && !!email;
  return (
    <div className="card mt-4 border-red-500/40">
      <h2 className="text-red-300 font-semibold mb-1">{t('deleteAccount.title')}</h2>
      <p className="text-gray-400 text-sm mb-3">{t('deleteAccount.intro')}</p>
      <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold border border-red-500/60 text-red-300 hover:bg-red-500/10" onClick={start}>
        🗑 {t('deleteAccount.button')}
      </button>

      <Modal open={open} title={t('deleteAccount.title')} onClose={() => !busy && setOpen(false)}>
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-gray-200">{t('deleteAccount.warn')}</p>
          {preview && (
            <ul className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-red-200 list-disc list-inside">
              <li>
                {t('deleteAccount.clubs', { n: preview.clubs.length })}
                {preview.clubs.length > 0 && <span className="text-red-100">: {preview.clubs.map((c) => c.name).join(', ')}</span>}
              </li>
              <li>{t('deleteAccount.xeve', { n: preview.xeve_events })}</li>
              <li>{t('deleteAccount.profile')}</li>
              {preview.linked_memberships > 0 && <li className="text-gray-300">{t('deleteAccount.linked', { n: preview.linked_memberships })}</li>}
            </ul>
          )}
          <label htmlFor="del-acc-email" className="text-gray-300">{t('deleteAccount.type', { email })}</label>
          <input id="del-acc-email" className="input" type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} />
          {error && <p className="text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button type="button" className="rounded-lg px-3 py-2 font-semibold bg-red-500 text-white disabled:opacity-40" disabled={busy || !matches} onClick={confirm}>
              🗑 {t('deleteAccount.confirm')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
