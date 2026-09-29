'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { api } from '@/lib/api';

function qrPreview(f) {
  if (!f.bank_code || !f.bank_account) return null;
  const q = new URLSearchParams({ amount: '0', addInfo: 'PBDEMO01' });
  if (f.bank_holder) q.set('accountName', f.bank_holder);
  return `https://img.vietqr.io/image/${encodeURIComponent(f.bank_code.toUpperCase())}-${encodeURIComponent(f.bank_account)}-compact2.png?${q}`;
}

// Host settings for player self-service: join link on/off, message, bank account for VietQR.
export default function ClubPaymentSettings({ club, onDone }) {
  const { t } = useI18n();
  const { updateClub, reload } = useClubs();
  const [form, setForm] = useState({});
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    setForm({
      allow_join: !!club.allow_join,
      join_note: club.join_note || '',
      bank_code: club.bank_code || '',
      bank_account: club.bank_account || '',
      bank_holder: club.bank_holder || '',
    });
  }, [club.id]);

  const link = `${origin}/join/${club.join_token}`;
  const preview = qrPreview(form);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateClub(club.id, form);
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    if (!window.confirm(t('payments.rotateConfirm'))) return;
    await api.post(`/api/clubs/${club.id}/join-token/rotate`, {});
    reload();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt(t('payments.joinLink'), link);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm text-gray-200">
        <input type="checkbox" checked={!!form.allow_join} onChange={(e) => setForm({ ...form, allow_join: e.target.checked })} />
        {t('payments.allowJoin')}
      </label>

      {form.allow_join && club.allow_join && (
        <div>
          <label className="text-xs text-gray-400">{t('payments.joinLink')}</label>
          <div className="flex gap-2">
            <input readOnly className="input text-sm" value={link} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-primary text-sm shrink-0" onClick={copy}>{copied ? t('events.copied') : t('events.copyLink')}</button>
          </div>
          <button type="button" className="text-gray-400 text-xs underline mt-1" onClick={rotate}>{t('payments.rotate')}</button>
        </div>
      )}

      <div>
        <label className="text-xs text-gray-400">{t('payments.joinNote')}</label>
        <textarea className="input" rows={2} value={form.join_note || ''} onChange={set('join_note')} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400">{t('payments.bankCode')}</label>
          <input className="input uppercase" value={form.bank_code || ''} onChange={set('bank_code')} placeholder="VCB" />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('payments.bankAccount')}</label>
          <input className="input" inputMode="numeric" value={form.bank_account || ''} onChange={set('bank_account')} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-gray-400">{t('payments.bankHolder')}</label>
          <input className="input uppercase" value={form.bank_holder || ''} onChange={set('bank_holder')} placeholder="NGUYEN VAN A" />
        </div>
      </div>
      {preview && (
        <div>
          <div className="text-xs text-gray-400 mb-1">{t('payments.qrPreview')}</div>
          <div className="bg-white rounded-lg p-2 w-40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="VietQR" className="w-full h-auto" />
          </div>
        </div>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onDone}>{t('common.cancel')}</button>
        <button className="btn-primary flex-1" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  );
}
