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
import { dmy } from '@/lib/coach';
import { CoachGate } from '@/components/coach/CoachGate';

const S_TONE = { requested: 'bg-amber-300/15 text-amber-200', active: 'bg-lime-400/15 text-lime-300' };

// CLB liên kết (Coach): clubs / communities linked with me, asking a club to link, the
// Host's invitations; for a linked club its member list (name, gender, level — no phone)
// with "Thêm làm học viên".
export default function CoachClubsPage() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(() => api.get('/api/coach/clubs'), []);
  const [find, setFind] = useState(false);
  const [pick, setPick] = useState(null); // linked club whose members are shown
  const [busy, setBusy] = useState(false);
  const links = data || [];
  const invites = links.filter((l) => l.status === 'requested' && l.requested_by === 'host');
  const others = links.filter((l) => !(l.status === 'requested' && l.requested_by === 'host'));
  const where = (c) => [c?.district, c?.province].filter(Boolean).join(', ') || c?.address || '';

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

  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader icon="clubs" title={t('ccl.coachTitle')} subtitle={t('ccl.coachLead')} hint={<Hint inline text={t('ccl.coachHint')} />} actions={<button type="button" className="btn-primary" onClick={() => setFind(true)}>+ {t('ccl.ask')}</button>} />
        {loading && !data && <LoadingBlock rows={3} className="card" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {data && !links.length && (
          <EmptyState title={t('ccl.coachEmpty')} action={<button type="button" className="btn-primary" onClick={() => setFind(true)}>+ {t('ccl.ask')}</button>}>{t('ccl.coachEmptyHint')}</EmptyState>
        )}
        {invites.length > 0 && (
          <section className="card !p-0 overflow-hidden mb-4">
            <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('ccl.invites')} <span className="text-gray-500 font-normal text-sm">({invites.length})</span></h2>
            {invites.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
                <span className="flex-1 min-w-[12rem]"><span className="text-white font-medium">{l.club?.name}</span><span className="block text-gray-400 text-xs">{[where(l.club), l.note].filter(Boolean).join(' · ')}</span></span>
                <span className="inline-flex gap-1">
                  <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" onClick={() => act(() => api.post(`/api/coach/club-links/${l.id}/decline`, {}))}>{t('ccl.decline')}</button>
                  <button type="button" disabled={busy} className="btn-primary text-xs !min-h-[44px]" onClick={() => act(() => api.post(`/api/coach/club-links/${l.id}/accept`, {}))}>{t('ccl.accept')}</button>
                </span>
              </div>
            ))}
          </section>
        )}
        {others.length > 0 && (
          <section className="card !p-0 overflow-hidden mb-4">
            <h2 className="text-white font-semibold px-4 py-3 border-b border-navy-700">{t('ccl.myClubs')}</h2>
            {others.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-navy-700 last:border-b-0">
                <span className="flex-1 min-w-[12rem]">
                  <span className="text-white font-medium">{l.club?.name}</span>
                  <span className={`ml-2 align-middle text-[11px] rounded-full px-2 py-0.5 ${S_TONE[l.status] || ''}`}>{t(`ccl.st_${l.status}`)}</span>
                  <span className="block text-gray-400 text-xs">{[t(l.club?.kind === 'community' ? 'ccl.community' : 'ccl.club'), where(l.club), l.status === 'active' ? t('ccl.since', { d: dmy((l.decided_at || l.created_at)?.slice(0, 10)) }) : t('ccl.waitHost')].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="inline-flex gap-1">
                  <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[44px]" onClick={() => window.confirm(t(l.status === 'active' ? 'ccl.unlinkAsk' : 'ccl.cancelAsk', { name: l.club?.name })) && act(() => api.del(`/api/coach/club-links/${l.id}`))}>{l.status === 'active' ? t('ccl.unlink') : t('ccl.cancelInvite')}</button>
                  {l.status === 'active' && <button type="button" className="btn-primary text-xs !min-h-[44px]" onClick={() => setPick(pick?.id === l.id ? null : l)}>{t('ccl.seeMembers')}</button>}
                </span>
              </div>
            ))}
          </section>
        )}
        {pick && <ClubMembers link={pick} onClose={() => setPick(null)} />}
        <FindClub open={find} onClose={() => setFind(false)} onDone={() => { setFind(false); reload(); }} />
      </CoachGate>
    </AppShell>
  );
}

