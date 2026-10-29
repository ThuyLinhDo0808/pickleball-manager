'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import PageHeader from '@/components/ui/PageHeader';
import Hint from '@/components/ui/Hint';
import EmptyState from '@/components/ui/EmptyState';
import LoadingBlock from '@/components/ui/LoadingBlock';
import ErrorBlock from '@/components/ui/ErrorBlock';
import UiIcon from '@/components/ui/UiIcon';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { CoachGate } from '@/components/coach/CoachGate';

const EMPTY = { name: '', sessions: 8, price: '', valid_months: 2, note: '', active: true };

// Gói buổi: "8 buổi · 1.600.000 đ · dùng trong 2 tháng". Students buy one (C5) and each
// attended session takes one credit (C4).
export default function CoachPackagesPage() {
  const { t } = useI18n();
  const { data, loading, error, reload } = useLoad(() => api.get('/api/coach/packages'), []);
  const [editing, setEditing] = useState(null); // null | 'new' | package
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const open = (p) => {
    setEditing(p || 'new');
    setF(p ? { name: p.name, sessions: p.sessions, price: p.price, valid_months: p.valid_months, note: p.note || '', active: p.active } : EMPTY);
    setMsg('');
  };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const body = { ...f, sessions: Number(f.sessions), price: Number(f.price || 0), valid_months: Number(f.valid_months), note: f.note.trim() || null };
    try {
      if (editing === 'new') await api.post('/api/coach/packages', body);
      else await api.patch(`/api/coach/packages/${editing.id}`, body);
      setEditing(null);
      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(p) {
    if (!window.confirm(t('coach.pkgDeleteAsk', { name: p.name }))) return;
    try {
      await api.del(`/api/coach/packages/${p.id}`);
      reload();
    } catch (err) {
      window.alert(err.message);
    }
  }
  const list = data || [];
  return (
    <AppShell>
      <CoachGate error={error} reload={reload}>
        <PageHeader
          icon="plans"
          title={t('coach.packages')}
          subtitle={t('coach.packagesLead')}
          hint={<Hint inline text={t('coach.packagesHint')} />}
          actions={<button type="button" className="btn-primary" onClick={() => open(null)}>+ {t('coach.pkgNew')}</button>}
        />
        {loading && !data && <LoadingBlock rows={3} className="card" />}
        {error && <ErrorBlock message={error.message} onRetry={reload} />}
        {data && list.length === 0 && (
          <EmptyState title={t('coach.pkgEmpty')} action={<button type="button" className="btn-primary" onClick={() => open(null)}>+ {t('coach.pkgNew')}</button>}>
            {t('coach.pkgEmptyHint')}
          </EmptyState>
        )}
        {list.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((p) => (
              <div key={p.id} className={`card flex flex-col gap-2 ${p.active ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-white font-semibold break-words">{p.name}</h2>
                  {!p.active && <span className="text-[11px] rounded-full bg-navy-700 text-gray-300 px-2 py-0.5 whitespace-nowrap">{t('coach.pkgOff')}</span>}
                </div>
                <p className="text-lime-400 text-xl font-bold tabular-nums">{formatVnd(p.price)}</p>
                <p className="text-gray-300 text-sm">{t('coach.pkgLine', { n: p.sessions, m: p.valid_months })}</p>
                {p.note && <p className="text-gray-400 text-xs break-words">{p.note}</p>}
                <div className="flex justify-end gap-2 mt-auto pt-1">
                  <button type="button" className="btn-secondary text-sm" onClick={() => open(p)}>{t('common.edit')}</button>
                  <button type="button" className="text-red-300 hover:text-red-200 text-sm px-2 min-h-[44px]" onClick={() => remove(p)}>{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Modal open={!!editing} title={editing === 'new' ? t('coach.pkgNew') : t('coach.pkgEdit')} onClose={() => setEditing(null)}>
          {editing && (
            <form onSubmit={save} className="grid gap-3">
              <div>
                <label className="text-xs text-gray-400">{t('coach.pkgName')}</label>
                <input className="input" required maxLength={80} value={f.name} onChange={set('name')} placeholder={t('coach.pkgNamePh')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">{t('coach.pkgSessions')}</label>
                  <input className="input" type="number" min="1" max="200" required value={f.sessions} onChange={set('sessions')} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">{t('coach.pkgMonths')}</label>
                  <input className="input" type="number" min="1" max="24" required value={f.valid_months} onChange={set('valid_months')} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('coach.pkgPrice')}</label>
                <input className="input" type="number" inputMode="numeric" min="0" step="1000" required value={f.price} onChange={set('price')} />
              </div>
              <div>
                <label className="text-xs text-gray-400">{t('fin.note')}</label>
                <input className="input" maxLength={300} value={f.note} onChange={set('note')} placeholder={t('coach.pkgNotePh')} />
              </div>
              {editing !== 'new' && (
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={!!f.active} onChange={set('active')} /> {t('coach.pkgActive')}
                </label>
              )}
              {msg && <p className="text-red-300 text-sm">{msg}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
                <button className="btn-primary" disabled={busy}>{t('common.save')}</button>
              </div>
            </form>
          )}
        </Modal>
      </CoachGate>
    </AppShell>
  );
}
