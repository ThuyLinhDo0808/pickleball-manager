'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import EventShareCard from '@/components/EventShareCard';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { exportEventFinance } from '@/lib/exportExcel';

export default function EventDetailPage() {
  const { eventId } = useParams();
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const [tab, setTab] = useState('participants');

  const { data: event, reload: reloadEvent, setData: setEvent } = useLoad(() => api.get(`/api/events/${eventId}`), [eventId]);
  const { data: participants, reload: reloadParticipants } = useLoad(
    () => api.get(`/api/events/${eventId}/participants`),
    [eventId]
  );
  const { data: finance, reload: reloadFinance } = useLoad(() => api.get(`/api/events/${eventId}/finance`), [eventId]);
  // Import from the club the event belongs to, falling back to the selected club.
  const importClubId = event?.club_id || club?.id;
  const { data: clubMembers } = useLoad(
    () => (importClubId ? api.get(`/api/clubs/${importClubId}/members`) : Promise.resolve([])),
    [importClubId]
  );

  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [flash, setFlash] = useState('');
  const [txnForm, setTxnForm] = useState({ type: 'expense', category: '', amount: '', note: '' });

  async function addParticipant(e) {
    e.preventDefault();
    await api.post(`/api/events/${eventId}/participants`, form);
    setForm({ full_name: '', phone: '' });
    reloadParticipants();
    reloadEvent();
  }

  async function doAction(p, action) {
    const res = await api.post(`/api/events/${eventId}/participants/${p.id}/${action}`, {});
    if (action === 'check-in' && p.source_club_member_id && event?.club_id) {
      const pass = res?.pass;
      setFlash(
        !pass
          ? t('events.noPass', { name: p.full_name })
          : pass.unlimited
            ? t('events.passUnlimited', { name: p.full_name, period: pass.period_label })
            : t('events.passLeft', { name: p.full_name, period: pass.period_label, n: pass.sessions_remaining })
      );
    }
    reloadParticipants();
    reloadEvent();
    reloadFinance();
  }

  async function toggleFee(p) {
    await api.post(`/api/events/${eventId}/participants/${p.id}/fee`, { fee_paid: !p.fee_paid });
    reloadParticipants();
    reloadFinance();
  }

  async function importFromClub() {
    if (!selectedIds.length) return;
    await api.post(`/api/events/${eventId}/participants/import`, { club_member_ids: selectedIds });
    setSelectedIds([]);
    setShowImport(false);
    reloadParticipants();
    reloadEvent();
  }

  async function addTxn(e) {
    e.preventDefault();
    await api.post('/api/transactions', {
      owner_type: 'event',
      event_id: eventId,
      type: txnForm.type,
      category: txnForm.category || null,
      amount: Number(txnForm.amount || 0),
      note: txnForm.note || null,
    });
    setTxnForm({ type: 'expense', category: '', amount: '', note: '' });
    reloadFinance();
  }

  function onExport() {
    if (!event || !participants || !finance) return;
    exportEventFinance(event, participants, finance.transactions || []);
  }

  if (!event) return <AppShell><p className="text-gray-400">{t('common.loading')}</p></AppShell>;

  const main = (participants || []).filter((p) => ['registered', 'checked_in'].includes(p.status));
  const waitlist = (participants || []).filter((p) => p.status === 'waitlisted');

  return (
    <AppShell>
      <div className="flex justify-between items-start gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-white text-2xl font-bold">{event.title}</h1>
          <p className="text-gray-400 text-sm">{event.event_date} {event.start_time || ''} · {event.location || '—'}</p>
        </div>
        <button className="btn-secondary shrink-0 text-sm" onClick={onExport}>{t('common.exportExcel')}</button>
      </div>

      <EventShareCard event={event} onSaved={setEvent} />

      <div className="flex gap-2 mb-4">
        {['participants', 'finance'].map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === tb ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-800 text-gray-300'}`}
          >
            {tb === 'participants' ? t('nav.members') : t('nav.finance')}
          </button>
        ))}
      </div>

      {tab === 'participants' && (
        <>
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <form onSubmit={addParticipant} className="card flex-1 flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-400">{t('common.name')}</label>
                <input className="input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400">{t('common.phone')}</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <button className="btn-primary">{t('common.add')}</button>
            </form>
            <button className="btn-secondary" onClick={() => setShowImport(!showImport)}>{t('events.importFromClub')}</button>
          </div>

          {showImport && (
            <div className="card mb-4">
              <p className="text-gray-400 text-sm mb-2">{t('events.importFromClub')}</p>
              <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                {(clubMembers || []).filter((m) => m.is_active).map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(m.id)}
                      onChange={(e) =>
                        setSelectedIds(e.target.checked ? [...selectedIds, m.id] : selectedIds.filter((id) => id !== m.id))
                      }
                    />
                    {m.full_name}
                  </label>
                ))}
              </div>
              <button className="btn-primary mt-3" onClick={importFromClub}>{t('common.add')} ({selectedIds.length})</button>
            </div>
          )}

          {flash && (
            <div className="card mb-4 border-lime-400/50 text-lime-300 text-sm flex items-center justify-between gap-3">
              <span>{flash}</span>
              <button className="text-gray-400 text-lg leading-none" aria-label="Close" onClick={() => setFlash('')}>×</button>
            </div>
          )}
          <ParticipantTable title={t('events.mainList')} rows={main} t={t} onAction={doAction} onFee={toggleFee} />
          <ParticipantTable title={t('events.waitlist')} rows={waitlist} t={t} onAction={doAction} onFee={toggleFee} />
        </>
      )}

      {tab === 'finance' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-4">
            <div className="card"><span className="text-gray-400 text-xs">{t('finance.income')}</span><div className="text-lime-400 text-xl font-bold">{(finance?.income || 0).toLocaleString('vi-VN')} ₫</div></div>
            <div className="card"><span className="text-gray-400 text-xs">{t('finance.expense')}</span><div className="text-red-400 text-xl font-bold">{(finance?.expense || 0).toLocaleString('vi-VN')} ₫</div></div>
            <div className="card"><span className="text-gray-400 text-xs">{t('finance.net')}</span><div className="text-white text-xl font-bold">{(finance?.net || 0).toLocaleString('vi-VN')} ₫</div></div>
          </div>

          <form onSubmit={addTxn} className="card mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <select className="input" value={txnForm.type} onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value })}>
              <option value="income">{t('finance.income')}</option>
              <option value="expense">{t('finance.expense')}</option>
            </select>
            <input className="input" placeholder="Category (e.g. balls 40-hole)" value={txnForm.category} onChange={(e) => setTxnForm({ ...txnForm, category: e.target.value })} />
            <input className="input" type="number" placeholder="Amount" required value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} />
            <input className="input" placeholder="Note" value={txnForm.note} onChange={(e) => setTxnForm({ ...txnForm, note: e.target.value })} />
            <button className="btn-primary md:col-span-4">{t('common.add')}</button>
          </form>

          <div className="card">
            <div className="table-wrap">
              <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-left border-b border-navy-700">
                  <th className="py-2">Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(finance?.transactions || []).map((tx) => (
                  <tr key={tx.id} className={`border-b border-navy-800 ${tx.is_voided ? 'opacity-40 line-through' : ''}`}>
                    <td className="py-2 text-gray-300">{tx.occurred_on}</td>
                    <td className={tx.type === 'income' ? 'text-lime-400' : 'text-red-400'}>{t(`finance.${tx.type}`)}</td>
                    <td className="text-gray-300">{tx.category || '—'}</td>
                    <td className="text-gray-300">{Number(tx.amount).toLocaleString('vi-VN')} ₫</td>
                    <td className="text-gray-300">{tx.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function ParticipantTable({ title, rows, t, onAction, onFee }) {
  return (
    <div className="card mb-4">
      <h3 className="text-white font-semibold mb-2">{title} ({rows.length})</h3>
      {rows.length === 0 && <p className="text-gray-400 text-sm">—</p>}
      <div className="table-wrap">
        <table className="w-full text-sm">
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-navy-800">
              <td className="py-2 text-white">
                {p.full_name}
                {p.source_club_member_id && (
                  <span className="ml-2 text-[10px] rounded border border-lime-400/50 text-lime-300 px-1">{t('events.member')}</span>
                )}
              </td>
              <td className="text-gray-400 text-xs uppercase">{p.status}</td>
              <td>
                <button className="text-xs text-gray-300 mr-2" onClick={() => onFee(p)}>
                  {p.fee_paid ? t('common.paid') : t('common.unpaid')}
                </button>
              </td>
              <td className="text-right">
                {p.status !== 'checked_in' && (
                  <button className="text-lime-400 text-xs mr-2" onClick={() => onAction(p, 'check-in')}>{t('events.checkIn')}</button>
                )}
                <button className="text-yellow-400 text-xs mr-2" onClick={() => onAction(p, 'no-show')}>{t('events.noShow')}</button>
                <button className="text-red-400 text-xs" onClick={() => onAction(p, 'cancel')}>{t('events.cancel')}</button>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}
