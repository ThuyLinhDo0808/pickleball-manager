'use client';
import { useState } from 'react';
import { fmtTime } from '@/components/OwnerShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const CHECKS = ['call', 'id', 'details'];

// Owner only: reset two-step sign-in for someone who lost both the phone and the
// recovery codes. It waits (24 h) and the account holder is emailed and can stop it.
export default function OwnerMfaReset({ host, onChanged }) {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get(`/api/owner/hosts/${host.id}/mfa`), [host.id]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [checks, setChecks] = useState([]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (error) {
    return (
      <div className="card !p-4">
        <h2 className="text-white font-semibold mb-1">{t('owner.mfaTitle')}</h2>
        <p className="text-gray-400 text-sm">{error.payload?.code === 'migration_required' ? error.message : t('common.error')}</p>
      </div>
    );
  }
  if (!data) return null;

  const how = [...checks.map((c) => t(`owner.mfaCheck_${c}`)), other.trim()].filter(Boolean).join('; ');
  const run = async (fn) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      await reload();
      onChanged?.();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e) => {
    e.preventDefault();
    if (!window.confirm(t('owner.mfaResetAsk', { email: host.email, h: data.delay_hours }))) return;
    run(async () => {
      await api.post(`/api/owner/hosts/${host.id}/mfa-reset`, { reason, verified_how: how });
      setOpen(false);
      setReason('');
      setChecks([]);
      setOther('');
    });
  };
  const stop = () => window.confirm(t('owner.mfaStopAsk')) && run(() => api.del(`/api/owner/hosts/${host.id}/mfa-reset`));

  return (
    <div className={`card !p-4 ${data.reset ? 'border-amber-400/50' : ''}`}>
      <h2 className="text-white font-semibold mb-1">{t('owner.mfaTitle')}</h2>
      <p className="text-gray-300 text-sm">
        {data.enabled ? `✓ ${t('owner.mfaOn', { at: fmtTime(data.enabled_at), n: data.recovery_left })}` : t('owner.mfaOff')}
      </p>
      {data.reset ? (
        <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/5 p-3 text-sm">
          <p className="text-amber-200 font-semibold">{t('owner.mfaPending', { at: fmtTime(data.reset.at) })}</p>
          <p className="text-gray-400 text-xs mt-1">{t('owner.mfaPendingBy', { by: data.reset.by || '—', at: fmtTime(data.reset.requested_at) })}</p>
          {data.reset.reason && <p className="text-gray-300 text-xs mt-1 italic">“{data.reset.reason}”</p>}
          <button type="button" className="btn-secondary text-sm mt-2" disabled={busy} onClick={stop}>{t('owner.mfaStop')}</button>
        </div>
      ) : data.enabled && !host.is_owner && (
        open ? (
          <form className="mt-3 flex flex-col gap-2 text-sm" onSubmit={submit}>
            <p className="text-gray-400 text-xs">{t('owner.mfaResetHint', { h: data.delay_hours })}</p>
            <label className="text-xs text-gray-300" htmlFor="mfa-reason">{t('owner.mfaReason')}</label>
            <input id="mfa-reason" className="input" maxLength={300} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('owner.mfaReasonPh')} />
            <fieldset>
              <legend className="text-xs text-gray-300 mb-1">{t('owner.mfaHow')}</legend>
              {CHECKS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-gray-200 text-sm py-0.5">
                  <input type="checkbox" checked={checks.includes(c)} onChange={(e) => setChecks(e.target.checked ? [...checks, c] : checks.filter((x) => x !== c))} />
                  {t(`owner.mfaCheck_${c}`)}
                </label>
              ))}
              <input className="input mt-1" maxLength={200} value={other} onChange={(e) => setOther(e.target.value)} placeholder={t('owner.mfaHowOther')} />
            </fieldset>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary text-sm" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
              <button type="submit" className="btn-secondary text-sm !border-red-400/60 !text-red-200" disabled={busy || !reason.trim() || !how}>{t('owner.mfaResetBtn')}</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn-secondary text-sm mt-3" onClick={() => setOpen(true)}>{t('owner.mfaReset')}</button>
        )
      )}
      {msg && <p className="text-red-300 text-xs mt-2">{msg}</p>}
    </div>
  );
}
