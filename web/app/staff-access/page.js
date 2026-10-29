'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { todayYmd } from '@/lib/dates';
import { dmy } from '@/lib/memberDates';
import { useWorkspace } from '@/context/WorkspaceContext';
import { planFor, hasFeature, lockedNotice } from '@/lib/planFeatures';
import Hint from '@/components/ui/Hint';
import UiIcon from '@/components/ui/UiIcon';
import ChipRow from '@/components/ui/ChipRow';

const ROLES = ['coordinator', 'referee', 'co_admin', 'finance', 'operator'];
// Roles given from now on (Trọng tài and Vận hành are no longer offered; old grants keep showing).
const GRANT_ROLES = ['coordinator', 'co_admin', 'finance'];
// Roles that are always for one club; Finance / Operations need the Advanced plan.
const CLUB_ONLY = ['co_admin', 'finance', 'operator'];
const PLAN_ROLES = ['finance', 'operator'];
// Permission groups for custom permissions (Pro) and each role's defaults (backend services/clubRoles.js).
const PERM_GROUPS = ['members', 'events', 'matches', 'rankings', 'inventory', 'finance_view', 'finance_edit'];
const ROLE_GROUPS = { finance: ['finance_view', 'finance_edit'], operator: ['members', 'events', 'matches', 'rankings', 'inventory'] };
const ROLE_STYLE = {
  coordinator: { icon: 'clipboard', chip: 'border-sky-400/50 text-sky-300 bg-sky-400/10' },
  referee: { icon: 'flag', chip: 'border-lime-400/50 text-lime-300 bg-lime-400/10' },
  co_admin: { icon: 'shield', chip: 'border-amber-400/60 text-amber-300 bg-amber-400/10' },
  finance: { icon: 'money', chip: 'border-emerald-400/50 text-emerald-300 bg-emerald-400/10' },
  operator: { icon: 'user', chip: 'border-navy-600 text-gray-200 bg-navy-700' },
};
// What each role can do (rows) — shown as a small table.
const CAN = [
  ['checkIn', { coordinator: true, referee: false, co_admin: true, finance: false, operator: true }],
  ['scores', { coordinator: true, referee: true, co_admin: true, finance: false, operator: true }],
  ['eventOps', { coordinator: false, referee: false, co_admin: true, finance: false, operator: false }],
  ['openClose', { coordinator: false, referee: false, co_admin: true, finance: false, operator: true }],
  ['balls', { coordinator: false, referee: false, co_admin: true, finance: false, operator: true }],
  ['schedule', { coordinator: false, referee: false, co_admin: true, finance: false, operator: false }],
  ['members', { coordinator: false, referee: false, co_admin: true, finance: false, operator: false }],
  ['deleteMembers', { coordinator: false, referee: false, co_admin: false, finance: false, operator: false }],
  ['finance', { coordinator: false, referee: false, co_admin: false, finance: true, operator: false }],
  ['plans', { coordinator: false, referee: false, co_admin: false, finance: true, operator: false }],
  ['dupr', { coordinator: false, referee: false, co_admin: false, finance: false, operator: false }],
  ['settings', { coordinator: false, referee: false, co_admin: false, finance: false, operator: false }],
  ['deleteClub', { coordinator: false, referee: false, co_admin: false, finance: false, operator: false }],
];
// Where the access applies.
const emptyForm = { email: '', full_name: '', role: 'coordinator', scope: 'all', club_id: '', event_id: '', valid_from: '', valid_until: '' };

function status(g, today) {
  if (g.valid_until && g.valid_until < today) return ['expired', 'text-red-300 border-red-500/40'];
  if (g.valid_from && g.valid_from > today) return ['later', 'text-amber-300 border-amber-400/40'];
  return ['active', 'text-lime-300 border-lime-400/40'];
}

