'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Host: where "moved up from the waitlist" notices go. Players get an email when the
// Host turns it on; this webhook is for everything else (Make / Zapier / n8n -> Zalo
// ZNS, SMS, a group chat, Slack...).
export default function NotifySettings({ bare = false } = {}) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // Emails to players: the Host's switch (off by default) + whether the server can send.
  const [mail, setMail] = useState(null);

  useEffect(() => {
    api.get('/api/host/notifications').then((r) => {
      setUrl(r.notify_webhook_url || '');
      setSaved(r.notify_webhook_url || '');
      setMail({ on: !!r.notify_players_email, ready: !!r.email_ready, migrated: r.email_migrated !== false });
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

  async function toggleMail() {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.patch('/api/host/notifications', { notify_players_email: !mail.on });
      setMail({ ...mail, on: !!r.notify_players_email });
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
    <div className={bare ? '' : 'card mb-4'}>
      {!bare && (
        <>
          <h2 className="text-white font-semibold mb-1">{t('notify.title')}</h2>
          <p className="text-gray-400 text-sm mb-3">{t('notify.hint')}</p>
        </>
      )}
      {mail && (
        <div className="mb-3 rounded-lg bg-navy-900 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-white">✉️ {t('notify.emailTitle')}</p>
              <p className="text-xs text-gray-400">{t('notify.emailHint')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={mail.on}
              aria-label={t('notify.emailTitle')}
              disabled={busy || !mail.migrated}
              onClick={toggleMail}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${mail.on ? 'bg-lime-500' : 'bg-navy-700'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${mail.on ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
          {!mail.ready && <p className="text-xs text-amber-300 mt-2">⚠️ {t('notify.emailNotReady')}</p>}
        </div>
      )}
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
