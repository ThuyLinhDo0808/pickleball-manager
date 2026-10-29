'use client';
import { useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import DateInput from '@/components/ui/DateInput';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { endTime } from '@/lib/coach';

const STATUS_TONE = { scheduled: 'text-gray-400', done: 'text-lime-300', cancelled: 'text-red-300 line-through' };

// One session in a list (class page, schedule): date · time · court · status, with
// move / cancel at hand. `withClass` adds the class title (the schedule shows many classes).
export function SessionRow({ s, lang, onChanged, past = false, withClass = false }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ session_date: s.session_date, start_time: hhmm(s.start_time), duration_min: s.duration_min, court_name: s.court_name || '', note: s.note || '' });
  const [busy, setBusy] = useState(false);
  const patch = async (body) => {
    setBusy(true);
    try {
      await api.patch(`/api/coach/sessions/${s.id}`, body);
      onChanged?.();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };
  const cancelled = s.status === 'cancelled';
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0 text-sm ${cancelled ? 'opacity-60' : ''}`}>
      <Link href={`/coach/sessions/${s.id}`} className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 hover:text-white">
        <span className={`capitalize tabular-nums whitespace-nowrap ${cancelled ? 'line-through text-gray-400' : 'text-white font-medium'}`}>{formatDay(s.session_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
        <span className="text-gray-300 tabular-nums whitespace-nowrap">{hhmm(s.start_time)}–{endTime(s.start_time, s.duration_min)}</span>
        {withClass && s.class_title && <span className="text-gray-200 min-w-0 truncate">{s.class_title}</span>}
        {s.court_name && <span className="text-gray-500 min-w-0 truncate">{s.court_name}</span>}
        {s.note && <span className="text-gray-500 text-xs min-w-0 truncate">{s.note}</span>}
        <span className={`text-xs ${STATUS_TONE[s.status]}`}>{t(`coach.sstatus_${s.status}`)}</span>
      </Link>
      {!past && (
        <span className="shrink-0 inline-flex gap-1">
          <button type="button" className="text-gray-300 hover:text-white px-2 min-h-[44px] text-xs" onClick={() => setEditing(true)}>{t('coach.sMove')}</button>
          {cancelled ? (
            <button type="button" disabled={busy} className="text-lime-300 hover:text-lime-200 px-2 min-h-[44px] text-xs" onClick={() => patch({ status: 'scheduled' })}>{t('coach.sRestore')}</button>
          ) : (
            <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 px-2 min-h-[44px] text-xs" onClick={() => window.confirm(t('coach.sCancelAsk')) && patch({ status: 'cancelled' })}>{t('coach.sCancel')}</button>
          )}
        </span>
      )}
      <Modal open={editing} title={t('coach.sMoveTitle')} onClose={() => setEditing(false)}>
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              patch({ session_date: f.session_date, start_time: f.start_time, duration_min: Number(f.duration_min), court_name: f.court_name.trim() || null, note: f.note.trim() || null }).then(() => setEditing(false));
            }}
            className="grid gap-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400">{t('fin.date')}</label>
                <DateInput value={f.session_date} onChange={(v) => setF({ ...f, session_date: v })} required />
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('coach.c_start_time')}</label>
                <input className="input" type="time" required value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('coach.c_duration_min')}</label>
                <input className="input" type="number" min="15" max="480" step="15" required value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('coach.c_court_name')}</label>
                <input className="input" maxLength={160} value={f.court_name} onChange={(e) => setF({ ...f, court_name: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('fin.note')}</label>
              <input className="input" maxLength={1000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t('coach.sNotePh')} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={busy}>{t('common.save')}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
