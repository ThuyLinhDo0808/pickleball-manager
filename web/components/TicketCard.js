'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';

// The check-in ticket of one registration: a big QR ("PBT:<ticket_code>") plus a loud
// reminder to screenshot it, and a link to the ticket page as a backup.
export default function TicketCard({ ticketCode, name, subtitle, checkedIn = false }) {
  const { t } = useI18n();
  const [qr, setQr] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ticketCode) return;
    setLink(`${window.location.origin}/t/${ticketCode}`);
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(`PBT:${ticketCode}`, { width: 560, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0B1220', light: '#FFFFFF' } }).then(setQr)
    );
  }, [ticketCode]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt(t('ticket.link'), link);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Once checked in, the QR has done its job: no need to shout about screenshots. */}
      {!checkedIn && (
        <div className="w-full rounded-xl border-2 border-yellow-400 bg-yellow-400/10 px-3 py-2.5 text-center">
          <p className="text-yellow-300 font-extrabold text-base uppercase tracking-wide">📸 {t('ticket.screenshot')}</p>
          <p className="text-yellow-100 text-sm font-semibold mt-0.5">{t('ticket.screenshotHint')}</p>
        </div>
      )}
      <div className="rounded-xl bg-white p-2 w-full max-w-[280px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr ? <img src={qr} alt={t('ticket.qrAlt')} className="w-full h-auto" /> : <div className="aspect-square" />}
      </div>
      {name && <p className="text-white font-bold text-lg">{name}</p>}
      {subtitle && <p className="text-gray-400 text-sm -mt-2 text-center">{subtitle}</p>}
      <p className="text-gray-500 text-xs font-mono">{ticketCode.slice(0, 8).toUpperCase()}</p>
      <div className="flex flex-wrap justify-center gap-2 text-sm">
        <a href={link} className="btn-secondary !py-1.5">{t('ticket.open')}</a>
        <button type="button" className="btn-secondary !py-1.5" onClick={copy}>{copied ? t('events.copied') : t('ticket.copyLink')}</button>
      </div>
      <p className="text-gray-500 text-xs text-center">{t('ticket.backupHint')}</p>
    </div>
  );
}