export default function StaffAccessPage() {
  const { t } = useI18n();
  const { clubs: allClubs } = useClubs();
  const clubs = allClubs.filter((c) => !c.role || c.role === 'owner'); // only clubs I own can be shared
  // Every grant is for the club / community picked in the menu (no "Áp dụng cho" choice).
  const { club: current } = useDefaultClub();
  const target = clubs.find((c) => c.id === current?.id) || null;
  const { plan } = useWorkspace();
  const rolesLocked = !hasFeature(planFor(null, plan), 'staff_roles');
  const customLocked = !hasFeature(planFor(null, plan), 'custom_roles');
  const [perms, setPerms] = useState(null); // { id, email, role, groups }
  const [permErr, setPermErr] = useState('');
  function openPerms(g) {
    if (customLocked) return lockedNotice('custom_roles', 'pro');
    setPermErr('');
    setPerms({ id: g.id, email: g.email, role: g.role, groups: g.permissions?.length ? g.permissions : ROLE_GROUPS[g.role] });
  }
  async function savePerms(reset = false) {
    try {
      const same = !reset && [...perms.groups].sort().join() === [...ROLE_GROUPS[perms.role]].sort().join();
      await api.patch(`/api/staff-grants/${perms.id}`, { permissions: reset || same ? [] : perms.groups });
      setPerms(null);
      reload();
    } catch (err) {
      setPermErr(err.message);
    }
  }
  const { data: grants, loading, reload } = useLoad(() => api.get('/api/staff-grants'), []);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const today = todayYmd();
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const isCo = CLUB_ONLY.includes(form.role);

  function pickRole(r) {
    // Finance / Operations need the Advanced plan.
    if (PLAN_ROLES.includes(r) && rolesLocked) return lockedNotice('staff_roles', 'advanced');
    // A co-admin / Finance / Operations person is always for one club.
    set({ role: r, ...(CLUB_ONLY.includes(r) ? { scope: 'club', club_id: form.club_id || clubs[0]?.id || '' } : {}) });
  }

  function scopeLabel(g) {
    if (g.event_id) return t('staff.scopeEvent', { title: g.events?.title || '?', date: g.events?.event_date ? dmy(g.events.event_date) : '' });
    if (g.club_id) return CLUB_ONLY.includes(g.role) ? t('coadmin.scopeClub', { name: g.clubs?.name || '?' }) : t('staff.scopeClub', { name: g.clubs?.name || '?' });
    return t(`staffX.scope_${g.scope || 'all'}`);
  }

  async function grant(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/staff-grants', {
        email: form.email,
        full_name: form.full_name,
        role: form.role,
        scope: 'all',
        club_id: target?.id || null,
        event_id: null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
      });
      setForm({ ...emptyForm, role: form.role });
      reload();
    } catch (err) {
      setError(err.payload?.code === 'co_admin_needs_club' ? t('coadmin.needsClub') : err.payload?.code === 'bad_window' ? t('staffX.badWindow') : err.message);
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

  async function saveDates(e) {
    e.preventDefault();
    try {
      await api.patch(`/api/staff-grants/${editing.id}`, { valid_from: editing.valid_from || '', valid_until: editing.valid_until || '' });
      setEditing(null);
      reload();
    } catch (err) {
      window.alert(err.payload?.code === 'bad_window' ? t('staffX.badWindow') : err.message);
    }
  }

  async function revoke(g) {
    if (!window.confirm(t('staff.removeConfirm', { email: g.email }))) return;
    await api.del(`/api/staff-grants/${g.id}`);
    reload();
  }

  const list = (grants || []).filter((g) => filter === 'all' || g.role === filter);
  const counts = Object.fromEntries(ROLES.map((r) => [r, (grants || []).filter((g) => g.role === r).length]));
  const scopeReady = !!target;
  // Role counts: the roles offered, plus an old one while someone still holds it.
  const shown = ROLES.filter((r) => GRANT_ROLES.includes(r) || counts[r] > 0);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-white text-2xl font-bold">{t('staff.title')}</h1>
          <p className="text-gray-400 text-sm max-w-2xl">{t('staffX.lead')}</p>
        </div>
        <div className="flex gap-2">
          {shown.map((r) => (
            <div key={r} className="rounded-xl border border-navy-700 bg-navy-900 px-3 py-2 text-center min-w-[5.5rem]">
              <div className="text-white font-bold tabular-nums">{counts[r]}</div>
              <div className="text-gray-400 text-xs">{t(`staff.${r}`)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem] mb-6">
        {/* Grant form */}
        <form onSubmit={grant} className="card !p-5 flex flex-col gap-5">
          <h2 className="text-white font-semibold">{t('staffX.newGrant')}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="sg-email" className="text-xs text-gray-400">{t('staff.email')}</label>
              <input id="sg-email" className="input" type="email" required autoComplete="off" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div>
              <label htmlFor="sg-name" className="text-xs text-gray-400">{t('staff.name')}</label>
              <input id="sg-name" className="input" value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} />
            </div>
          </div>

          <fieldset>
            <legend className="text-xs text-gray-400 mb-1.5">1. {t('staff.role')}</legend>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {GRANT_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={form.role === r}
                  disabled={CLUB_ONLY.includes(r) && !clubs.length}
                  onClick={() => pickRole(r)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-40 ${form.role === r ? 'border-lime-400 bg-lime-400/10' : 'border-navy-600 hover:border-navy-500'}`}
                >
                  <div className={`text-sm font-semibold ${form.role === r ? 'text-lime-300' : 'text-white'}`}><UiIcon name={ROLE_STYLE[r].icon} className="inline-block w-4 h-4 mr-1.5 -mt-0.5 text-gray-400" />{t(`staff.${r}`)}{PLAN_ROLES.includes(r) && rolesLocked && <span className="ml-1 text-[11px]" title={t('plan.locked')}><UiIcon name="gem" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></span>}</div>
                  <div className="text-gray-400 text-xs mt-0.5">{t(`staff.${r}Desc`)}</div>
                </button>
              ))}
            </div>
          </fieldset>

          <p className="rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-gray-200">
            {target ? <>{t('staffX.forClub', { name: target.name })}</> : <span className="text-amber-200">{t('staffX.pickClubMenu')}</span>}
            {isCo && <span className="block text-sky-300 text-xs mt-1">{t('coadmin.grantNote')}</span>}
          </p>

          <fieldset>
            <legend className="text-xs text-gray-400 mb-1.5">2. {t('staffX.window')}</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="sg-from" className="text-xs text-gray-500">{t('staffX.from')}</label>
                <input id="sg-from" className="input" type="date" value={form.valid_from} onChange={(e) => set({ valid_from: e.target.value })} />
              </div>
              <div>
                <label htmlFor="sg-until" className="text-xs text-gray-500">{t('staffX.until')}</label>
                <input id="sg-until" className="input" type="date" min={form.valid_from || undefined} value={form.valid_until} onChange={(e) => set({ valid_until: e.target.value })} />
              </div>
            </div>
            <Hint text={t('staffX.windowHint')} className="mt-1" />
          </fieldset>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1 border-t border-navy-700">
            <p className="text-gray-500 text-xs flex-1 pt-3">{isCo ? t('coadmin.verifyNote') : t('staff.verifyNote')}</p>
            <button className="btn-primary sm:mt-3" disabled={busy || !scopeReady}>{t('staff.add')}</button>
          </div>
          {error && <p className="text-red-400 text-sm -mt-2">{error}</p>}
        </form>

        {/* What each role can do */}
        <aside className="card !p-5 h-fit">
          <h2 className="text-white font-semibold mb-3">{t('staffX.matrix')}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs">
                <th className="text-left font-normal pb-2" />
                {GRANT_ROLES.map((r) => (
                  <th key={r} className="font-normal pb-2 text-center" title={t(`staff.${r}`)}><UiIcon name={ROLE_STYLE[r].icon} className="w-4 h-4 mx-auto text-gray-400" /><span className="sr-only">{t(`staff.${r}`)}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAN.map(([k, by]) => (
                <tr key={k} className="border-t border-navy-700">
                  <td className="py-2 text-gray-200">{t(`staffX.can_${k}`)}</td>
                  {GRANT_ROLES.map((r) => (
                    <td key={r} className={`text-center ${by[r] ? 'text-lime-400' : 'text-gray-600'}`}>{by[r] ? '✓' : '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <Hint text={t('staffX.matrixNote')} className="mt-3" />
        </aside>
      </div>

      {/* Granted people */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-white font-semibold">{t('staffX.people', { n: (grants || []).length })}</h2>
        <ChipRow gap="gap-1.5" className="text-sm">
          {['all', ...shown].map((r) => (
            <button key={r} onClick={() => setFilter(r)} className={`rounded-full border px-3 py-1 whitespace-nowrap ${filter === r ? 'border-lime-400 bg-lime-400/15 text-lime-200 font-semibold' : 'border-navy-600 text-gray-300 hover:text-white'}`}>
              {r === 'all' ? t('staffX.allRoles') : t(`staff.${r}`)}
            </button>
          ))}
        </ChipRow>
      </div>
      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && list.length === 0 && <p className="card text-gray-400 text-sm">{t('staff.none')}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((g) => {
          const [st, stTone] = status(g, today);
          return (
            <div key={g.id} className="card !p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <span className="h-10 w-10 shrink-0 rounded-full bg-navy-700 text-lime-300 font-bold flex items-center justify-center">
                  {(g.full_name || g.email).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-white font-semibold break-all">{g.full_name || g.email}</div>
                  {g.full_name && <div className="text-gray-400 text-xs break-all">{g.email}</div>}
                </div>
                <span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 shrink-0 ${ROLE_STYLE[g.role]?.chip}`}>
                  {t(`staff.${g.role}`)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-lg bg-navy-900 px-2 py-1 text-gray-200">{scopeLabel(g)}</span>
                {PLAN_ROLES.includes(g.role) && g.permissions?.length > 0 && (
                  <span className="rounded-lg border border-amber-300/50 bg-amber-300/10 px-2 py-1 text-amber-200" title={g.permissions.map((x) => t(`perms.g_${x}`)).join(', ')}>
                    {t('perms.custom', { n: g.permissions.length })}
                  </span>
                )}
                <span className={`rounded-lg border px-2 py-1 ${stTone}`}>
                  {t(`staffX.st_${st}`)}
                  {g.valid_from || g.valid_until
                    ? ` · ${g.valid_from ? dmy(g.valid_from) : '…'} → ${g.valid_until ? dmy(g.valid_until) : '…'}`
                    : ` · ${t('staffX.noLimit')}`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-navy-700">
                <select className="input text-sm !w-auto !py-1.5" value={g.role} onChange={(e) => changeRole(g, e.target.value)} aria-label={t('staff.role')}>
                  {ROLES.filter((r) => GRANT_ROLES.includes(r) || r === g.role).map((r) => (
                    <option key={r} value={r} disabled={CLUB_ONLY.includes(r) && !g.club_id}>{t(`staff.${r}`)}</option>
                  ))}
                </select>
                <button type="button" className="btn-secondary text-sm !py-1.5" onClick={() => setEditing({ id: g.id, email: g.email, valid_from: g.valid_from || '', valid_until: g.valid_until || '' })}>
                  {t('staffX.editDates')}
                </button>
                {PLAN_ROLES.includes(g.role) && (
                  <button type="button" className="btn-secondary text-sm !py-1.5" onClick={() => openPerms(g)}>
                    {t('perms.button')}{customLocked && <span className="ml-1 text-[11px]"><UiIcon name="gem" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></span>}
                  </button>
                )}
                <button type="button" className="text-red-400 text-sm px-2 ml-auto hover:text-red-300" onClick={() => revoke(g)}>{t('staff.remove')}</button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!perms} title={`${t('perms.title')}`} onClose={() => setPerms(null)}>
        {perms && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-300 text-sm">{perms.email} · {t(`staff.${perms.role}`)}</p>
            <Hint text={t('perms.hint')} />
            <ul className="flex flex-col gap-1.5">
              {PERM_GROUPS.map((gname) => (
                <li key={gname}>
                  <label className="flex items-start gap-2 rounded-lg border border-navy-700 px-3 py-2 cursor-pointer hover:border-navy-500">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={perms.groups.includes(gname)}
                      onChange={(e) => setPerms({ ...perms, groups: e.target.checked ? [...perms.groups, gname] : perms.groups.filter((x) => x !== gname) })}
                    />
                    <span>
                      <span className="text-white text-sm font-semibold">{t(`perms.g_${gname}`)}</span>
                      {ROLE_GROUPS[perms.role].includes(gname) && <span className="ml-2 text-[10px] text-gray-400">{t('perms.default')}</span>}
                      <span className="block text-gray-400 text-xs">{t(`perms.h_${gname}`)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-gray-500 text-xs">{t('perms.never')}</p>
            {permErr && <p className="text-red-300 text-sm">{permErr}</p>}
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" className="btn-secondary text-sm mr-auto" onClick={() => savePerms(true)}>↺ {t('perms.reset')}</button>
              <button type="button" className="btn-secondary text-sm" onClick={() => setPerms(null)}>{t('common.cancel')}</button>
              <button type="button" className="btn-primary text-sm" disabled={!perms.groups.length} onClick={() => savePerms(false)}>{t('common.save')}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!editing} title={t('staffX.editDates')} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={saveDates} className="flex flex-col gap-3">
            <p className="text-gray-300 text-sm">{editing.email}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ed-from" className="text-xs text-gray-400">{t('staffX.from')}</label>
                <input id="ed-from" className="input" type="date" value={editing.valid_from} onChange={(e) => setEditing({ ...editing, valid_from: e.target.value })} />
              </div>
              <div>
                <label htmlFor="ed-until" className="text-xs text-gray-400">{t('staffX.until')}</label>
                <input id="ed-until" className="input" type="date" value={editing.valid_until} onChange={(e) => setEditing({ ...editing, valid_until: e.target.value })} />
              </div>
            </div>
            <Hint text={t('staffX.windowHint')} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <button className="btn-primary">{t('common.save')}</button>
            </div>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}
