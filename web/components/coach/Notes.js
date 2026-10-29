'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { dmy } from '@/lib/coach';

// Coach side: progress notes on one student — write one (optionally a video link, shared
// with the student or kept private), see them newest first, hide / share, delete.
export function NotesPanel({ studentId, sessionId = null }) {
  const { t } = useI18n();
  const { data, reload, error } = useLoad(() => api.get(`/api/coach/students/${studentId}/notes`), [studentId]);
  const [f, setF] = useState({ body: '', video_url: '', shared: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post(`/api/coach/students/${studentId}/notes`, { body: f.body.trim(), video_url: f.video_url.trim() || null, shared: f.shared, session_id: sessionId });
      setF({ body: '', video_url: '', shared: f.shared });
      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function act(fn) {
    setBusy(true);
    try {
      await fn();
      reload();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  if (error?.payload?.code === 'migration_missing') return null;
  return (
    <section>
      <h3 className="text-gray-300 text-sm font-semibold mb-2">{t('cnotes.title')}</h3>
      <form onSubmit={add} className="grid gap-2 mb-2">
        <textarea className="input min-h-[4rem]" required maxLength={2000} placeholder={t('cnotes.bodyPh')} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-auto flex-1 min-w-[10rem] text-sm" type="url" placeholder={t('cnotes.videoPh')} value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} />
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-200 min-h-[44px]">
            <input type="checkbox" checked={f.shared} onChange={(e) => setF({ ...f, shared: e.target.checked })} /> {t('cnotes.shared')}
          </label>
          <button className="btn-primary text-sm ml-auto" disabled={busy || !f.body.trim()}>{t('cnotes.add')}</button>
        </div>
        {msg && <p className="text-red-300 text-sm">{msg}</p>}
      </form>
      {data && !data.length && <p className="text-gray-500 text-sm">{t('cnotes.none')}</p>}
      <ul className="grid gap-2">
        {(data || []).map((n) => (
          <li key={n.id} className="rounded-lg border border-navy-700 px-3 py-2 text-sm">
            <p className="text-gray-100 whitespace-pre-line break-words">{n.body}</p>
            {n.video_url && <a href={n.video_url} target="_blank" rel="noopener noreferrer" className="text-sky-300 text-xs underline break-all">{t('cnotes.video')}</a>}
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
              <span className="tabular-nums">{dmy(n.created_at?.slice(0, 10))}{n.session?.class_title ? ` · ${n.session.class_title}` : ''}</span>
              <span className={n.shared ? 'text-lime-300' : 'text-gray-400'}>{n.shared ? t('cnotes.isShared') : t('cnotes.isPrivate')}</span>
              <button type="button" disabled={busy} className="ml-auto text-gray-300 hover:text-white px-2 min-h-[36px]" onClick={() => act(() => api.patch(`/api/coach/notes/${n.id}`, { shared: !n.shared }))}>{n.shared ? t('cnotes.makePrivate') : t('cnotes.makeShared')}</button>
              <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 px-2 min-h-[36px]" onClick={() => window.confirm(t('cnotes.deleteAsk')) && act(() => api.del(`/api/coach/notes/${n.id}`))}>{t('common.delete')}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Student side: the notes coaches shared with me (newest first) + my 1-1 bookings.
export function MyCoachNotes() {
  const { t, lang } = useI18n();
  const { data: notes } = useLoad(() => api.get('/api/player/coach/notes').catch(() => []), []);
  const { data: bookings, reload } = useLoad(() => api.get('/api/player/coach/bookings').catch(() => []), []);
  const [busy, setBusy] = useState(false);
  const live = (bookings || []).filter((b) => ['requested', 'accepted', 'declined'].includes(b.status));
  if (!(notes || []).length && !live.length) return null;
  async function cancel(b) {
    if (!window.confirm(t('cbook.cancelAsk'))) return;
    setBusy(true);
    try {
      await api.post(`/api/player/coach/bookings/${b.id}/cancel`, {});
      reload();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  const TONE = { requested: 'bg-amber-300/15 text-amber-200', accepted: 'bg-lime-400/15 text-lime-300', declined: 'bg-navy-700 text-gray-300' };
  return (
    <div className="mt-4 grid gap-4">
      {live.length > 0 && (
        <div>
          <h3 className="text-gray-300 text-sm font-semibold mb-2">{t('cbook.mine')}</h3>
          <ul className="grid gap-1.5">
            {live.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-navy-700 px-3 py-2 text-sm">
                <span className="flex-1 min-w-0">
                  <span className="text-white capitalize tabular-nums">{formatDay(b.session_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })} · {hhmm(b.start_time)}</span>
                  <span className="block text-gray-400 text-xs"><Link href={`/coach/${b.coach?.slug}`} className="text-sky-300 hover:underline">{b.coach?.display_name}</Link>{b.decline_note ? ` · ${b.decline_note}` : ''}</span>
                </span>
                <span className={`text-[11px] rounded-full px-2 py-0.5 ${TONE[b.status]}`}>{t(`chours.b_${b.status}`)}</span>
                {b.status !== 'declined' && <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" onClick={() => cancel(b)}>{t('cbook.cancel')}</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(notes || []).length > 0 && (
        <div>
          <h3 className="text-gray-300 text-sm font-semibold mb-2">{t('cnotes.mine')}</h3>
          <ul className="grid gap-1.5">
            {notes.slice(0, 10).map((n) => (
              <li key={n.id} className="rounded-lg border border-navy-700 px-3 py-2 text-sm">
                <p className="text-gray-100 whitespace-pre-line break-words">{n.body}</p>
                {n.video_url && <a href={n.video_url} target="_blank" rel="noopener noreferrer" className="text-sky-300 text-xs underline break-all">{t('cnotes.video')}</a>}
                <p className="text-gray-500 text-xs mt-0.5 tabular-nums">{n.coach?.display_name} · {dmy(n.created_at?.slice(0, 10))}{n.session?.class_title ? ` · ${n.session.class_title}` : ''}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
