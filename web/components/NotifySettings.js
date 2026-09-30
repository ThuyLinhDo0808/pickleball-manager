'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Host: where "moved up from the waitlist" notices go. Players who connected Telegram
// in the portal get a DM automatically; this webhook is for everything else
// (Make / Zapier / n8n -> Zalo ZNS, SMS, a Telegram group, Slack...).
export default function NotifySettings() {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState('');
  const [bot, setBot] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/host/notifications').then((r) => {
      setUrl(r.notify_webhook_url || '');
      setSaved(r.notify_webhook_url || '');
      setBot(r.telegram_bot);
    });
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await api.patch('/api/host/notifications', { notify_webhook_url: url });
      setSaved(r.notify_webhook_url || '');
      setUrl(r.notify_webhook_url || '');
      setMsg(t('notify.saved'));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.post('/api/host/notifications/test', {});
      setMsg(r.webhook === 'sent' ? t('notify.testOk') : t('notify.testFail', { status: r.webhook }));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4">
      <h2 className="text-white font-semibold mb-1">{t('notify.title')}</h2>
      <p className="text-gray-400 text-sm mb-3">{t('notify.hint')}</p>
      <p className="text-sm mb-3">
        <span className="text-gray-400">Telegram: </span>
        {bot ? <span className="text-lime-400">@{bot.replace(/^@/, '')} — {t('notify.tgOn')}</span> : <span className="text-gray-500">{t('notify.tgOff')}</span>}
      </p>
      <form onSubmit={save} className="flex flex-col sm:flex-row gap-2">
        <input className="input text-sm" type="url" inputMode="url" placeholder="https://hook.eu1.make.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="flex gap-2 shrink-0">
          <button className="btn-primary text-sm" disabled={busy || url === saved}>{t('common.save')}</button>
          <button type="button" className="btn-secondary text-sm" disabled={busy || !saved} onClick={test}>{t('notify.test')}</button>
        </div>
      </form>
      {msg && <p className="text-sm text-gray-300 mt-2">{msg}</p>}
      <p className="text-gray-500 text-xs mt-2">{t('notify.webhookHelp')}</p>
    </div>
  );
}
