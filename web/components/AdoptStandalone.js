'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');

// Old one-off kèo (made before communities, no club) -> into this community. Shown on the
// community overview to its owner while any are left.
export default function AdoptStandalone({ club, onMoved }) {
  const { t } = useI18n();
  const owner = !club?.role || club.role === 'owner';
  const { data, reload } = useLoad(() => (club && owner ? api.get(`/api/clubs/${club.id}/standalone-events`).catch(() => null) : Promise.resolve(null)), [club?.id, owner]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(null); // Set of ids; null = all
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!data?.count) return msg ? <p className="card text-lime-300 text-sm mb-4">✓ {msg}</p> : null;
  const events = data.events;
  const sel = picked || new Set(events.map((e) => e.id));
  const toggle = (id) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  async function move() {
    setBusy(true);
    try {
      const all = sel.size === events.length;
      const r = await api.post(`/api/clubs/${club.id}/standalone-events/adopt`, all ? {} : { event_ids: [...sel] });
      setMsg(t('adopt.done', { n: r.moved, name: club.name }));
      setOpen(false);
      setPicked(null);
      reload();
      onMoved?.();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="card mb-4 border-amber-300/50 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-semibold">{t('adopt.title', { n: data.count })}</p>
          <p className="text-gray-400 text-sm">{t('adopt.hint', { name: club.name })}</p>
        </div>
        <button type="button" className="btn-primary text-sm" onClick={() => { setMsg(''); setOpen(true); }}>{t('adopt.open')}</button>
      </div>
      <Modal open={open} title={`${t('adopt.modalTitle', { name: club.name })}`} onClose={() => !busy && setOpen(false)}>
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-gray-300">{t('adopt.explain')}</p>
          <div className="flex gap-3 text-xs">
            <button type="button" className="text-lime-400 hover:underline" onClick={() => setPicked(new Set(events.map((e) => e.id)))}>{t('adopt.all')}</button>
            <button type="button" className="text-gray-400 hover:underline" onClick={() => setPicked(new Set())}>{t('adopt.none')}</button>
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-navy-700 rounded-lg border border-navy-700">
            {events.map((e) => (
              <li key={e.id}>
                <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-navy-800">
                  <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} />
                  <span className="text-gray-400 tabular-nums w-20 shrink-0">{dmy(e.event_date)}</span>
                  <span className="text-white break-words">{e.title}</span>
                </label>
              </li>
            ))}
          </ul>
          {data.kept > 0 && <p className="text-gray-500 text-xs">{t('adopt.kept', { n: data.kept })}</p>}
          {msg && <p className="text-red-300">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>{t('common.cancel')}</button>
            <button type="button" className="btn-primary" disabled={busy || sel.size === 0} onClick={move}>{t('adopt.move', { n: sel.size })}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
