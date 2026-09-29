'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

const emptyForm = { name: '', period: 'month', price: '', sessions_included: '8' };

export default function PlansPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data: plans, loading, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/plans`) : Promise.resolve([])),
    [club?.id]
  );
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/plans`, {
        ...form,
        price: Number(form.price || 0),
        sessions_included: Number(form.sessions_included || 0),
      });
      setForm(emptyForm);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p) {
    await api.patch(`/api/clubs/${club.id}/plans/${p.id}`, { is_active: !p.is_active });
    reload();
  }

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('plans.title')}</h1>

      <form onSubmit={create} className="card mb-6 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div className="col-span-2">
          <label className="text-xs text-gray-400">{t('plans.name')}</label>
          <input className="input" required placeholder={t('plans.namePh')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('plans.period')}</label>
          <select className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
            {['month', 'quarter', 'year'].map((p) => (
              <option key={p} value={p}>{t(`plans.${p}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('plans.price')}</label>
          <input className="input" required type="number" inputMode="numeric" min="0" step="1000" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('plans.sessions')}</label>
          <input className="input" type="number" inputMode="numeric" min="0" value={form.sessions_included} onChange={(e) => setForm({ ...form, sessions_included: e.target.value })} />
        </div>
        <p className="col-span-2 md:col-span-3 text-gray-500 text-xs">{t('plans.sessionsHint')}</p>
        <div className="col-span-2 flex flex-col sm:flex-row sm:items-center gap-3">
          <button className="btn-primary w-full sm:w-auto" disabled={busy || !club}>{t('plans.add')}</button>
          {error && <span className="text-red-400 text-sm">{error}</span>}
        </div>
      </form>

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && (plans || []).length === 0 && <p className="text-gray-400 text-sm">{t('plans.none')}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(plans || []).map((p) => (
          <div key={p.id} className={`card ${p.is_active ? '' : 'opacity-50'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-white font-semibold truncate">{p.name}</div>
                <div className="text-gray-400 text-xs">{t(`plans.${p.period}`)}</div>
              </div>
              <span className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${p.is_active ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-700 text-gray-300'}`}>
                {p.is_active ? t('plans.active') : t('plans.inactive')}
              </span>
            </div>
            <div className="text-lime-400 text-2xl font-bold mt-3">{formatVnd(p.price)}</div>
            <div className="text-gray-300 text-sm">
              {p.sessions_included ? t('plans.sessionsN', { n: p.sessions_included }) : t('plans.unlimited')}
            </div>
            <button className="btn-secondary text-sm mt-3 w-full" onClick={() => toggle(p)}>
              {p.is_active ? t('plans.stop') : t('plans.resume')}
            </button>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
