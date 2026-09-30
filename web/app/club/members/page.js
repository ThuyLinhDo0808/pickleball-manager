'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import MemberDetail, { FLAG_STYLE } from '@/components/MemberDetail';
import MemberRequests from '@/components/MemberRequests';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { todayYmd } from '@/lib/dates';
import { dmy, isBirthdayMonth, my, tenureLabel } from '@/lib/memberDates';

const emptyForm = () => ({ full_name: '', gender: '', birth_date: '', joined_month: todayYmd().slice(0, 7), dupr_level: '', member_type: 'fixed', tier: '', phone: '' });

export default function MembersPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data: members, loading, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve([])),
    [club?.id]
  );
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('members');
  const { data: requests, reload: reloadRequests } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/member-requests`).catch(() => []) : Promise.resolve([])),
    [club?.id]
  );
  const pending = requests || [];

  // New join requests live only in the "waiting" tab until the Host approves them.
  const rows = (members || []).filter((m) => !(m.join_requested && !m.account_verified));
  const detailMember = rows.find((m) => m.id === detailId) || null;
  const allSelected = rows.length > 0 && selected.length === rows.length;

  function closeAdd() {
    setShowAdd(false);
    setForm(emptyForm());
    setError('');
  }

  async function addMember(e) {
    e.preventDefault();
    if (!club) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/members`, {
        ...form,
        dupr_level: form.dupr_level ? Number(form.dupr_level) : null,
        birth_date: form.birth_date || null,
        joined_on: form.joined_month ? `${form.joined_month}-01` : null,
        joined_month: undefined,
        gender: form.gender || null,
        tier: form.tier || null,
      });
      closeAdd();
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function deleteSelected() {
    const names = rows.filter((m) => selected.includes(m.id)).map((m) => m.full_name).join(', ');
    if (!window.confirm(t('members.deleteConfirm', { count: selected.length, names }))) return;
    setBusy(true);
    try {
      await Promise.all(selected.map((id) => api.del(`/api/clubs/${club.id}/members/${id}`)));
      setSelected([]);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
      reload();
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-white text-2xl font-bold">
          {t('nav.members')}
        </h1>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg px-3 h-10 text-sm font-semibold border border-red-500/60 text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition"
            disabled={busy || selected.length === 0}
            onClick={deleteSelected}
          >
            {t('members.deleteSelected', { count: selected.length })}
          </button>
          <button
            className="btn-primary w-10 h-10 !p-0 text-2xl leading-none flex items-center justify-center"
            aria-label={t('members.addMember')}
            title={t('members.addMember')}
            disabled={!club}
            onClick={() => setShowAdd(true)}
          >
            +
          </button>
        </div>
      </div>

      <div role="tablist" className="grid grid-cols-2 sm:inline-grid sm:grid-cols-2 gap-1 bg-navy-900 border border-navy-700 rounded-lg p-1 mb-3 text-sm font-semibold">
        <button role="tab" aria-selected={tab === 'members'} onClick={() => setTab('members')}
          className={`rounded-md px-3 py-2 ${tab === 'members' ? 'bg-lime-400 text-navy-950' : 'text-gray-300'}`}>
          {t('requests.tabMembers')} ({rows.length})
        </button>
        <button role="tab" aria-selected={tab === 'pending'} onClick={() => setTab('pending')}
          className={`rounded-md px-3 py-2 flex items-center justify-center gap-2 ${tab === 'pending' ? 'bg-lime-400 text-navy-950' : 'text-gray-300'}`}>
          {t('requests.tabPending')}
          {pending.length > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs leading-5">{pending.length}</span>}
        </button>
      </div>

      {tab === 'pending' && (
        <MemberRequests club={club} requests={pending} onChanged={() => { reloadRequests(); reload(); }} />
      )}

      {tab === 'members' && pending.length > 0 && (
        <button className="card mb-3 w-full text-left border-yellow-400/50 text-sm" onClick={() => setTab('pending')}>
          <span className="text-yellow-300 font-semibold">{t('requests.banner', { n: pending.length })}</span>{' '}
          <span className="text-gray-300">{pending.map((m) => m.account_name || m.full_name).join(', ')}</span>
          <span className="text-lime-400 ml-1">→</span>
        </button>
      )}

      {tab === 'members' && (() => {
        const bdays = rows.filter((m) => m.is_active && isBirthdayMonth(m.birth_date)).sort((a, b) => a.birth_date.slice(8).localeCompare(b.birth_date.slice(8)));
        return bdays.length > 0 ? (
          <div className="card mb-3 !py-3 text-sm border-pink-400/40">
            <span className="text-pink-300 font-semibold">🎂 {t('members.birthdaysThisMonth', { n: bdays.length })}</span>{' '}
            <span className="text-gray-300">{bdays.map((m) => `${m.full_name} (${m.birth_date.slice(8, 10)}/${m.birth_date.slice(5, 7)})`).join(', ')}</span>
          </div>
        ) : null;
      })()}

      <div className={`card ${tab === 'members' ? '' : 'hidden'}`}>
        {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
        {!loading && rows.length === 0 && <p className="text-gray-400 text-sm">{t('members.empty')}</p>}
        {!loading && rows.length > 0 && (
          <>
            <p className="text-gray-500 text-xs mb-2">
              {t('members.selectHint')} {t('members.openHint')}
            </p>
            <div className="table-wrap">
              <table className="w-full text-sm grid-table">
                <thead>
                  <tr className="text-gray-300 text-left bg-navy-900">
                    <th className="w-10 text-center">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? [] : rows.map((m) => m.id))}
                      />
                    </th>
                    <th className="w-12 text-center">{t('members.no')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('members.gender')}</th>
                    <th>{t('members.birthDate')}</th>
                    <th>{t('members.joined')}</th>
                    <th>{t('common.level')}</th>
                    <th>{t('members.type')}</th>
                    <th>{t('members.tier')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m, i) => (
                    <tr
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      className={`cursor-pointer ${selected.includes(m.id) ? 'bg-red-500/10' : 'hover:bg-navy-700/40'} ${m.is_active ? '' : 'opacity-40'}`}
                    >
                      <td className="text-center">
                        <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td className="text-center text-gray-400">{i + 1}</td>
                      <td>
                        <button
                          type="button"
                          className="text-white hover:text-lime-400 underline decoration-navy-600 underline-offset-4 text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(false);
                            setDetailId(m.id);
                          }}
                        >
                          {m.full_name}
                        </button>
                        <button
                          type="button"
                          title={t('members.edit')}
                          aria-label={`${t('members.edit')}: ${m.full_name}`}
                          className="ml-1.5 rounded px-1 text-sm opacity-70 hover:opacity-100 hover:bg-navy-700 align-middle"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(true);
                            setDetailId(m.id);
                          }}
                        >
                          ✏️
                        </button>
                        {m.account_email && !m.account_verified && (
                          <span className="ml-2 text-[10px] leading-4 rounded border border-yellow-400/60 text-yellow-300 px-1 align-middle">{t('verify.pending')}</span>
                        )}
                        {m.flags?.length > 0 && (
                          <span className="inline-flex gap-1 ml-2 align-middle">
                            {m.flags.map((f) => (
                              <span key={f} title={t(`flags.${f}`)} className={`text-[10px] leading-4 rounded border px-1 ${FLAG_STYLE[f]}`}>
                                {t(`flags.${f}`)}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="text-gray-300">{m.gender ? t(`members.${m.gender}`) : '—'}</td>
                      <td className="text-gray-300 whitespace-nowrap">
                        {m.birth_date ? dmy(m.birth_date) : m.birth_year ? (
                          <>
                            {m.birth_year} <span className="text-yellow-300/80 text-xs" title={t('members.noDayMonth')}>· {t('members.noDayMonthShort')}</span>
                          </>
                        ) : '—'}
                        {isBirthdayMonth(m.birth_date) && <span className="ml-1" title={t('members.birthdayMonth')}>🎂</span>}
                      </td>
                      <td className="text-gray-300 whitespace-nowrap">
                        {m.joined_on ? (
                          <>
                            {my(m.joined_on)} <span className="text-gray-500 text-xs">· {tenureLabel(m.joined_on, t)}</span>
                          </>
                        ) : '—'}
                      </td>
                      <td className="text-gray-300">{m.dupr_level ?? '—'}</td>
                      <td className="text-gray-300">{m.member_type === 'fixed' ? t('members.fixed') : t('members.guest')}</td>
                      <td className="text-gray-300">{m.tier ? t(`members.${m.tier}`) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <MemberDetail club={club} member={detailMember} autoEdit={editing} onClose={() => { setDetailId(null); setEditing(false); }} onChanged={reload} />

      <Modal open={showAdd} title={t('members.newMember')} onClose={closeAdd}>
        <form onSubmit={addMember} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-400">{t('common.name')}</label>
            <input className="input" required autoFocus value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('members.gender')}</label>
            <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">—</option>
              <option value="male">{t('members.male')}</option>
              <option value="female">{t('members.female')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('members.birthDate')}</label>
            <input className="input" type="date" max={todayYmd()} value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('members.joinedMonth')}</label>
            <input className="input" type="month" value={form.joined_month} onChange={(e) => setForm({ ...form, joined_month: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('common.level')}</label>
            <input className="input" type="number" inputMode="decimal" step="0.01" min="1" max="8" value={form.dupr_level} onChange={(e) => setForm({ ...form, dupr_level: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('common.phone')}</label>
            <input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('members.type')}</label>
            <select
              className="input"
              value={form.member_type}
              onChange={(e) => setForm({ ...form, member_type: e.target.value, tier: e.target.value === 'fixed' ? form.tier : '' })}
            >
              <option value="fixed">{t('members.fixed')}</option>
              <option value="guest">{t('members.guest')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('members.tier')}</label>
            <select className="input" disabled={form.member_type !== 'fixed'} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
              <option value="">—</option>
              <option value="vip">{t('members.vip')}</option>
              <option value="standard">{t('members.standard')}</option>
            </select>
          </div>
          {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
          <div className="col-span-2 flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={closeAdd}>{t('common.cancel')}</button>
            <button className="btn-primary flex-1" disabled={busy}>{t('members.addMember')}</button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
