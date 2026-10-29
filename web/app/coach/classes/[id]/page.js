'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import PageHeader from '@/components/ui/PageHeader';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import DateInput from '@/components/ui/DateInput';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import EmptyState from '@/components/ui/EmptyState';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatDay, hhmm, todayYmd } from '@/lib/dates';
import { formatVnd } from '@/lib/format';
import { CoachGate } from '@/components/coach/CoachGate';
import ClassForm, { classBody } from '@/components/coach/ClassForm';
import { scheduleText, endTime } from '@/lib/coach';
import { SessionRow } from '@/components/coach/SessionRow';
import { StudentLine, EnrollActions } from '@/components/coach/StudentRow';

// One class: its sessions (move, cancel, add) and its settings. Students come in C3.
export default function CoachClassPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const router = useRouter();
  const { data, loading, error, reload } = useLoad(() => api.get(`/api/coach/classes/${id}`), [id]);
  const [tab, setTab] = useState('sessions');
  const [f, setF] = useState(null);
  const [applyUpcoming, setApplyUpcoming] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState({ session_date: todayYmd(), start_time: '', note: '' });
  const [enrolling, setEnrolling] = useState(false);
  const [st, setSt] = useState({ full_name: '', phone: '', student_id: '' });
  const { data: students } = useLoad(() => (enrolling ? api.get('/api/coach/students').catch(() => []) : Promise.resolve(null)), [enrolling]);
  async function decide(e, status) {
    setBusy(true);
    try {
      await api.patch(`/api/coach/enrollments/${e.id}`, { status });
      reload();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function enrollByHand(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/coach/classes/${id}/enroll`, st.student_id ? { student_id: st.student_id } : { full_name: st.full_name.trim(), phone: st.phone.trim() || null });
      setEnrolling(false);
      setSt({ full_name: '', phone: '', student_id: '' });
      reload();
    } catch (err) {
      const code = err.payload?.code;
      window.alert(t(`coach.err_${code}`) === `coach.err_${code}` ? err.message : t(`coach.err_${code}`));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (data) setF({ ...data, court_name: data.court_name || '', map_url: data.map_url || '', note: data.note || '', deduct_mode: data.deduct_mode || '', start_time: hhmm(data.start_time) });
  }, [data]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.patch(`/api/coach/classes/${id}`, { ...classBody(f, false), apply_to: applyUpcoming ? 'upcoming' : undefined });
      setMsg({ ok: true, text: r.sessions_moved ? t('coach.cSavedMoved', { n: r.sessions_moved }) : t('common.saved') });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm(t('coach.cDeleteAsk', { title: data.title }))) return;
    try {
      const r = await api.del(`/api/coach/classes/${id}`);
      if (r.archived) window.alert(t('coach.cArchivedInstead'));
      router.push('/coach/classes');
    } catch (err) {
      window.alert(err.message);
    }
  }
  async function addSession(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/coach/classes/${id}/sessions`, { session_date: extra.session_date, ...(extra.start_time ? { start_time: extra.start_time } : {}), note: extra.note.trim() || null });
      setAdding(false);
      reload();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  const today = todayYmd();
  const sessions = data?.sessions || [];
  const upcoming = sessions.filter((s) => s.session_date >= today);
  const past = sessions.filter((s) => s.session_date < today).reverse();
  const roster = data?.roster || [];
  const live = roster.filter((e) => ['requested', 'confirmed', 'waitlist'].includes(e.status));
  const n = { requested: live.filter((e) => e.status === 'requested').length, confirmed: live.filter((e) => e.status === 'confirmed').length, waitlist: live.filter((e) => e.status === 'waitlist').length };
  const gone = roster.filter((e) => !['requested', 'confirmed', 'waitlist'].includes(e.status));
  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        {loading && !data && <LoadingBlock rows={3} className="card mt-3" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {data && (
          <>
            <PageHeader
              icon="plans"
              title={data.title}
              subtitle={`${t(`coach.kind_${data.kind}`)} · ${scheduleText(data, t)}${data.court_name ? ` · ${data.court_name}` : ''}`}
              actions={<button type="button" className="btn-primary" onClick={() => { setExtra({ session_date: todayYmd(), start_time: '', note: '' }); setAdding(true); }}>+ {t('coach.sAdd')}</button>}
            />
            <UnderlineTabs
              value={tab}
              onChange={setTab}
              tabs={[
                { key: 'sessions', label: t('coach.tabSessions'), count: upcoming.length },
                { key: 'students', label: t('coach.tabStudents'), count: n.confirmed, alert: n.requested > 0 },
                { key: 'settings', label: t('coach.tabSettings') },
              ]}
            />
            {tab === 'sessions' && (
              <div className="grid gap-4">
                <section className="card !p-0 overflow-hidden">
                  <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('coach.sUpcoming')} <span className="text-gray-500 font-normal text-sm">({upcoming.length})</span></h2>
                  {upcoming.length === 0 ? <p className="text-gray-500 text-sm px-4 py-3">{t('coach.sNoneUpcoming')}</p> : upcoming.map((s) => <SessionRow key={s.id} s={s} lang={lang} onChanged={reload} />)}
                </section>
                {past.length > 0 && (
                  <section className="card !p-0 overflow-hidden opacity-80">
                    <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('coach.sPast')} <span className="text-gray-500 font-normal text-sm">({past.length})</span></h2>
                    {past.map((s) => <SessionRow key={s.id} s={s} lang={lang} onChanged={reload} past />)}
                  </section>
                )}
              </div>
            )}
            {tab === 'students' && (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-lime-400/15 text-lime-300 px-3 py-1 tabular-nums">{t('coach.rosterConfirmed', { n: n.confirmed, cap: data.capacity })}</span>
                  {n.requested > 0 && <span className="rounded-full bg-amber-300/15 text-amber-200 px-3 py-1 tabular-nums">{t('coach.rosterRequested', { n: n.requested })}</span>}
                  {n.waitlist > 0 && <span className="rounded-full bg-sky-400/15 text-sky-200 px-3 py-1 tabular-nums">{t('coach.rosterWaitlist', { n: n.waitlist })}</span>}
                  <button type="button" className="btn-primary text-sm ml-auto" onClick={() => setEnrolling(true)}>+ {t('coach.rosterAdd')}</button>
                </div>
                <section className="card !p-0 overflow-hidden">
                  {live.length === 0 && <p className="text-gray-500 text-sm px-4 py-3">{t('coach.rosterEmpty')}</p>}
                  {['requested', 'confirmed', 'waitlist'].flatMap((k) => live.filter((e) => e.status === k)).map((e) => (
                    <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
                      <div className="flex-1 min-w-[12rem]"><StudentLine s={e.student} sub={`${t(`coach.pay_${e.pay_mode}`)} · ${t(`coach.src_${e.source}`)}`} /></div>
                      <EnrollActions e={e} onDecide={decide} busy={busy} />
                    </div>
                  ))}
                </section>
                {gone.length > 0 && (
                  <section className="card !p-0 overflow-hidden opacity-70">
                    <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700 text-sm">{t('coach.rosterGone')} <span className="text-gray-500 font-normal">({gone.length})</span></h2>
                    {gone.map((e) => (
                      <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
                        <div className="flex-1 min-w-[12rem]"><StudentLine s={e.student} /></div>
                        <EnrollActions e={e} onDecide={decide} busy={busy} />
                      </div>
                    ))}
                  </section>
                )}
              </div>
            )}
            {tab === 'settings' && f && (
              <form onSubmit={save} className="grid gap-4">
                <ClassForm value={f} onChange={setF} applyUpcoming={applyUpcoming} setApplyUpcoming={setApplyUpcoming} />
                {msg && <p className={`text-sm ${msg.ok ? 'text-lime-300' : 'text-red-300'}`}>{msg.text}</p>}
                <div className="flex flex-wrap justify-between gap-2">
                  <button type="button" className="text-red-300 hover:text-red-200 text-sm px-2 min-h-[44px]" onClick={remove}>{t('coach.cDelete')}</button>
                  <button className="btn-primary" disabled={busy}>{t('common.save')}</button>
                </div>
              </form>
            )}
          </>
        )}
        <Modal open={enrolling} title={t('coach.rosterAdd')} onClose={() => setEnrolling(false)}>
          {enrolling && (
            <form onSubmit={enrollByHand} className="grid gap-3">
              <p className="text-gray-400 text-xs">{t('coach.rosterAddHint')}</p>
              {(students || []).length > 0 && (
                <div>
                  <label className="text-xs text-gray-400">{t('coach.rosterPick')}</label>
                  <select className="input" value={st.student_id} onChange={(e) => setSt({ ...st, student_id: e.target.value })}>
                    <option value="">{t('coach.rosterPickNew')}</option>
                    {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.phone ? ` · ${s.phone}` : ''}</option>)}
                  </select>
                </div>
              )}
              {!st.student_id && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">{t('coach.st_full_name')}</label>
                    <input className="input" required maxLength={120} value={st.full_name} onChange={(e) => setSt({ ...st, full_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">{t('coach.st_phone')}</label>
                    <input className="input" type="tel" maxLength={20} value={st.phone} onChange={(e) => setSt({ ...st, phone: e.target.value })} />
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setEnrolling(false)}>{t('common.cancel')}</button>
                <button className="btn-primary" disabled={busy}>{t('common.add')}</button>
              </div>
            </form>
          )}
        </Modal>
        <Modal open={adding} title={t('coach.sAdd')} onClose={() => setAdding(false)}>
          {adding && (
            <form onSubmit={addSession} className="grid gap-3">
              <div>
                <label className="text-xs text-gray-400">{t('fin.date')}</label>
                <DateInput value={extra.session_date} onChange={(v) => setExtra({ ...extra, session_date: v })} required />
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('coach.c_start_time')} <span className="text-gray-500">({t('coach.sSameTime', { t: `${hhmm(data?.start_time)}–${endTime(data?.start_time, data?.duration_min)}` })})</span></label>
                <input className="input" type="time" value={extra.start_time} onChange={(e) => setExtra({ ...extra, start_time: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('fin.note')}</label>
                <input className="input" maxLength={1000} value={extra.note} onChange={(e) => setExtra({ ...extra, note: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
                <button className="btn-primary" disabled={busy}>{t('common.add')}</button>
              </div>
            </form>
          )}
        </Modal>
      </CoachGate>
    </AppShell>
  );
}
