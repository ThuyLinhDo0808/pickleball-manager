'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import ChipRow from '@/components/ui/ChipRow';
import EmptyState from '@/components/ui/EmptyState';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { CoachGate } from '@/components/coach/CoachGate';
import { StudentLine, EnrollActions, ENROLL_TONE } from '@/components/coach/StudentRow';
import { scheduleText, dmy } from '@/lib/coach';
import { BalanceChip, PurchasesPanel, HistoryList } from '@/components/coach/Balance';
import { NotesPanel } from '@/components/coach/Notes';

const EMPTY = { full_name: '', phone: '', level_text: '', note: '' };

// Học viên: everyone the coach teaches (accounts and quick sign-ups), plus the sign-ups
// waiting for a decision. Phone numbers are the coach's eyes only.
export default function CoachStudentsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState('all');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    if (['pending', 'all', 'active', 'left', 'blocked'].includes(q)) setTab(q);
  }, []);
  const { data, loading, error, reload } = useLoad(() => api.get('/api/coach/students'), []);
  const { data: pending, reload: reloadPending } = useLoad(() => api.get('/api/coach/enrollments?status=requested').catch(() => []), []);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [open, setOpen] = useState(null); // student id
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const refresh = () => { reload(); reloadPending(); };
  const needle = q.trim().toLowerCase();
  const list = (data || []).filter((s) => (tab === 'all' ? s.status !== 'blocked' : tab === 'blocked' ? s.status === 'blocked' : s.status === tab) && (!needle || [s.full_name, s.phone, s.level_text].filter(Boolean).some((x) => x.toLowerCase().includes(needle))));
  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post('/api/coach/students', { ...f, full_name: f.full_name.trim(), phone: f.phone.trim() || null, level_text: f.level_text.trim() || null, note: f.note.trim() || null });
      setAdding(false);
      setF(EMPTY);
      refresh();
    } catch (err) {
      const code = err.payload?.code;
      setMsg(t(`coach.err_${code}`) === `coach.err_${code}` ? err.message : t(`coach.err_${code}`));
    } finally {
      setBusy(false);
    }
  }
  async function decide(e, status) {
    setBusy(true);
    try {
      await api.patch(`/api/coach/enrollments/${e.id}`, { status });
      refresh();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  const chip = (k, n) => (
    <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 text-sm ${tab === k ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-800 text-gray-300 hover:text-white'}`}>
      {t(`coach.stf_${k}`)}{n != null && n > 0 && <span className="ml-1 text-xs tabular-nums opacity-80">{n}</span>}
    </button>
  );
  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader
          icon="users"
          title={t('coach.students')}
          subtitle={t('coach.studentsLead')}
          hint={<Hint inline text={t('coach.studentsHint')} />}
          actions={<button type="button" className="btn-primary" onClick={() => setAdding(true)}>+ {t('coach.stAdd')}</button>}
        />
        <div className="card !p-3 mb-3 flex flex-wrap items-center gap-2">
          <input className="input !w-auto flex-1 min-w-[10rem] text-sm" placeholder={t('coach.stSearch')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('coach.stSearch')} />
          <ChipRow gap="gap-1.5">{[['pending', (pending || []).length], ['all'], ['active'], ['left'], ['blocked']].map(([k, n]) => chip(k, n))}</ChipRow>
        </div>
        {loading && !data && <LoadingBlock rows={4} className="card" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}

        {tab === 'pending' && data && (
          <section className="card !p-0 overflow-hidden">
            <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('coach.pendingTitle')} <span className="text-gray-500 font-normal text-sm">({(pending || []).length})</span></h2>
            {!(pending || []).length && <p className="text-gray-500 text-sm px-4 py-3">{t('coach.pendingNone')}</p>}
            {(pending || []).map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
                <div className="flex-1 min-w-[12rem]">
                  <StudentLine s={e.student} sub={<Link href={`/coach/classes/${e.class?.id}`} className="text-sky-300 hover:underline">{e.class?.title}</Link>} />
                </div>
                <EnrollActions e={e} onDecide={decide} busy={busy} />
              </div>
            ))}
          </section>
        )}

        {tab !== 'pending' && data && list.length === 0 && (
          <EmptyState title={t('coach.stEmpty')} action={<button type="button" className="btn-primary" onClick={() => setAdding(true)}>+ {t('coach.stAdd')}</button>}>
            {t('coach.stEmptyHint')}
          </EmptyState>
        )}
        {tab !== 'pending' && list.length > 0 && (
          <section className="card !p-0 overflow-hidden">
            {list.map((s) => (
              <button key={s.id} type="button" onClick={() => setOpen(s.id)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0 hover:bg-navy-800/60">
                <div className="flex-1 min-w-0">
                  <StudentLine s={s} sub={s.classes ? t('coach.stClassesN', { n: s.classes }) : null} />
                </div>
                {s.requested > 0 && <span className={`text-[11px] rounded-full px-2 py-0.5 ${ENROLL_TONE.requested}`}>{t('coach.stRequestedN', { n: s.requested })}</span>}
                {s.balance?.has_package && <BalanceChip b={s.balance} />}
                <span className="text-gray-500">›</span>
              </button>
            ))}
          </section>
        )}

        <Modal open={adding} title={t('coach.stAdd')} onClose={() => setAdding(false)}>
          {adding && (
            <form onSubmit={add} className="grid gap-3">
              <p className="text-gray-400 text-xs">{t('coach.stAddHint')}</p>
              <div>
                <label className="text-xs text-gray-400">{t('coach.st_full_name')}</label>
                <input className="input" required maxLength={120} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">{t('coach.st_phone')}</label>
                  <input className="input" type="tel" maxLength={20} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">{t('coach.f_level_text')}</label>
                  <input className="input" maxLength={80} value={f.level_text} onChange={(e) => setF({ ...f, level_text: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('coach.st_note')}</label>
                <textarea className="input min-h-[4rem]" maxLength={2000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
              </div>
              {msg && <p className="text-red-300 text-sm">{msg}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
                <button className="btn-primary" disabled={busy}>{t('common.add')}</button>
              </div>
            </form>
          )}
        </Modal>
        {open && <StudentModal id={open} onClose={() => setOpen(null)} onChanged={refresh} />}
      </CoachGate>
    </AppShell>
  );
}

// One student: details the coach edits (phone, level, note, status) and their classes.
function StudentModal({ id, onClose, onChanged }) {
  const { t } = useI18n();
  const { data: s, loading, reload } = useLoad(() => api.get(`/api/coach/students/${id}`), [id]);
  const { data: packages } = useLoad(() => api.get('/api/coach/packages').catch(() => []), []);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const form = f || (s ? { full_name: s.full_name, phone: s.phone || '', level_text: s.level_text || '', note: s.note || '', status: s.status } : null);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.patch(`/api/coach/students/${id}`, { ...form, phone: form.phone.trim() || null, level_text: form.level_text.trim() || null, note: form.note.trim() || null });
      setMsg({ ok: true, text: t('common.saved') });
      onChanged();
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function decide(e, status) {
    setBusy(true);
    try {
      await api.patch(`/api/coach/enrollments/${e.id}`, { status });
      reload();
      onChanged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open title={s?.full_name || t('coach.students')} onClose={onClose}>
      {loading && !s && <LoadingBlock rows={3} />}
      {s && form && (
        <div className="grid gap-4">
          <section>
            <h3 className="text-gray-300 text-sm font-semibold mb-2">{t('coach.stClasses')}</h3>
            {!s.enrollments?.length && <p className="text-gray-500 text-sm">{t('coach.stNoClasses')}</p>}
            {(s.enrollments || []).map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 py-2 border-b border-navy-700 last:border-b-0 text-sm">
                <Link href={`/coach/classes/${e.class?.id}`} className="flex-1 min-w-[10rem] text-white hover:text-lime-300">
                  {e.class?.title}
                  <span className="block text-gray-400 text-xs">{e.class ? scheduleText(e.class, t) : ''} · {t(`coach.pay_${e.pay_mode}`)} · {dmy(e.created_at?.slice(0, 10))}</span>
                </Link>
                <EnrollActions e={e} onDecide={decide} busy={busy} />
              </div>
            ))}
          </section>
          <PurchasesPanel student={s} packages={packages || []} onChanged={() => { reload(); onChanged(); }} />
          <section>
            <h3 className="text-gray-300 text-sm font-semibold mb-2">
              {t('coach.history')}
              {s.tally && (s.tally.present + s.tally.absent + s.tally.excused > 0) && <span className="ml-2 text-gray-400 font-normal text-xs tabular-nums">{t('coach.att_present')} {s.tally.present} · {t('coach.att_absent')} {s.tally.absent} · {t('coach.att_excused')} {s.tally.excused}</span>}
            </h3>
            <HistoryList history={(s.history || []).slice(0, 12)} />
          </section>
          <NotesPanel studentId={s.id} />
          <form onSubmit={save} className="grid gap-3">
            <h3 className="text-gray-300 text-sm font-semibold">{t('coach.stDetails')}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400">{t('coach.st_full_name')}</label>
                <input className="input" required maxLength={120} value={form.full_name} onChange={(e) => setF({ ...form, full_name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('coach.st_phone')}</label>
                <input className="input" type="tel" maxLength={20} value={form.phone} onChange={(e) => setF({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('coach.f_level_text')}</label>
                <input className="input" maxLength={80} value={form.level_text} onChange={(e) => setF({ ...form, level_text: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('coach.st_status')}</label>
                <select className="input" value={form.status} onChange={(e) => setF({ ...form, status: e.target.value })}>
                  {['active', 'left', 'blocked'].map((k) => <option key={k} value={k}>{t(`coach.ststatus_${k}`)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('coach.st_note')} <span className="text-gray-500">({t('coach.stNotePrivate')})</span></label>
              <textarea className="input min-h-[4rem]" maxLength={2000} value={form.note} onChange={(e) => setF({ ...form, note: e.target.value })} />
            </div>
            <p className="text-gray-500 text-xs">{s.user_id ? t('coach.stLinked') : t('coach.stNotLinked')}</p>
            {msg && <p className={`text-sm ${msg.ok ? 'text-lime-300' : 'text-red-300'}`}>{msg.text}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onClose}>{t('common.close')}</button>
              <button className="btn-primary" disabled={busy}>{t('common.save')}</button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
}
