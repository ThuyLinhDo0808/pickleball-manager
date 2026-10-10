'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Danger zone: delete this account for good — the account only, never its clubs or Xé Vé
// events. Someone who still runs any first hands them to another account; the app owner
// checks that person is real and approves, then the account can be deleted.
export default function DeleteAccount({ bare = false } = {}) {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const email = user?.email || '';

  async function load() {
    setPreview(await api.get('/api/host/account/delete-preview'));
  }
  async function askHandover(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/host/account/handover', { to: to.trim(), note: note.trim() || null });
      await load();
    } catch (err) {
      const c = err.payload?.code;
      setError(['no_account', 'self', 'pending_exists'].includes(c) ? t(`handover.err_${c}`) : err.message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelHandover() {
    if (!window.confirm(t('handover.cancelAsk'))) return;
    setBusy(true);
    try {
      await api.post('/api/host/account/handover/cancel', {});
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setOpen(true);
    setTyped('');
    setError('');
    setPreview(null);
    setTo('');
    setNote('');
    try {
      await load();
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
      setError(err.payload?.code === 'must_handover' ? t('handover.mustFirst') : err.message);
      setBusy(false);
      load().catch(() => {});
    }
  }

  const h = preview?.handover || null;
  const owns = !!preview?.must_handover;
  const matches = typed.trim().toLowerCase() === email.toLowerCase() && !!email;
  return (
    <div className={bare ? '' : 'card mt-4 border-red-500/40'}>
      {!bare && (
        <>
          <h2 className="text-red-300 font-semibold mb-1">{t('deleteAccount.title')}</h2>
          <p className="text-gray-400 text-sm mb-3">{t('deleteAccount.intro')}</p>
        </>
      )}
      {bare && <p className="text-gray-300 text-sm mb-3">{t('deleteAccount.bareHint')}</p>}
      <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold border border-red-500/60 text-red-300 hover:bg-red-500/10" onClick={start}>
        🗑 {t('deleteAccount.button')}
      </button>

      <Modal open={open} title={t('deleteAccount.title')} onClose={() => !busy && setOpen(false)}>
        <div className="flex flex-col gap-3 text-sm">
          {!preview && !error && <p className="text-gray-400">{t('common.loading')}</p>}
          {preview && owns && (
            <>
              <p className="rounded-lg border border-amber-300/50 bg-amber-300/10 px-3 py-2 text-amber-100">🔒 {t('handover.why')}</p>
              <ul className="rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-gray-200 list-disc list-inside">
                {preview.clubs.length > 0 && <li>{t('handover.clubs', { n: preview.clubs.length })}: <span className="text-white">{preview.clubs.map((c) => c.name).join(', ')}</span></li>}
                {preview.xeve_events > 0 && <li>{t('handover.xeve', { n: preview.xeve_events })}</li>}
              </ul>
              {h?.status === 'pending' ? (
                <div className="rounded-lg border border-sky-400/50 bg-sky-400/10 px-3 py-3 text-sky-100">
                  <p className="font-semibold">⏳ {t('handover.pending', { to: h.to_email })}</p>
                  <p className="text-xs text-sky-200/80 mt-1">{t('handover.pendingHint')}</p>
                  <button type="button" className="mt-2 text-red-300 text-xs underline" disabled={busy} onClick={cancelHandover}>{t('handover.cancel')}</button>
                </div>
              ) : (
                <form onSubmit={askHandover} className="flex flex-col gap-2">
                  {h?.status === 'rejected' && (
                    <p className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-red-200">✕ {t('handover.rejected', { to: h.to_email })}{h.owner_note ? `: ${h.owner_note}` : ''}</p>
                  )}
                  <label className="text-gray-300" htmlFor="handover-to">{t('handover.toLabel')}</label>
                  <input id="handover-to" className="input" required autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} placeholder={t('handover.toPh')} />
                  <label className="text-gray-300" htmlFor="handover-note">{t('handover.noteLabel')}</label>
                  <textarea id="handover-note" className="input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('handover.notePh')} />
                  <p className="text-gray-500 text-xs">{t('handover.steps')}</p>
                  <button className="btn-primary" disabled={busy || !to.trim()}>📨 {t('handover.submit')}</button>
                </form>
              )}
              {error && <p className="text-red-400">{error}</p>}
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t('common.close')}</button>
            </>
          )}
          {preview && !owns && (
            <>
              {h?.status === 'approved' && <p className="rounded-lg border border-lime-400/50 bg-lime-400/10 px-3 py-2 text-lime-100">✓ {t('handover.approved', { to: h.to_email })}</p>}
              <p className="text-gray-200">{t('deleteAccount.warn')}</p>
              <ul className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-red-200 list-disc list-inside">
                <li>{t('deleteAccount.profile')}</li>
                {preview.linked_memberships > 0 && <li className="text-gray-300">{t('deleteAccount.linked', { n: preview.linked_memberships })}</li>}
              </ul>
              <p className="text-gray-400 text-xs">{t('deleteAccount.keepsClubs')}</p>
              <label htmlFor="del-acc-email" className="text-gray-300">{t('deleteAccount.type', { email })}</label>
              <input id="del-acc-email" className="input" type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} />
              {error && <p className="text-red-400">{error}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel')}</button>
                <button type="button" className="rounded-lg px-3 py-2 font-semibold bg-red-500 text-white disabled:opacity-40" disabled={busy || !matches} onClick={confirm}>
                  🗑 {t('deleteAccount.confirm')}
                </button>
              </div>
            </>
          )}
          {!preview && error && <p className="text-red-400">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
