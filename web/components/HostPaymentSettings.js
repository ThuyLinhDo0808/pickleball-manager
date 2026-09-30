'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { resizeImage } from '@/lib/image';

// Host: where guests transfer event fees — bank details (for the auto VietQR) and/or
// the Host's own bank QR image. Club sessions use the club's account first when it has one.
export default function HostPaymentSettings() {
  const { t } = useI18n();
  const file = useRef(null);
  const [f, setF] = useState(null);
  const [saved, setSaved] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/host/payment-settings').then((r) => {
      const v = { bank_code: r.bank_code || '', bank_account: r.bank_account || '', bank_holder: r.bank_holder || '', payment_qr_image: r.payment_qr_image || null };
      setF(v);
      setSaved(v);
    });
  }, []);

  async function pick(e) {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    try {
      setF({ ...f, payment_qr_image: await resizeImage(picked, 700) });
    } catch {
      setMsg(t('signup.badImage'));
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await api.patch('/api/host/payment-settings', f);
      const v = { bank_code: r.bank_code || '', bank_account: r.bank_account || '', bank_holder: r.bank_holder || '', payment_qr_image: r.payment_qr_image || null };
      setF(v);
      setSaved(v);
      setMsg(t('notify.saved'));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!f) return null;
  const dirty = JSON.stringify(f) !== JSON.stringify(saved);
  return (
    <form onSubmit={save} className="card mb-4 flex flex-col gap-3">
      <div>
        <h2 className="text-white font-semibold">{t('paySet.title')}</h2>
        <p className="text-gray-400 text-sm">{t('paySet.hint')}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-400">{t('payments.bankCode')}</label>
          <input className="input uppercase" value={f.bank_code} onChange={(e) => setF({ ...f, bank_code: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('payments.bankAccount')}</label>
          <input className="input" inputMode="numeric" value={f.bank_account} onChange={(e) => setF({ ...f, bank_account: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('payments.bankHolder')}</label>
          <input className="input uppercase" value={f.bank_holder} onChange={(e) => setF({ ...f, bank_holder: e.target.value })} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {f.payment_qr_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.payment_qr_image} alt="" className="h-24 w-24 rounded-lg bg-white object-contain p-1" />
        ) : (
          <div className="h-24 w-24 rounded-lg border border-dashed border-navy-600 flex items-center justify-center text-gray-500 text-xs text-center px-1">QR</div>
        )}
        <div className="flex flex-col gap-1 text-sm">
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={pick} />
          <button type="button" className="text-lime-400 text-left" onClick={() => file.current?.click()}>{t('paySet.uploadQr')}</button>
          {f.payment_qr_image && <button type="button" className="text-gray-400 text-left" onClick={() => setF({ ...f, payment_qr_image: null })}>{t('paySet.removeQr')}</button>}
          <span className="text-gray-500 text-xs">{t('paySet.qrHint')}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !dirty}>{t('common.save')}</button>
        {msg && <span className="text-sm text-gray-300">{msg}</span>}
      </div>
    </form>
  );
}
