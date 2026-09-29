'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const emptyForm = { full_name: '', phone: '', dupr_level: '', member_type: 'fixed', tier: '', notes: '' };

export default function MembersPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data: members, loading, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve([])),
    [club?.id]
  );
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function addMember(e) {
    e.preventDefault();
    if (!club) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/members`, {
        ...form,
        dupr_level: form.dupr_level ? Number(form.dupr_level) : null,
        tier: form.tier || null,
      });
      setForm(emptyForm);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(m) {
    await api.patch(`/api/clubs/${club.id}/members/${m.id}`, { is_active: !m.is_active });
    reload();
  }

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('nav.members')}</h1>

      <form onSubmit={addMember} className="card mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-400">{t('common.name')}</label>
          <input className="input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('common.phone')}</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('common.level')}</label>
          <input className="input" type="number" step="0.01" value={form.dupr_level} onChange={(e) => setForm({ ...form, dupr_level: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">Type</label>
          <select className="input" value={form.member_type} onChange={(e) => setForm({ ...form, member_type: e.target.value })}>
            <option value="fixed">{t('members.fixed')}</option>
            <option value="guest">{t('members.guest')}</option>
          </select>
        </div>
        {form.member_type === 'fixed' && (
          <div>
            <label className="text-xs text-gray-400">Tier</label>
            <select className="input" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
              <option value="">—</option>
              <option value="vip">{t('members.vip')}</option>
              <option value="standard">{t('members.standard')}</option>
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-gray-400">{t('common.notes')}</label>
          <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="md:col-span-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <button className="btn-primary w-full sm:w-auto" disabled={busy || !club}>{t('members.addMember')}</button>
          {error && <span className="text-red-400 text-sm">{error}</span>}
        </div>
      </form>

      <div className="card">
        {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
        {!loading && (members || []).length === 0 && <p className="text-gray-400 text-sm">—</p>}
        <div className="table-wrap">
          <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left border-b border-navy-700">
              <th className="py-2">{t('common.name')}</th>
              <th>{t('common.phone')}</th>
              <th>{t('common.level')}</th>
              <th>Type</th>
              <th>Tier</th>
              <th>{t('common.notes')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(members || []).map((m) => (
              <tr key={m.id} className={`border-b border-navy-800 ${m.is_active ? '' : 'opacity-40'}`}>
                <td className="py-2 text-white">{m.full_name}</td>
                <td className="text-gray-300">{m.phone || '—'}</td>
                <td className="text-gray-300">{m.dupr_level ?? '—'}</td>
                <td className="text-gray-300">{m.member_type === 'fixed' ? t('members.fixed') : t('members.guest')}</td>
                <td className="text-gray-300">{m.tier ? t(`members.${m.tier}`) : '—'}</td>
                <td className="text-gray-300">{m.notes || '—'}</td>
                <td>
                  <button className="text-lime-400 text-xs" onClick={() => toggleActive(m)}>
                    {m.is_active ? t('common.delete') : t('common.edit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
