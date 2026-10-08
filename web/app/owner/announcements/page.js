'use client';
import { useState } from 'react';
import OwnerShell, { fmtTime } from '@/components/OwnerShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// <input type="datetime-local"> works in local time; the API stores ISO (UTC).
const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v) => (v ? new Date(v).toISOString() : null);

const stateOf = (a) => {
  const now = Date.now();
  if (!a.active) return 'off';
  if (Date.parse(a.starts_at) > now) return 'scheduled';
  if (a.ends_at && Date.parse(a.ends_at) <= now) return 'ended';
  return 'live';
};
const STATE_BADGE = { live: 'bg-lime-400/20 text-lime-200', scheduled: 'bg-sky-400/20 text-sky-200', ended: 'bg-navy-700 text-gray-400', off: 'bg-navy-700 text-gray-400' };

function Form({ initial, onDone, onCancel }) {
  const { t } = useI18n();
  const [f, setF] = useState({
    message: initial?.message || '',
    level: initial?.level || 'info',
    starts_at: toLocal(initial?.starts_at),
    ends_at: toLocal(initial?.ends_at),
    show_public: !!initial?.show_public,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const body = { ...f, starts_at: fromLocal(f.starts_at), ends_at: fromLocal(f.ends_at) };
    try {
      if (initial) await api.patch(`/api/owner/announcements/${initial.id}`, body);
      else await api.post('/api/owner/announcements', body);
      onDone();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="card !p-4 flex flex-col gap-3">
      <label className="text-sm text-gray-300">
        {t('owner.annMessage')}
        <textarea className="input mt-1 min-h-[80px]" maxLength={500} required value={f.message} onChange={set('message')} />
        <span className="text-gray-500 text-xs">{f.message.length}/500</span>
      </label>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm text-gray-300">
          {t('owner.annLevel')}
          <select className="input mt-1" value={f.level} onChange={set('level')}>
            <option value="info">📣 {t('owner.annInfo')}</option>
            <option value="warning">⚠️ {t('owner.annWarning')}</option>
          </select>
        </label>
        <label className="text-sm text-gray-300">
          {t('owner.annStart')}
          <input type="datetime-local" className="input mt-1" value={f.starts_at} onChange={set('starts_at')} />
        </label>
        <label className="text-sm text-gray-300">
          {t('owner.annEnd')}
          <input type="datetime-local" className="input mt-1" value={f.ends_at} onChange={set('ends_at')} />
        </label>
      </div>
      <p className="text-gray-500 text-xs -mt-2">{t('owner.annTimeHint')}</p>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={f.show_public} onChange={set('show_public')} />
        {t('owner.annPublic')}
      </label>
      {err && <p className="text-red-300 text-sm">{err}</p>}
      <div className="flex gap-2 justify-end">
        {onCancel && <button type="button" className="btn-secondary text-sm" onClick={onCancel}>{t('common.cancel')}</button>}
        <button type="submit" className="btn-primary text-sm" disabled={busy}>{initial ? t('common.save') : t('owner.annCreate')}</button>
      </div>
    </form>
  );
}

// A banner for everyone using the app (and, if ticked, on public pages too).
export default function OwnerAnnouncementsPage() {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get('/api/owner/announcements'), []);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const toggle = async (a) => {
    await api.patch(`/api/owner/announcements/${a.id}`, { active: !a.active }).catch(() => {});
    reload();
  };
  return (
    <OwnerShell title={t('owner.tabAnnouncements')}>
      <p className="text-gray-400 text-sm mb-3">{t('owner.annHint')}</p>
      {adding ? (
        <Form onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn-primary text-sm mb-1" onClick={() => setAdding(true)}>＋ {t('owner.annCreate')}</button>
      )}
      {error && <p className="card text-red-300 text-sm mt-3">{error.message}</p>}
      {data && data.length === 0 && <p className="card text-gray-500 text-sm mt-3">{t('owner.noAnn')}</p>}
      {data && data.length > 0 && (
        <ul className="flex flex-col gap-2 mt-4">
          {data.map((a) => (editing === a.id ? (
            <li key={a.id}><Form initial={a} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} /></li>
          ) : (
            <li key={a.id} className="card !p-3">
              <div className="flex flex-wrap items-center gap-2 mb-1 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${STATE_BADGE[stateOf(a)]}`}>{t(`owner.ann_${stateOf(a)}`)}</span>
                <span className="text-gray-400">{a.level === 'warning' ? '⚠️' : '📣'} {fmtTime(a.starts_at)} → {a.ends_at ? fmtTime(a.ends_at) : t('owner.annNoEnd')}</span>
                {a.show_public && <span className="text-sky-200">🌐 {t('owner.annPublicShort')}</span>}
              </div>
              <p className="text-gray-100 text-sm whitespace-pre-line break-words">{a.message}</p>
              <div className="flex gap-2 mt-2">
                <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setEditing(a.id)}>✎ {t('common.edit')}</button>
                <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => toggle(a)}>{a.active ? `⏸ ${t('owner.annTurnOff')}` : `▶ ${t('owner.annTurnOn')}`}</button>
              </div>
            </li>
          )))}
        </ul>
      )}
    </OwnerShell>
  );
}
