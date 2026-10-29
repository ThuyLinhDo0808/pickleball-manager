'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import EmptyState from '@/components/ui/EmptyState';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { formatDay, hhmm } from '@/lib/dates';
import { WEEKDAYS, endTime } from '@/lib/coach';
import { CoachGate } from '@/components/coach/CoachGate';
import { StudentLine } from '@/components/coach/StudentRow';

const EMPTY = { weekday: 0, start_time: '07:00', end_time: '10:00', lesson_min: 60, price: 0, court_name: '' };
const B_TONE = { requested: 'bg-amber-300/15 text-amber-200', accepted: 'bg-lime-400/15 text-lime-300', declined: 'bg-navy-700 text-gray-300', cancelled: 'bg-navy-700 text-gray-300' };

// Lịch rảnh: weekly open hours for 1-1 lessons (students book a free time on the public
// page), the requests waiting for the coach (Nhận makes a "Kèm 1-1" session), and the
// upcoming booked lessons.
export default function CoachHoursPage() {
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useLoad(() => api.get('/api/coach/slots'), []);
  const { data: bookings, reload: reloadB } = useLoad(() => api.get('/api/coach/bookings').catch(() => []), []);
  const [edit, setEdit] = useState(null); // slot being added / edited
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const slots = data?.slots || [];
  const pending = (bookings || []).filter((b) => b.status === 'requested');
  const upcoming = (bookings || []).filter((b) => b.status === 'accepted');
  const refresh = () => { reload(); reloadB(); };

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const body = { ...edit, weekday: Number(edit.weekday), lesson_min: Number(edit.lesson_min), price: Number(edit.price), court_name: edit.court_name.trim() || null };
      if (edit.id) await api.patch(`/api/coach/slots/${edit.id}`, body);
      else await api.post('/api/coach/slots', body);
      setEdit(null);
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
      refresh();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  const decline = (b) => {
    const note = window.prompt(t('chours.declineAsk'), '');
    if (note == null) return;
    act(() => api.post(`/api/coach/bookings/${b.id}/decline`, { note }));
  };
  const when = (b) => `${formatDay(b.session_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${hhmm(b.start_time)}–${endTime(hhmm(b.start_time), b.duration_min)}`;

  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader icon="clock" title={t('chours.title')} subtitle={t('chours.lead')} hint={<Hint inline text={t('chours.hint')} />} actions={<button type="button" className="btn-primary" onClick={() => setEdit({ ...EMPTY })}>+ {t('chours.add')}</button>} />
        {loading && !data && <LoadingBlock rows={3} className="card" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {data && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
            <div className="grid gap-4">
              <section className="card !p-0 overflow-hidden">
                <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('chours.requests')} <span className="text-gray-500 font-normal text-sm">({pending.length})</span></h2>
                {!pending.length && <p className="text-gray-500 text-sm px-4 py-3">{t('chours.noRequests')}</p>}
                {pending.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
                    <div className="flex-1 min-w-[12rem]">
                      <StudentLine s={b.student || { full_name: '—' }} sub={[when(b), b.note, t(`coach.pay_${b.pay_mode}`)].filter(Boolean).join(' · ')} />
                    </div>
                    <span className="inline-flex gap-1">
                      <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" onClick={() => decline(b)}>{t('chours.decline')}</button>
                      <button type="button" disabled={busy} className="btn-primary text-xs !min-h-[44px]" onClick={() => act(() => api.post(`/api/coach/bookings/${b.id}/accept`, {}))}>{t('chours.accept')}</button>
                    </span>
                  </div>
                ))}
              </section>
              <section className="card !p-0 overflow-hidden">
                <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('chours.slots')}</h2>
                {!slots.length && (
                  <div className="p-4"><EmptyState title={t('chours.empty')} action={<button type="button" className="btn-primary" onClick={() => setEdit({ ...EMPTY })}>+ {t('chours.add')}</button>}>{t('chours.emptyHint')}</EmptyState></div>
                )}
                {slots.map((s) => (
                  <div key={s.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0 text-sm ${s.active ? '' : 'opacity-60'}`}>
                    <span className="flex-1 min-w-[12rem]">
                      <span className="text-white font-medium">{t(`insights.dow_${s.weekday}`)} · <span className="tabular-nums">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span></span>
                      <span className="block text-gray-400 text-xs tabular-nums">{t('chours.lessonLine', { m: s.lesson_min })} · {s.price ? formatVnd(s.price) : t('chours.packageOnly')}{s.court_name ? ` · ${s.court_name}` : ''}{s.active ? '' : ` · ${t('chours.off')}`}</span>
                    </span>
                    <span className="inline-flex gap-1">
                      <button type="button" disabled={busy} className="text-gray-300 hover:text-white text-xs px-2 min-h-[44px]" onClick={() => act(() => api.patch(`/api/coach/slots/${s.id}`, { active: !s.active }))}>{s.active ? t('chours.pause') : t('chours.resume')}</button>
                      <button type="button" className="text-gray-300 hover:text-white text-xs px-2 min-h-[44px]" onClick={() => setEdit({ ...s, start_time: hhmm(s.start_time), end_time: hhmm(s.end_time), court_name: s.court_name || '' })}>{t('common.edit')}</button>
                      <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" onClick={() => window.confirm(t('chours.deleteAsk')) && act(() => api.del(`/api/coach/slots/${s.id}`))}>{t('common.delete')}</button>
                    </span>
                  </div>
                ))}
              </section>
            </div>
            <div className="grid gap-4">
              <section className="card !p-0 overflow-hidden">
                <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('chours.booked')} <span className="text-gray-500 font-normal text-sm">({upcoming.length})</span></h2>
                {!upcoming.length && <p className="text-gray-500 text-sm px-4 py-3">{t('chours.noBooked')}</p>}
                {upcoming.map((b) => (
                  <Link key={b.id} href={b.session_id ? `/coach/sessions/${b.session_id}` : '/coach/schedule'} className="flex items-center gap-2 px-4 py-2.5 border-b border-navy-700 last:border-b-0 text-sm hover:bg-navy-800/60">
                    <span className="flex-1 min-w-0">
                      <span className="text-white">{b.student?.full_name}</span>
                      <span className="block text-gray-400 text-xs capitalize tabular-nums">{when(b)}</span>
                    </span>
                    <span className={`text-[11px] rounded-full px-2 py-0.5 ${B_TONE[b.status]}`}>{t(`chours.b_${b.status}`)}</span>
                  </Link>
                ))}
              </section>
              <section className="card">
                <h2 className="text-white font-semibold mb-1">{t('chours.freeTitle')}</h2>
                <p className="text-gray-400 text-xs mb-2">{t('chours.freeLead')}</p>
                {!data.free?.length && <p className="text-gray-500 text-sm">—</p>}
                <div className="flex flex-wrap gap-1.5">
                  {(data.free || []).slice(0, 24).map((x) => (
                    <span key={`${x.date}${x.start_time}`} className="text-xs rounded-full bg-navy-800 text-gray-200 px-2.5 py-1 tabular-nums capitalize">{formatDay(x.date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })} {x.start_time}</span>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        <Modal open={!!edit} title={edit?.id ? t('chours.edit') : t('chours.add')} onClose={() => setEdit(null)}>
          {edit && (
            <form onSubmit={save} className="grid gap-3">
              <div>
                <label className="text-xs text-gray-400">{t('chours.weekday')}</label>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((d) => (
                    <button key={d} type="button" aria-pressed={Number(edit.weekday) === d} onClick={() => setEdit({ ...edit, weekday: d })} className={`min-h-[44px] rounded-lg text-sm ${Number(edit.weekday) === d ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-800 text-gray-300'}`}>{t(`insights.dow_${d}`).replace('Thứ ', 'T').replace('Chủ nhật', 'CN')}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">{t('chours.from')}</label>
                  <input className="input" type="time" required value={edit.start_time} onChange={(e) => setEdit({ ...edit, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">{t('chours.to')}</label>
                  <input className="input" type="time" required value={edit.end_time} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">{t('chours.lessonMin')}</label>
                  <input className="input" type="number" min="30" max="240" step="15" required value={edit.lesson_min} onChange={(e) => setEdit({ ...edit, lesson_min: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">{t('chours.price')}</label>
                  <input className="input text-right tabular-nums" type="number" min="0" step="1000" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('coach.c_court_name')}</label>
                <input className="input" maxLength={160} value={edit.court_name} onChange={(e) => setEdit({ ...edit, court_name: e.target.value })} />
              </div>
              <p className="text-gray-500 text-xs">{t('chours.formHint')}</p>
              {msg && <p className="text-red-300 text-sm">{msg}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</button>
                <button className="btn-primary" disabled={busy}>{t('common.save')}</button>
              </div>
            </form>
          )}
        </Modal>
      </CoachGate>
    </AppShell>
  );
}
