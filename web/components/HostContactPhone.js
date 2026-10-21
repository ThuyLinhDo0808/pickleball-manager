'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Host: the phone players see on quick booking pages — to join without leaving their own
// phone, or to pass a ticket on. Empty = not shown (players must then leave a phone).
export default function HostContactPhone({ bare = false, onSaved = null } = {}) {
  const { t } = useI18n();
  const [v, setV] = useState(null);
  const [saved, setSaved] = useState('');
  const [ready, setReady] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get('/api/host/contact').then((r) => {
      setReady(r.ready !== false);
      setV(r.contact_phone || '');
      setSaved(r.contact_phone || '');
    }).catch(() => setV(''));
  }, []);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await api.patch('/api/host/contact', { contact_phone: v });
      setV(r.contact_phone || '');
      setSaved(r.contact_phone || '');
      setMsg(t('notify.saved'));
      onSaved?.(r.contact_phone || null);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (v == null) return null;
  return (
    <form onSubmit={save} className={bare ? '' : 'rounded-xl border border-navy-600 p-3 mt-4'}>
      {!bare && <h3 className="text-white font-semibold">☎️ {t('hostContact.title')}</h3>}
      <p className="text-gray-400 text-sm mt-0.5">{t('hostContact.hint')}</p>
      {!saved && <p className="text-amber-200 text-xs mt-1">⚠️ {t('hostContact.missing')}</p>}
      <div className="flex flex-wrap items-end gap-2 mt-2">
        <div className="min-w-0 flex-1">
          <label className="text-xs text-gray-400" htmlFor="host-contact-phone">{t('hostContact.label')}</label>
          <input id="host-contact-phone" className="input" type="tel" inputMode="tel" maxLength={20} disabled={!ready} value={v} onChange={(e) => setV(e.target.value)} placeholder="09xx xxx xxx" />
        </div>
        <button className="btn-primary max-sm:w-full" disabled={busy || !ready || v === saved}>{t('common.save')}</button>
      </div>
      {!ready && <p className="text-amber-200 text-xs mt-1">{t('hostContact.migration')}</p>}
      {msg && <p className="text-gray-300 text-xs mt-1">{msg}</p>}
    </form>
  );
}