function ClubMembers({ link, onClose }) {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get(`/api/coach/clubs/${link.club_id}/members`), [link.club_id]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);
  const list = (data?.members || []).filter((m) => !q.trim() || m.full_name.toLowerCase().includes(q.trim().toLowerCase()));
  async function add(m) {
    setBusy(m.id);
    try {
      await api.post(`/api/coach/clubs/${link.club_id}/members/${m.id}/student`, {});
      reload();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="card !p-0 overflow-hidden mb-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-navy-700">
        <h2 className="text-white font-semibold flex-1 min-w-0 break-words">{t('ccl.membersOf', { name: link.club?.name })} {data && <span className="text-gray-500 font-normal text-sm">({data.members.length})</span>}</h2>
        <button type="button" className="text-gray-400 hover:text-white text-sm px-2 min-h-[44px]" onClick={onClose}>{t('common.close')}</button>
      </div>
      <div className="px-4 py-2 border-b border-navy-700">
        <input className="input" type="search" placeholder={t('ccl.searchMember')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('ccl.searchMember')} />
        <p className="text-gray-500 text-xs mt-1">{t('ccl.membersNote')}</p>
      </div>
      {error && <div className="p-4"><ErrorBlock message={error.message} onRetry={reload} /></div>}
      {!data && !error && <LoadingBlock rows={4} className="p-4" />}
      {data && !list.length && <p className="text-gray-500 text-sm px-4 py-3">{t('ccl.noMembers')}</p>}
      {list.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-navy-700 last:border-b-0 text-sm">
          <span className="flex-1 min-w-[10rem]">
            <span className="text-white break-words">{m.full_name}</span>
            <span className="block text-gray-400 text-xs tabular-nums">
              {[m.gender ? t(`ccl.g_${m.gender}`) : null, m.level != null ? `${m.verified ? 'DUPR ' : ''}${m.level.toFixed(2)}` : null, m.has_account ? null : t('coach.stNoAccount')].filter(Boolean).join(' · ') || '—'}
            </span>
          </span>
          {m.student_id ? (
            <Link href="/coach/students" className="text-lime-300 text-xs px-2 min-h-[44px] inline-flex items-center">{t('ccl.isStudent')}</Link>
          ) : (
            <button type="button" disabled={busy === m.id} className="btn-secondary text-xs !min-h-[44px]" onClick={() => add(m)}>{t('ccl.addStudent')}</button>
          )}
        </div>
      ))}
    </section>
  );
}

function FindClub({ open, onClose, onDone }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function search(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      setRows(await api.get(`/api/coach/clubs/search?q=${encodeURIComponent(q.trim())}`));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function ask(c) {
    setBusy(true);
    setMsg('');
    try {
      await api.post(`/api/coach/clubs/${c.id}/link`, { note: note.trim() || null });
      setRows(null);
      setQ('');
      setNote('');
      onDone();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} title={t('ccl.ask')} onClose={onClose}>
      <form onSubmit={search} className="flex gap-2 mb-2">
        <input className="input flex-1" type="search" required minLength={2} maxLength={80} placeholder={t('ccl.searchClub')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('ccl.searchClub')} />
        <button className="btn-primary" disabled={busy}>{t('ccl.search')}</button>
      </form>
      <label className="text-xs text-gray-400" htmlFor="ccl-note">{t('ccl.note')}</label>
      <input id="ccl-note" className="input mb-2" maxLength={500} placeholder={t('ccl.notePh')} value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="text-gray-500 text-xs mb-2">{t('ccl.askHint')}</p>
      {msg && <p className="text-red-300 text-sm mb-2">{msg}</p>}
      {rows && !rows.length && <p className="text-gray-500 text-sm">{t('ccl.noClub')}</p>}
      <ul className="grid gap-1">
        {(rows || []).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 border-b border-navy-700 last:border-b-0 py-1.5 text-sm">
            <span className="flex-1 min-w-0"><span className="text-white break-words">{c.name}</span><span className="block text-gray-400 text-xs">{[c.district, c.province].filter(Boolean).join(', ') || c.address || '—'}</span></span>
            <button type="button" disabled={busy} className="btn-primary text-xs !min-h-[44px]" onClick={() => ask(c)}>{t('ccl.send')}</button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
