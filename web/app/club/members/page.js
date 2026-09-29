'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import MemberDetail, { FLAG_STYLE } from '@/components/MemberDetail';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const emptyForm = { full_name: '', gender: '', birth_year: '', dupr_level: '', member_type: 'fixed', tier: '', phone: '' };

function SessionsCell({ m, t }) {
  if (m.membership_state === 'active') {
    return m.sessions_unlimited ? (
      <span className="text-lime-400">∞</span>
    ) : (
      <span className={`font-semibold ${m.sessions_remaining > 0 ? 'text-lime-400' : 'text-red-400'}`}>{m.sessions_remaining}</span>
    );
  }
  if (m.membership_state === 'unpaid') return <span className="text-yellow-400 text-xs">{t('membership.pending')}</span>;
  if (m.membership_state === 'expired') return <span className="text-gray-500 text-xs">{t('membership.state_expired')}</span>;
  return <span className="text-gray-600">—</span>;
}

export default function MembersPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data: members, loading, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve([])),
    [club?.id]
  );
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [detailId, setDetailId] = useState(null);

  const rows = members || [];
  const detailMember = rows.find((m) => m.id === detailId) || null;
  const allSelected = rows.length > 0 && selected.length === rows.length;

  function closeAdd() {
    setShowAdd(false);
    setForm(emptyForm);
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
        birth_year: form.birth_year ? Number(form.birth_year) : null,
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
          {t('nav.members')} {rows.length > 0 && <span className="text-gray-400 text-base font-normal">({rows.length})</span>}
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

      <div className="card">
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
                    <th>{t('members.birthYear')}</th>
                    <th>{t('common.level')}</th>
                    <th>{t('members.type')}</th>
                    <th>{t('members.tier')}</th>
                    <th className="text-center">{t('members.sessionsLeft')}</th>
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
                            setDetailId(m.id);
                          }}
                        >
                          {m.full_name}
                        </button>
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
                      <td className="text-gray-300">{m.birth_year ?? '—'}</td>
                      <td className="text-gray-300">{m.dupr_level ?? '—'}</td>
                      <td className="text-gray-300">{m.member_type === 'fixed' ? t('members.fixed') : t('members.guest')}</td>
                      <td className="text-gray-300">{m.tier ? t(`members.${m.tier}`) : '—'}</td>
                      <td className="text-center">
                        <SessionsCell m={m} t={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <MemberDetail club={club} member={detailMember} onClose={() => setDetailId(null)} onChanged={reload} />

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
            <label className="text-xs text-gray-400">{t('members.birthYear')}</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min="1900"
              max={new Date().getFullYear()}
              placeholder="1995"
              value={form.birth_year}
              onChange={(e) => setForm({ ...form, birth_year: e.target.value })}
            />
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
