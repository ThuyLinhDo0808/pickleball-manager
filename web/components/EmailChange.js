'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';

// "Đổi email": new address + current password → a 6-digit code goes to the new address →
// typing it switches the sign-in email (so the new one is confirmed). For a player whose
// address never gets the confirmation mail, or who wants another one.
export default function EmailChange({ className = 'btn-secondary text-sm' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('form'); // form | code
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const errText = (err) => {
    const c = err?.payload?.code;
    return c && t(`emailch.err_${c}`) !== `emailch.err_${c}` ? t(`emailch.err_${c}`) : err.message;
  };
  function close() {
    setOpen(false);
    setStep('form');
    setPassword('');
    setCode('');
    setError('');
    setInfo('');
  }
  async function send(e) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await api.post('/api/host/account/email-change', { email, password });
      setStep('code');
      setInfo(t('emailch.sent', { email: email.trim().toLowerCase() }));
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/api/host/account/email-change/confirm', { code });
      await supabase.auth.refreshSession().catch(() => {});
      close();
      window.alert(t('emailch.done', { email: r.email }));
      window.location.reload();
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{t('emailch.button')}</button>
      <Modal open={open} title={t('emailch.title')} onClose={close}>
        {step === 'form' ? (
          <form onSubmit={send} className="flex flex-col gap-3">
            <p className="text-gray-300 text-sm">{t('emailch.lead')}</p>
            <label className="text-xs text-gray-400 flex flex-col gap-1">
              {t('emailch.newEmail')}
              <input className="input" type="email" required autoComplete="email" inputMode="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="text-xs text-gray-400 flex flex-col gap-1">
              {t('emailch.password')}
              <input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={close}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={busy}>{busy ? '…' : t('emailch.sendCode')}</button>
            </div>
          </form>
        ) : (
          <form onSubmit={confirm} className="flex flex-col gap-3">
            {info && <p className="text-sky-200 text-sm">{info}</p>}
            <label className="text-xs text-gray-400 flex flex-col gap-1">
              {t('emailch.code')}
              <input className="input font-mono tracking-[0.4em] text-lg" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </label>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => { setStep('form'); setError(''); }}>{t('emailch.otherEmail')}</button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={send}>{t('emailch.resend')}</button>
              <button className="btn-primary" disabled={busy || code.length !== 6}>{busy ? '…' : t('emailch.confirm')}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
