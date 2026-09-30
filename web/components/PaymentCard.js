'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { formatVnd } from '@/lib/format';

function CopyRow({ label, value }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value));
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      /* clipboard blocked — the value is still visible to copy by hand */
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-navy-700 last:border-0">
      <div className="min-w-0">
        <div className="text-gray-400 text-xs">{label}</div>
        <div className="text-white font-semibold break-all">{value}</div>
      </div>
      <button type="button" onClick={copy} className="text-lime-400 text-xs shrink-0">
        {done ? t('join.copied') : t('join.copy')}
      </button>
    </div>
  );
}

// Bank transfer details + VietQR, for a membership request or an event fee.
// `payment.total` (memberships) or `payment.amount` (events); `qr_image` = the Host's own bank QR.
export default function PaymentCard({ payment }) {
  const { t } = useI18n();
  const [qrFailed, setQrFailed] = useState(false);
  const [showOwnQr, setShowOwnQr] = useState(false);
  const total = payment.total ?? payment.amount;

  if (payment.status === 'paid') return <p className="text-lime-400 font-semibold text-center py-4">{t('join.paid')}</p>;
  const vietqr = payment.qr_url && !qrFailed;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-gray-300 text-sm">{t('join.payHint')}</p>
      {vietqr && !showOwnQr && (
        <div className="bg-white rounded-xl p-3 mx-auto w-full max-w-[280px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={payment.qr_url} alt="VietQR" className="w-full h-auto" onError={() => setQrFailed(true)} />
        </div>
      )}
      {payment.qr_image && (!vietqr || showOwnQr) && (
        <div className="bg-white rounded-xl p-2 mx-auto w-full max-w-[280px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={payment.qr_image} alt={t('pay.hostQr')} className="w-full h-auto" />
        </div>
      )}
      {vietqr && payment.qr_image && (
        <button type="button" className="text-lime-400 text-xs self-center" onClick={() => setShowOwnQr(!showOwnQr)}>
          {showOwnQr ? t('pay.showVietqr') : t('pay.showHostQr')}
        </button>
      )}
      {payment.bank || payment.qr_image ? (
        <div className="bg-navy-900 rounded-lg px-3">
          {payment.bank && <CopyRow label={t('join.bank')} value={payment.bank.code} />}
          {payment.bank && <CopyRow label={t('join.account')} value={payment.bank.account} />}
          {payment.bank?.holder && <CopyRow label={t('join.holder')} value={payment.bank.holder} />}
          <CopyRow label={t('join.amount')} value={formatVnd(total)} />
          <CopyRow label={t('join.note')} value={payment.ref} />
        </div>
      ) : (
        <>
          <p className="text-yellow-300 text-sm">{t('join.noBank')}</p>
          <div className="bg-navy-900 rounded-lg px-3">
            <CopyRow label={t('join.amount')} value={formatVnd(total)} />
            <CopyRow label={t('join.note')} value={payment.ref} />
          </div>
        </>
      )}
    </div>
  );
}
