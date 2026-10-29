'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import EmptyState from '@/components/ui/EmptyState';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { dmy, scheduleText } from '@/lib/coach';

const dash = <span className="text-gray-500">—</span>;

// Coach liên kết (Host): coaches who asked to link with the club, invitations sent, linked
// coaches and — for a linked one — their students who are members here: level, sessions
// attended, sessions left in a package, classes. No phone numbers, no coach notes, no money.
export default function ClubCoachesPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data, error, loading, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/coaches`) : Promise.resolve(null)), [club?.id]);
  const [open, setOpen] = useState(null); // link whose students are shown
  const [invite, setInvite] = useState(false);
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const links = data || [];
  const asked = links.filter((l) => l.status === 'requested' && l.requested_by === 'coach');
  const sent = links.filter((l) => l.status === 'requested' && l.requested_by === 'host');
  const active = links.filter((l) => l.status === 'active');
  const migration = error?.payload?.code === 'migration_missing';

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
  async function sendInvite(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post(`/api/clubs/${club.id}/coaches/invite`, { slug: slug.trim() });
      setSlug('');
      setInvite(false);
      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  const coachLine = (c) => [c?.level_text, c?.area].filter(Boolean).join(' · ');

  return (
    <AppShell>
      <PageHeader
        icon="users"
        title={t('ccl.hostTitle')}
        subtitle={club?.name}
        hint={<Hint inline text={t('ccl.hostHint')} />}
        actions={!migration && <button type="button" className="btn-primary" onClick={() => { setMsg(''); setInvite(true); }}>+ {t('ccl.invite')}</button>}
      />
      {loading && !data && <LoadingBlock rows={3} className="card" />}
      {error && (migration ? <p className="card text-amber-200 text-sm">{t('ccl.needMigration')}</p> : <ErrorBlock message={error.message} onRetry={reload} />)}
      {data && !links.length && (
        <EmptyState title={t('ccl.hostEmpty')} action={<button type="button" className="btn-primary" onClick={() => setInvite(true)}>+ {t('ccl.invite')}</button>}>{t('ccl.hostEmptyHint')}</EmptyState>
      )}
      {asked.length > 0 && (
        <section className="card !p-0 overflow-hidden mb-4 border-amber-400/40">
          <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('ccl.asked')} <span className="text-gray-500 font-normal text-sm">({asked.length})</span></h2>
          {asked.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
              <span className="flex-1 min-w-[12rem]">
                <a href={`/coach/${l.coach?.slug}`} target="_blank" rel="noreferrer" className="text-white font-medium hover:text-lime-300">{l.coach?.display_name}</a>
                <span className="block text-gray-400 text-xs">{[coachLine(l.coach), l.note, dmy(l.created_at?.slice(0, 10))].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="inline-flex gap-1">
                <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" onClick={() => act(() => api.post(`/api/clubs/${club.id}/coaches/${l.id}/decline`, {}))}>{t('ccl.decline')}</button>
                <button type="button" disabled={busy} className="btn-primary text-xs !min-h-[44px]" onClick={() => act(() => api.post(`/api/clubs/${club.id}/coaches/${l.id}/accept`, {}))}>{t('ccl.accept')}</button>
              </span>
            </div>
          ))}
        </section>
      )}
      {active.length > 0 && (
        <section className="card !p-0 overflow-hidden mb-4">
          <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('ccl.linked')} <span className="text-gray-500 font-normal text-sm">({active.length})</span></h2>
          {active.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
              <span className="flex-1 min-w-[12rem]">
                <a href={`/coach/${l.coach?.slug}`} target="_blank" rel="noreferrer" className="text-white font-medium hover:text-lime-300">{l.coach?.display_name}</a>
                <span className="block text-gray-400 text-xs">{[coachLine(l.coach), t('ccl.since', { d: dmy((l.decided_at || l.created_at)?.slice(0, 10)) })].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="inline-flex gap-1">
                <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" onClick={() => window.confirm(t('ccl.unlinkAsk', { name: l.coach?.display_name })) && act(() => api.del(`/api/clubs/${club.id}/coaches/${l.id}`))}>{t('ccl.unlink')}</button>
                <button type="button" className="btn-primary text-xs !min-h-[44px]" onClick={() => setOpen(open?.id === l.id ? null : l)}>{t('ccl.seeStudents')}</button>
              </span>
            </div>
          ))}
        </section>
      )}
      {open && (
        <section className="card mb-4" aria-live="polite">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h2 className="text-white font-semibold">{t('ccl.studentsOf', { name: open.coach?.display_name })}</h2>
            <button type="button" className="text-gray-400 hover:text-white text-sm px-2 min-h-[44px]" onClick={() => setOpen(null)}>{t('common.close')}</button>
          </div>
          <CoachStudents clubId={club.id} link={open} />
        </section>
      )}
      {sent.length > 0 && (
        <section className="card !p-0 overflow-hidden mb-4">
          <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('ccl.sent')}</h2>
          {sent.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0 text-sm">
              <span className="flex-1 min-w-[12rem] text-white">{l.coach?.display_name}<span className="block text-gray-400 text-xs">{t('ccl.waitCoach')}</span></span>
              <button type="button" disabled={busy} className="text-gray-300 hover:text-white text-xs px-2 min-h-[44px]" onClick={() => act(() => api.del(`/api/clubs/${club.id}/coaches/${l.id}`))}>{t('ccl.cancelInvite')}</button>
            </div>
          ))}
        </section>
      )}

      <Modal open={invite} title={t('ccl.invite')} onClose={() => setInvite(false)}>
        <form onSubmit={sendInvite} className="grid gap-3">
          <p className="text-gray-400 text-sm">{t('ccl.inviteLead')}</p>
          <label className="text-xs text-gray-400" htmlFor="ccl-slug">{t('ccl.slug')}</label>
          <input id="ccl-slug" className="input" required maxLength={200} placeholder="nexuszone.vn/coach/ten-coach" value={slug} onChange={(e) => setSlug(e.target.value)} />
          {msg && <p className="text-red-300 text-sm">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setInvite(false)}>{t('common.cancel')}</button>
            <button className="btn-primary" disabled={busy}>{t('ccl.sendInvite')}</button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}

function CoachStudents({ clubId, link }) {
  const { t } = useI18n();
  const { data, error } = useLoad(() => api.get(`/api/clubs/${clubId}/coaches/${link.id}/students`), [clubId, link.id]);
  if (error) return <p className="text-red-300 text-sm">{error.message}</p>;
  if (!data) return <LoadingBlock rows={3} />;
  return (
    <div className="grid gap-4">
      <p className="text-gray-400 text-sm">{t('ccl.studentsLead')}</p>
      <section>
        <h3 className="text-white font-semibold text-sm mb-1">{t('ccl.members')} <span className="text-gray-500 font-normal">({data.students.length})</span></h3>
        {!data.students.length && <p className="text-gray-500 text-sm">{t('ccl.noStudents')}</p>}
        {data.students.length > 0 && (
          <div className="rounded-xl border border-navy-700 overflow-hidden">
            <div className="hidden sm:grid grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,2fr)] gap-3 px-3 py-2 text-xs text-gray-400 border-b border-navy-700">
              <span>{t('ccl.colName')}</span>
              <span className="text-right">{t('ccl.colPresent')}</span>
              <span className="text-right">{t('ccl.colLeft')}</span>
              <span className="text-right">{t('ccl.colLast')}</span>
              <span>{t('ccl.colClasses')}</span>
            </div>
            {data.students.map((s) => (
              <div key={s.id} className="grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,2fr)] gap-x-3 gap-y-0.5 px-3 py-2 border-b border-navy-700 last:border-b-0 text-sm items-center">
                <span className="col-span-2 sm:col-span-1 min-w-0">
                  <span className="text-white break-words">{s.full_name}</span>
                  {s.status === 'left' && <span className="ml-1.5 text-[10px] rounded-full bg-navy-700 text-gray-300 px-1.5 py-0.5">{t('coach.ststatus_left')}</span>}
                  <span className="block text-gray-400 text-xs">{s.level_text || '—'}</span>
                </span>
                <span className="tabular-nums sm:text-right text-gray-200"><span className="sm:hidden text-gray-500">{t('ccl.colPresent')}: </span>{s.present || dash}</span>
                <span className="tabular-nums sm:text-right text-gray-200"><span className="sm:hidden text-gray-500">{t('ccl.colLeft')}: </span>{s.remaining != null ? s.remaining : dash}</span>
                <span className="tabular-nums sm:text-right text-gray-300 text-xs"><span className="sm:hidden text-gray-500">{t('ccl.colLast')}: </span>{s.last_present ? dmy(s.last_present.slice(0, 10)) : '—'}</span>
                <span className="col-span-2 sm:col-span-1 text-gray-300 text-xs break-words">{s.classes.length ? s.classes.join(', ') : '—'}</span>
              </div>
            ))}
          </div>
        )}
        {data.others > 0 && <p className="text-gray-500 text-xs mt-1">{t('ccl.others', { n: data.others })}</p>}
      </section>
      <section>
        <h3 className="text-white font-semibold text-sm mb-1">{t('ccl.classes')}</h3>
        {!data.classes.length && <p className="text-gray-500 text-sm">—</p>}
        <ul className="grid gap-1 text-sm">
          {data.classes.map((c) => (
            <li key={c.id} className="flex flex-wrap gap-x-2 text-gray-200">
              <span className="text-white">{c.title}</span>
              <span className="text-gray-400 tabular-nums">{[scheduleText(c, t), c.court_name].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
