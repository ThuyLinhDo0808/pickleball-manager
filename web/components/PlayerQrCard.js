'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

async function toDataUrl(text, width) {
  const QRCode = (await import('qrcode')).default;
  // Dark modules on white: scanners need the contrast, whatever the app theme.
  return QRCode.toDataURL(text, { width, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0B1220', light: '#FFFFFF' } });
}

// The player's personal check-in QR (from /api/player/me). The Host / coordinator
// scans it at the court; "New code" invalidates the old one if it was shared.
export default function PlayerQrCard({ code, onRotated }) {
  const { t } = useI18n();
  const [small, setSmall] = useState('');
  const [big, setBig] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!code) return;
    toDataUrl(code, 176).then(setSmall);
    toDataUrl(code, 560).then(setBig);
  }, [code]);

  async function rotate() {
    if (!window.confirm(t('qr.rotateAsk'))) return;
    try {
      const r = await api.post('/api/player/checkin-code/rotate', {});
      onRotated?.(r.checkin_code);
    } catch (err) {
      window.alert(err.message);
    }
  }

  if (!code) return null;
  return (
    <section className="card mb-4 flex items-center gap-4">
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg bg-white p-1" aria-label={t('qr.enlarge')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {small ? <img src={small} alt={t('qr.myCode')} width={120} height={120} /> : <div className="h-[120px] w-[120px]" />}
      </button>
      <div className="min-w-0">
        <h2 className="text-white font-semibold">{t('qr.myCode')}</h2>
        <p className="text-gray-400 text-xs mt-1">{t('qr.myCodeHint')}</p>
        <div className="flex gap-3 mt-2 text-sm">
          <button type="button" className="text-lime-400" onClick={() => setOpen(true)}>{t('qr.enlarge')}</button>
          <button type="button" className="text-gray-400" onClick={rotate}>{t('qr.rotate')}</button>
        </div>
      </div>
      <Modal open={open} title={t('qr.myCode')} onClose={() => setOpen(false)}>
        <div className="rounded-xl bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {big && <img src={big} alt={t('qr.myCode')} className="w-full h-auto" />}
        </div>
        <p className="text-gray-400 text-xs mt-3 text-center">{t('qr.myCodeHint')}</p>
      </Modal>
    </section>
  );
}
