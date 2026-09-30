'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const ROLES = ['coordinator', 'referee', 'co_admin'];
const emptyForm = { email: '', full_name: '', role: 'coordinator', scope: 'all' };

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function StaffAccessPage() {
  const { t } = useI18n();
  const { clubs: allClubs } = useClubs();
  const clubs = allClubs.filter((c) => c.role !== 'co_admin'); // only clubs I own can be shared
  const { data: grants, loading, reload } = useLoad(() => api.get('/api/staff-grants'), []);
  const { data: events } = useLoad(() => api.get('/api/events'), []);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upcoming = (events || []).filter((e) => e.event_date >= todayYmd() && e.status !== 'cancelled');
  const isCo = form.role === 'co_admin';

  function pickRole(r) {
    // A co-admin is always for one club: switch the scope to a club if needed.
    const scope = r === 'co_admin' && !form.scope.startsWith('club:') ? (clubs[0] ? `club:${clubs[0].id}` : '') : form.scope;
    setForm({ ...form, role: r, scope });
  }

  function scopeLabel(g) {
    if (g.event_id) return t('staff.scopeEvent', { title: g.events?.title || '?', date: g.events?.event_date || '' });
    if (g.club_id && g.role === 'co_admin') return t('coadmin.scopeClub', { name: g.clubs?.name || '?' });
    if (g.club_id) return t('staff.scopeClub', { name: g.clubs?.name || '?' });
    return t('staff.scopeAll');
  }

  async function grant(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const [kind, id] = form.scope.split(':');
    try {
      await api.post('/api/staff-grants', {
        email: form.email,
        full_name: form.full_name,
        role: form.role,
        club_id: kind === 'club' ? id : null,
        event_id: kind === 'event' ? id : null,
      });
      setForm({ ...emptyForm, role: form.role });
      reload();
    } catch (err) {
      setError(err.payload?.code === 'co_admin_needs_club' ? t('coadmin.needsClub') : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(g, role) {
    try {
      await api.patch(`/api/staff-grants/${g.id}`, { role });
    } catch (err) {
      window.alert(err.payload?.code === 'co_admin_needs_club' ? t('coadmin.needsClub') : err.message);
    }
    reload();
  }

  async function revoke(g) {
    if (!window.confirm(t('staff.removeConfirm', { email: g.email }))) return;
    await api.del(`/api/staff-grants/${g.id}`);
    reload();
  }

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-1">{t('staff.title')}</h1>
      <p className="text-gray-400 text-sm mb-4">{t('staff.hint')}</p>

      <form onSubmit={grant} className="card mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400">{t('staff.email')}</label>
          <input className="input" type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('staff.name')}</label>
          <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('staff.role')}</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                disabled={r === 'co_admin' && !clubs.length}
                onClick={() => pickRole(r)}
                className={`rounded-lg border px-3 py-2 text-left ${form.role === r ? 'border-lime-400 bg-lime-400/10' : 'border-navy-700'}`}
              >
                <div className={`text-sm font-semibold ${form.role === r ? 'text-lime-400' : 'text-white'}`}>{t(`staff.${r}`)}</div>
                <div className="text-gray-400 text-xs">{t(`staff.${r}Desc`)}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('staff.scope')}</label>
          <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
            {!isCo && <option value="all">{t('staff.scopeAll')}</option>}
            {clubs.map((c) => (
              <option key={c.id} value={`club:${c.id}`}>{isCo ? t('coadmin.scopeClub', { name: c.name }) : t('staff.scopeClub', { name: c.name })}</option>
            ))}
            {!isCo &&
              upcoming.map((ev) => (
                <option key={ev.id} value={`event:${ev.id}`}>{t('staff.scopeEvent', { title: ev.title, date: ev.event_date })}</option>
              ))}
          </select>
          {isCo && <p className="text-sky-300 text-xs mt-1">{t('coadmin.grantNote')}</p>}
        </div>
        <p className="md:col-span-2 text-gray-500 text-xs">{isCo ? t('coadmin.verifyNote') : t('staff.verifyNote')}</p>
        <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3">
          <button className="btn-primary w-full sm:w-auto" disabled={busy}>{t('staff.add')}</button>
          {error && <span className="text-red-400 text-sm">{error}</span>}
        </div>
      </form>

      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && (grants || []).length === 0 && <p className="text-gray-400 text-sm">{t('staff.none')}</p>}
      <div className="flex flex-col gap-3">
        {(grants || []).map((g) => (
          <div key={g.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-white font-semibold truncate">{g.full_name || g.email}</div>
              {g.full_name && <div className="text-gray-400 text-xs truncate">{g.email}</div>}
              <div className="text-gray-400 text-xs mt-1">{scopeLabel(g)}</div>
            </div>
            <div className="flex items-center gap-2">
              <select className="input text-sm !w-auto" value={g.role} onChange={(e) => changeRole(g, e.target.value)} aria-label={t('staff.role')}>
                {ROLES.map((r) => (
                  <option key={r} value={r} disabled={r === 'co_admin' && !g.club_id}>{t(`staff.${r}`)}</option>
                ))}
              </select>
              <button className="text-red-400 text-sm px-2" onClick={() => revoke(g)}>{t('staff.remove')}</button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
