'use client';
import { useState } from 'react';
import QrScanner from '@/components/QrScanner';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

const TONE = { ok: 'border-lime-400/60 text-lime-300', again: 'border-sky-400/60 text-sky-300', bad: 'border-red-400/60 text-red-300' };

// Scan players' portal QR codes one after another; each result stays in a short log.
// `endpoint`: /api/events/:id/checkin-code (Host) or /api/staff/events/:id/checkin-code.
export default function QrCheckinPanel({ endpoint, onCheckedIn }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);

  async function handle(code) {
    setBusy(true);
    let entry;
    try {
      const r = await api.post(endpoint, { code });
      const pass = r.pass
        ? r.pass.unlimited
          ? t('qr.passUnlimited')
          : t('qr.passLeft', { n: r.pass.sessions_remaining })
        : '';
      entry = r.already
        ? { tone: 'again', text: t('qr.already', { name: r.full_name }) }
        : { tone: 'ok', text: `${t('qr.done', { name: r.full_name })}${pass ? ` · ${pass}` : ''}` };
      if (!r.already) onCheckedIn?.();
    } catch (err) {
      const code2 = err.payload?.code;
      entry = { tone: 'bad', text: code2 && t(`qr.err_${code2}`) !== `qr.err_${code2}` ? `${t(`qr.err_${code2}`)} — ${err.message}` : err.message };
    }
    setLog((l) => [{ ...entry, at: new Date().toLocaleTimeString().slice(0, 5), id: Math.random() }, ...l].slice(0, 8));
    // brief pause so the result can be read before the next person steps up
    setTimeout(() => setBusy(false), 1200);
  }

  return (
    <div>
      <QrScanner onScan={handle} paused={busy} />
      <p className="text-gray-500 text-xs mt-2">{t('qr.scanHint')}</p>
      <ul className="mt-3 space-y-1.5">
        {log.map((l) => (
          <li key={l.id} className={`rounded-lg border px-3 py-2 text-sm ${TONE[l.tone]}`}>
            <span className="text-gray-500 text-xs mr-2 tabular-nums">{l.at}</span>
            {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
