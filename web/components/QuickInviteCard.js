'use client';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Host: the quick invite link of a kèo (no account, straight to the transfer). The link
// changes every 30 seconds, so show it (QR on screen, or copy and send right away) rather
// than posting it in a group.
export default function QuickInviteCard({ event }) {
  const { t } = useI18n();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [origin, setOrigin] = useState('');

  const load = useCallback(async () => {
    try {
      setInv(await api.get(`/api/events/${event.id}/quick-invite`));
      setError('');
    } catch (err) {
      setError(err.payload?.code === 'migration_required' ? t('quick.migration') : err.message);
    }
  }, [event.id, t]);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // A new link as soon as this one changes.
  useEffect(() => {
    if (!inv?.enabled || !inv.expires_at) return undefined;
    const id = setTimeout(load, Math.max(new Date(inv.expires_at).getTime() - Date.now() + 300, 500));
    return () => clearTimeout(id);
  }, [inv, load]);

  const link = inv?.enabled && origin ? `${origin}${inv.path}` : '';
  useEffect(() => {
    if (!link) return setQr('');
    let alive = true;
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(link, { width: 440, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0B1220', light: '#FFFFFF' } }).then((u) => alive && setQr(u))
    );
    return () => {
      alive = false;
    };
  }, [link]);

  async function setOn(enabled) {
    setBusy(true);
    setError('');
    try {
      setInv(await api.post(`/api/events/${event.id}/quick-invite`, { enabled }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt(t('events.copyLink'), link);
    }
  }

  const left = inv?.expires_at ? Math.max(0, Math.ceil((new Date(inv.expires_at).getTime() - now) / 1000)) : 0;
  const total = inv?.window_seconds || 30;

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-white font-semibold">⚡ {t('quick.title')}</h2>
        {inv && (
          <span className={`text-xs rounded-full px-2 py-0.5 ${inv.enabled ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-700 text-gray-300'}`}>
            {inv.enabled ? t('quick.on') : t('quick.off')}
          </span>
        )}
      </div>
      <p className="text-gray-400 text-xs mb-3">{t('quick.hint')}</p>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {inv && !inv.enabled && (
        <button type="button" className="btn-primary w-full sm:w-auto" disabled={busy} onClick={() => setOn(true)}>
          {t('quick.turnOn')}
        </button>
      )}
      {inv?.enabled && (
        <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
          <div className="bg-white rounded-xl p-2 w-52 h-52 shrink-0 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr ? <img src={qr} alt={t('quick.qrAlt')} className="w-full h-full" /> : <span className="text-gray-400 text-xs">…</span>}
          </div>
          <div className="flex-1 min-w-0 w-full flex flex-col gap-2">
            <div>
              <div className="flex items-baseline justify-between text-xs text-gray-400">
                <span>{t('quick.changesIn')}</span>
                <b className={`tabular-nums text-base ${left <= 5 ? 'text-amber-300' : 'text-lime-300'}`}>{t('quick.seconds', { n: left })}</b>
              </div>
              <div className="h-1.5 rounded-full bg-navy-700 overflow-hidden mt-1" aria-hidden>
                <div className="h-full bg-lime-400 transition-all duration-1000 ease-linear" style={{ width: `${(left / total) * 100}%` }} />
              </div>
            </div>
            <input readOnly value={link.replace(/^https?:\/\//, '')} onFocus={(e) => e.target.select()} className="input text-sm font-mono" aria-label={t('events.copyLink')} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary text-sm flex-1 sm:flex-none" onClick={copy}>
                {copied ? t('events.copied') : t('quick.copy')}
              </button>
              <button type="button" className="btn-secondary text-sm flex-1 sm:flex-none" disabled={busy} onClick={() => window.confirm(t('quick.newConfirm')) && setOn(true)}>
                🔄 {t('quick.newSecret')}
              </button>
              <button type="button" className="btn-secondary text-sm flex-1 sm:flex-none text-red-300" disabled={busy} onClick={() => setOn(false)}>
                {t('quick.turnOff')}
              </button>
            </div>
            <p className="text-gray-500 text-xs">{t('quick.rules')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
