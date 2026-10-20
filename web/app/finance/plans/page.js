'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import Modal from '@/components/Modal';
import Hint from '@/components/ui/Hint';

const emptyForm = { name: '', period: 'month', price: '', sessions_included: '8', validity_months: '' };
// Social Manager (communities): a plan is a session pack — name, sessions, price, validity
// (e.g. "VIP 1": 10 sessions within 6 months for 300,000đ). Clubs keep month / quarter / year.
const packForm = { name: '', price: '', sessions_included: '10', validity_months: '6' };

export default function PlansPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const packs = club?.kind === 'community';
  const { data: plans, loading, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/plans`) : Promise.resolve([])),
    [club?.id]
  );
  const [form, setForm] = useState(emptyForm);
  const blank = packs ? packForm : emptyForm;
  const f = packs && form === emptyForm ? packForm : form; // communities start from the pack defaults
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/plans`, {
        name: f.name,
        price: Number(f.price || 0),
        sessions_included: Number(f.sessions_included || 0),
        ...(packs ? { validity_months: Number(f.validity_months) } : { period: f.period }),
      });
      setForm(blank);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Edit a plan in a modal. Periods already registered keep their dates and price.
  const [editing, setEditing] = useState(null);
  const [editErr, setEditErr] = useState('');
  async function saveEdit(e) {
    e.preventDefault();
    setBusy(true);
    setEditErr('');
    try {
      await api.patch(`/api/clubs/${club.id}/plans/${editing.id}`, {
        name: editing.name,
        price: Number(editing.price || 0),
        sessions_included: Number(editing.sessions_included || 0),
        ...(editing.validity_months ? { validity_months: Number(editing.validity_months) } : { period: editing.period }),
      });
      setEditing(null);
      reload();
    } catch (err) {
      setEditErr(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p) {
    await api.patch(`/api/clubs/${club.id}/plans/${p.id}`, { is_active: !p.is_active });
    reload();
  }

  return (
    <>
      <Modal open={!!editing} title={t('plans.editTitle')} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={saveEdit} className="flex flex-col gap-3">
            <div>
              <label htmlFor="pe-name" className="text-xs text-gray-400">{t('plans.name')}</label>
              <input id="pe-name" className="input" required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {editing.validity_months ? (
                <div className="min-w-0">
                  <label htmlFor="pe-valid" className="text-xs text-gray-400">{t('plans.validity')}</label>
                  <input id="pe-valid" className="input" required type="number" inputMode="numeric" min="1" max="36" value={editing.validity_months} onChange={(e) => setEditing({ ...editing, validity_months: e.target.value })} />
                </div>
              ) : (
                <div className="min-w-0">
                  <label htmlFor="pe-period" className="text-xs text-gray-400">{t('plans.period')}</label>
                  <select id="pe-period" className="input" value={editing.period} onChange={(e) => setEditing({ ...editing, period: e.target.value })}>
                    {['month', 'quarter', 'year'].map((p) => (
                      <option key={p} value={p}>{t(`plans.${p}`)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="min-w-0">
                <label htmlFor="pe-price" className="text-xs text-gray-400">{t('plans.price')}</label>
                <input id="pe-price" className="input" required type="number" inputMode="numeric" min="0" step="1" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </div>
              <div className="min-w-0">
                <label htmlFor="pe-sessions" className="text-xs text-gray-400">{t(editing.validity_months ? 'plans.packSessions' : 'plans.sessions')}</label>
                <input id="pe-sessions" className="input" type="number" inputMode="numeric" min={editing.validity_months ? 1 : 0} required={!!editing.validity_months} value={editing.sessions_included} onChange={(e) => setEditing({ ...editing, sessions_included: e.target.value })} />
              </div>
            </div>
            <p className="text-gray-500 text-xs">{editing.validity_months ? t('plans.packHint') : `${t('plans.sessionsHint')}.`}<br />{t('plans.editHint')}</p>
            {editErr && <p className="text-red-400 text-sm">{editErr}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={busy}>{t('common.save')}</button>
            </div>
          </form>
        )}
      </Modal>

      {packs ? (
        <form onSubmit={create} className="card !p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="col-span-2 md:col-span-4 -mb-1">
            <h2 className="text-white font-semibold">✨ {t('finX.newPlan')} <Hint inline text={t('plans.packLead')} /></h2>
          </div>
          <div className="col-span-2 md:col-span-4">
            <label htmlFor="pk-name" className="text-xs text-gray-400">1. {t('plans.name')}</label>
            <input id="pk-name" className="input" required placeholder={t('plans.packNamePh')} value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="pk-sessions" className="text-xs text-gray-400">2. {t('plans.packSessions')}</label>
            <input id="pk-sessions" className="input" required type="number" inputMode="numeric" min="1" value={f.sessions_included} onChange={(e) => setForm({ ...f, sessions_included: e.target.value })} />
          </div>
          <div>
            <label htmlFor="pk-price" className="text-xs text-gray-400">3. {t('plans.price')}</label>
            <input id="pk-price" className="input" required type="number" inputMode="numeric" min="0" step="1000" placeholder="300000" value={f.price} onChange={(e) => setForm({ ...f, price: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label htmlFor="pk-valid" className="text-xs text-gray-400">4. {t('plans.validity')}</label>
            <input id="pk-valid" className="input" required type="number" inputMode="numeric" min="1" max="36" value={f.validity_months} onChange={(e) => setForm({ ...f, validity_months: e.target.value })} />
          </div>
          <p className="col-span-2 md:col-span-4 text-sm text-lime-200">
            {f.name || t('plans.packNamePh')}: {t('plans.packSummary', { n: f.sessions_included || 0, m: f.validity_months || 0, price: formatVnd(Number(f.price || 0)) })}
            {Number(f.sessions_included) > 0 && Number(f.price) > 0 && <span className="text-gray-400"> · {t('finX.perSession', { v: formatVnd(Math.round(Number(f.price) / Number(f.sessions_included))) })}</span>}
          </p>
          <div className="col-span-2 flex flex-col sm:flex-row sm:items-center gap-3">
            <button className="btn-primary w-full sm:w-auto" disabled={busy || !club}>{t('plans.add')}</button>
            {error && <span className="text-red-400 text-sm">{error}</span>}
          </div>
        </form>
      ) : (
        <form onSubmit={create} className="card !p-5 mb-6 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div className="col-span-2 md:col-span-5 -mb-1">
            <h2 className="text-white font-semibold">✨ {t('finX.newPlan')} <Hint inline text={t('finX.newPlanHint')} /></h2>
          </div>
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
            <input className="input" required type="number" inputMode="numeric" min="0" step="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
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
      )}

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && (plans || []).length === 0 && <p className="text-gray-400 text-sm">{t('plans.none')}</p>}
      {(plans || []).length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">🎫 {t('finX.plansList', { n: (plans || []).filter((p) => p.is_active).length })}</h2>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {(plans || []).map((p) => {
          const pack = !!p.validity_months;
          const stars = pack ? 1 : { month: 1, quarter: 2, year: 3 }[p.period] || 1;
          const months = pack ? p.validity_months : { month: 1, quarter: 3, year: 12 }[p.period] || 1;
          const perSession = p.sessions_included ? Math.round(Number(p.price) / p.sessions_included) : null;
          return (
          <div key={p.id} className={`card !p-0 overflow-hidden flex flex-col ${p.is_active ? '' : 'opacity-50'}`}>
            <div className={`px-5 pt-5 pb-4 bg-gradient-to-br ${stars === 3 ? 'from-amber-400/20' : stars === 2 ? 'from-sky-400/20' : 'from-lime-400/15'} to-transparent`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-amber-300 text-xs" aria-hidden="true">{'⭐'.repeat(stars)} VIP</div>
                  <div className="text-white font-semibold text-lg break-words">{p.name}</div>
                  <div className="text-gray-400 text-xs">{pack ? t('plans.packShort', { n: p.sessions_included, m: p.validity_months }) : t(`plans.${p.period}`)}</div>
                </div>
                <span className={`text-[11px] rounded-full px-2 py-0.5 shrink-0 ${p.is_active ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-700 text-gray-300'}`}>
                  {p.is_active ? t('plans.active') : t('plans.inactive')}
                </span>
              </div>
              <div className="text-white text-3xl font-bold mt-3 tabular-nums">{formatVnd(p.price)}</div>
              <div className="text-gray-400 text-xs">{pack ? t('plans.packValid', { m: p.validity_months }) : t('finX.perPeriod', { n: months })}</div>
            </div>
            <ul className="px-5 py-3 text-sm text-gray-200 flex flex-col gap-1.5 border-t border-navy-700">
              <li>✅ {p.sessions_included ? t('plans.sessionsN', { n: p.sessions_included }) : t('plans.unlimited')}</li>
              {perSession != null && <li>💵 {t('finX.perSession', { v: formatVnd(perSession) })}</li>}
              {pack ? <li>⏳ {t('plans.packValidLine', { m: p.validity_months })}</li> : <li>📆 {t('finX.perMonth', { v: formatVnd(Math.round(Number(p.price) / months)) })}</li>}
            </ul>
            <div className="grid grid-cols-2 gap-2 px-5 pb-5 mt-auto">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  setEditErr('');
                  setEditing({ id: p.id, name: p.name, period: p.period, price: String(Number(p.price)), sessions_included: String(p.sessions_included ?? 0), validity_months: p.validity_months ? String(p.validity_months) : '' });
                }}
              >
                ✏️ {t('plans.edit')}
              </button>
              <button type="button" className="btn-secondary text-sm" onClick={() => toggle(p)}>
                {p.is_active ? t('plans.stop') : t('plans.resume')}
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </>
  );
}
