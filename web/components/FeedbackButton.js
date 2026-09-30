'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

// "Góp ý" — sends feedback to the developer (stored, and emailed when configured).
export default function FeedbackButton({ className = '', children }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setOpen(false);
    setSent(false);
    setError('');
  }

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/host/feedback', { message, contact: user?.email, page: pathname });
      setMessage('');
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} title={t('feedback.button')}>
        {children || t('feedback.button')}
      </button>
      <Modal open={open} title={t('feedback.title')} onClose={close}>
        {sent ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-3">💚</div>
            <p className="text-white text-lg font-semibold">{t('feedback.thanksTitle')}</p>
            <p className="text-gray-300 text-sm mt-1">{t('feedback.thanks')}</p>
            <button className="btn-primary mt-5 w-full sm:w-auto sm:px-10" onClick={close}>{t('feedback.close')}</button>
          </div>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-3">
            <p className="text-gray-400 text-sm">{t('feedback.hint')}</p>
            <div>
              <label className="text-xs text-gray-400">{t('feedback.message')}</label>
              <textarea className="input" rows={5} required maxLength={4000} autoFocus value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button className="btn-primary" disabled={busy || !message.trim()}>{t('feedback.send')}</button>
          </form>
        )}
      </Modal>
    </>
  );
}
