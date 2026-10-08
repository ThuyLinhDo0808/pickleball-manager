'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import OwnerShell, { fmtDate, fmtTime, TIER_BADGE, useOwnerMe, consoleCan } from '@/components/OwnerShell';
import { AuditRow } from '@/components/OwnerAudit';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api, startViewAs } from '@/lib/api';
import { formatVnd } from '@/lib/format';

const TIERS = ['free', 'basic', 'standard', 'advanced', 'pro'];

// Plan, end dates, Social Manager and gift months, in one form.
function PlanEditor({ host, onSaved }) {
  const { t } = useI18n();
  const blank = () => ({
    tier: host.tier,
    tier_paid_until: host.tier_paid_until || '',
    add_months: '',
    social_manager: host.social_manager,
    social_manager_paid_until: host.social_manager_paid_until || '',
    sm_add_months: '',
    note: '',
  });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => setF(blank()), [host.tier, host.tier_paid_until, host.social_manager, host.social_manager_paid_until]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    const body = { note: f.note };
    if (f.tier !== host.tier) body.tier = f.tier;
    if ((f.tier_paid_until || null) !== (host.tier_paid_until || null) && f.tier !== 'free') body.tier_paid_until = f.tier_paid_until || null;
    if (f.add_months) body.add_months = Number(f.add_months);
    if (f.social_manager !== host.social_manager) body.social_manager = f.social_manager;
    if (f.social_manager && (f.social_manager_paid_until || null) !== (host.social_manager_paid_until || null)) body.social_manager_paid_until = f.social_manager_paid_until || null;
    if (f.sm_add_months) body.sm_add_months = Number(f.sm_add_months);
    if (Object.keys(body).length === 1) return setMsg(t('owner.nothingChanged'));
    if (!window.confirm(t('owner.saveAsk'))) return;
    setBusy(true);
    setMsg('');
    try {
      await api.patch(`/api/owner/hosts/${host.id}/subscription`, body);
      setMsg(t('owner.saved'));
      onSaved();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const L = 'block text-gray-400 text-xs mb-1';
  return (
    <form onSubmit={save} className="card !p-4">
      <h2 className="text-white font-semibold mb-3">💎 {t('owner.planTitle')}</h2>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block">
          <span className={L}>{t('owner.field_tier')}</span>
          <select className="input text-sm" value={f.tier} onChange={set('tier')}>
            {TIERS.map((x) => <option key={x} value={x}>{x.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={L}>{t('owner.field_tier_paid_until')}</span>
          <input className="input text-sm" type="date" value={f.tier === 'free' ? '' : f.tier_paid_until} disabled={f.tier === 'free'} onChange={set('tier_paid_until')} />
          <span className="text-gray-500 text-[11px]">{t('owner.noEndHint')}</span>
        </label>
        <label className="block">
          <span className={L}>{t('owner.giftMonths')}</span>
          <select className="input text-sm" value={f.add_months} disabled={f.tier === 'free'} onChange={set('add_months')}>
            <option value="">—</option>
            {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>+{n} {t('owner.months')}</option>)}
          </select>
        </label>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-navy-700">
        <label className="flex items-center gap-2 text-sm text-gray-200 sm:mt-5">
          <input type="checkbox" checked={f.social_manager} onChange={set('social_manager')} className="h-4 w-4 accent-amber-300" />
          🎟 Social Manager
        </label>
        <label className="block">
          <span className={L}>{t('owner.field_social_manager_paid_until')}</span>
          <input className="input text-sm" type="date" value={f.social_manager ? f.social_manager_paid_until : ''} disabled={!f.social_manager} onChange={set('social_manager_paid_until')} />
        </label>
        <label className="block">
          <span className={L}>{t('owner.giftMonthsSm')}</span>
          <select className="input text-sm" value={f.sm_add_months} onChange={set('sm_add_months')}>
            <option value="">—</option>
            {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>+{n} {t('owner.months')}</option>)}
          </select>
        </label>
      </div>
      <label className="block mt-3">
        <span className={L}>{t('owner.reason')}</span>
        <input className="input text-sm" value={f.note} onChange={set('note')} maxLength={300} placeholder={t('owner.reasonPh')} />
      </label>
      <div className="flex items-center justify-between gap-2 mt-3">
        <span className="text-sm text-gray-300">{msg}</span>
        <button className="btn-primary text-sm" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  );
}

function SuspendBox({ host, onChanged }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function act() {
    setMsg('');
    let body = {};
    if (!host.suspended_at) {
      const reason = window.prompt(t('owner.suspendAsk'));
      if (!reason || !reason.trim()) return;
      body = { reason: reason.trim() };
    } else if (!window.confirm(t('owner.unsuspendAsk'))) return;
    setBusy(true);
    try {
      await api.post(`/api/owner/hosts/${host.id}/${host.suspended_at ? 'unsuspend' : 'suspend'}`, body);
      onChanged();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`card !p-4 ${host.suspended_at ? 'border-red-400/50' : ''}`}>
      <h2 className="text-white font-semibold mb-1">⛔ {t('owner.suspendTitle')}</h2>
      {host.suspended_at ? (
        <p className="text-red-200 text-sm mb-3">{t('owner.suspendedSince', { at: fmtTime(host.suspended_at) })}<br /><i>“{host.suspended_reason}”</i></p>
      ) : (
        <p className="text-gray-400 text-sm mb-3">{t('owner.suspendHint')}</p>
      )}
      {host.is_owner ? (
        <p className="text-gray-500 text-xs">{t('owner.ownerCannot')}</p>
      ) : (
        <button type="button" className={host.suspended_at ? 'btn-primary text-sm' : 'btn-secondary text-sm !border-red-400/60 !text-red-200'} disabled={busy} onClick={act}>
          {host.suspended_at ? t('owner.unsuspend') : t('owner.suspend')}
        </button>
      )}
      {msg && <p className="text-red-300 text-xs mt-2">{msg}</p>}
    </div>
  );
}

function Notes({ host, notes, onChanged }) {
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  async function add(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/owner/hosts/${host.id}/notes`, { body });
      setBody('');
      onChanged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card !p-4">
      <h2 className="text-white font-semibold mb-2">📝 {t('owner.notesTitle')}</h2>
      <form onSubmit={add} className="flex flex-col gap-2 mb-3">
        <textarea className="input text-sm min-h-[70px]" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder={t('owner.notePh')} />
        <button className="btn-secondary text-sm self-end" disabled={busy || !body.trim()}>{t('owner.addNote')}</button>
      </form>
      {notes.length === 0 ? (
        <p className="text-gray-500 text-sm">{t('owner.noNotes')}</p>
      ) : (
        <ul className="divide-y divide-navy-700">
          {notes.map((n) => (
            <li key={n.id} className="py-2">
              <p className="text-gray-200 text-sm whitespace-pre-wrap">{n.body}</p>
              <p className="text-gray-500 text-[11px] mt-0.5">{fmtTime(n.created_at)} · {n.author_email}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One club of the host: members vs places (plan + extra licence), grant extra places,
// hand the club to another account.
function ClubRow({ club, onChanged }) {
  const { t } = useI18n();
  const me = useOwnerMe();
  const [mode, setMode] = useState(null); // 'addon' | 'transfer'
  const [fixed, setFixed] = useState(club.room?.fixed?.extra ?? 0);
  const [guest, setGuest] = useState(club.room?.guest?.extra ?? 0);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const r = club.room;
  const place = (x) => (x ? `${x.used}/${x.limit ?? '∞'}${x.extra ? ` (+${x.extra})` : ''}` : '—');
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      if (mode === 'addon') {
        await api.patch(`/api/owner/clubs/${club.id}/member-addon`, { extra_fixed_members: Number(fixed) || 0, extra_guest_members: Number(guest) || 0, note });
      } else {
        if (!window.confirm(t('owner.transferAsk', { club: club.name, email }))) return setBusy(false);
        await api.post(`/api/owner/clubs/${club.id}/transfer`, { email, note });
      }
      setMode(null);
      setNote('');
      onChanged();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-gray-200 truncate">{club.sport === 'badminton' ? '🏸' : '🏓'} {club.name}</span>
        <span className="text-gray-400 text-xs">{t('owner.placesLine', { fixed: place(r?.fixed), guest: place(r?.guest) })} · {fmtDate(club.created_at)}</span>
      </div>
      <div className="flex gap-3 mt-1 text-xs">
        {consoleCan(me, 'plans') && <button type="button" className="text-sky-300 hover:underline" onClick={() => setMode(mode === 'addon' ? null : 'addon')}>➕ {t('owner.addonBtn')}</button>}
        {me?.owner && <button type="button" className="text-amber-300 hover:underline" onClick={() => setMode(mode === 'transfer' ? null : 'transfer')}>🔁 {t('owner.transferBtn')}</button>}
      </div>
      {mode && (
        <form onSubmit={save} className="mt-2 rounded-lg border border-navy-600 p-2 flex flex-col gap-2">
          {mode === 'addon' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-400">{t('owner.extraFixed')}<input className="input text-sm mt-0.5" type="number" min="0" value={fixed} onChange={(e) => setFixed(e.target.value)} /></label>
              <label className="text-xs text-gray-400">{t('owner.extraGuest')}<input className="input text-sm mt-0.5" type="number" min="0" value={guest} onChange={(e) => setGuest(e.target.value)} /></label>
            </div>
          ) : (
            <label className="text-xs text-gray-400">{t('owner.newOwnerEmail')}<input className="input text-sm mt-0.5" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@…" /></label>
          )}
          <input className="input text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'addon' ? t('owner.addonNotePh') : t('owner.transferNotePh')} maxLength={300} />
          {mode === 'transfer' && <p className="text-gray-500 text-[11px]">{t('owner.transferHint')}</p>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-red-300 text-xs">{msg}</span>
            <button className="btn-primary !py-1 text-xs" disabled={busy}>{t('common.save')}</button>
          </div>
        </form>
      )}
    </li>
  );
}

const ROLE_BADGE = { co_admin: 'bg-violet-400/20 text-violet-200', finance: 'bg-emerald-400/20 text-emerald-200', operator: 'bg-sky-400/20 text-sky-200' };

// Who helps run the host's clubs, by club: role + email, and seats used per role.
function StaffRoles({ staff, clubs }) {
  const { t } = useI18n();
  const clubStaff = staff.filter((g) => g.club_id);
  const other = staff.length - clubStaff.length;
  return (
    <div className="card !p-4">
      <h2 className="text-white font-semibold mb-1">🧑‍💼 {t('owner.rolesTitle')}</h2>
      <p className="text-gray-500 text-xs mb-3">{t('owner.rolesHint')}{other > 0 ? ` · ${t('owner.eventStaffN', { n: other })}` : ''}</p>
      {clubStaff.length === 0 ? (
        <p className="text-gray-500 text-sm">{t('owner.noRoles')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {clubs.filter((c) => clubStaff.some((g) => g.club_id === c.id)).map((c) => {
            const mine = clubStaff.filter((g) => g.club_id === c.id);
            const used = (r) => mine.filter((g) => g.role === r).length;
            return (
              <div key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-gray-200 text-sm font-semibold">{c.name}</span>
                  <span className="text-gray-500 text-xs">
                    {['finance', 'operator'].map((r) => `${t(`staff.${r}`)} ${used(r)}`).join(' · ')}
                  </span>
                </div>
                <ul className="mt-1 divide-y divide-navy-800">
                  {mine.map((g) => (
                    <li key={g.id} className="py-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-300 truncate">{g.full_name ? `${g.full_name} · ` : ''}{g.email}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE[g.role] || 'bg-navy-700 text-gray-300'}`}>{t(`staff.${g.role}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The page's body (inside OwnerShell, so it knows who is using the console).
function ViewAsButton({ host }) {
  const { t } = useI18n();
  const me = useOwnerMe();
  if (!consoleCan(me, 'view_as')) return null;
  return (
    <button
      type="button"
      className="btn-secondary !py-1 text-xs"
      title={t('owner.viewAsHint')}
      onClick={() => { if (window.confirm(t('owner.viewAsAsk', { email: host.email }))) { startViewAs(host); window.location.href = '/home'; } }}
    >
      👁 {t('owner.viewAs')}
    </button>
  );
}

function Gate({ perm, owner = false, children }) {
  const me = useOwnerMe();
  return (owner ? me?.owner : consoleCan(me, perm)) ? children : null;
}

export default function OwnerHostPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const { data, error, reload } = useLoad(() => api.get(`/api/owner/hosts/${id}`), [id]);
  const h = data?.host;

  return (
    <OwnerShell>
      <Link href="/owner/hosts" className="text-gray-400 text-sm hover:text-white">← {t('owner.tabHosts')}</Link>
      {error && <p className="card text-red-300 text-sm mt-3">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm mt-3">{t('common.loading')}</p>}
      {h && (
        <div className="flex flex-col gap-4 mt-3">
          <div className="card !p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white truncate">{h.full_name || h.email}</h1>
              <p className="text-gray-400 text-sm break-all">{h.email}{h.phone ? ` · ${h.phone}` : ''}</p>
              <p className="text-gray-500 text-xs mt-1">{t('owner.joined', { at: fmtDate(h.created_at) })} · {t('owner.lastSeen', { at: fmtTime(h.last_sign_in_at) })}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${TIER_BADGE[h.tier]}`}>{h.tier}{h.tier_paid_until ? ` → ${fmtDate(h.tier_paid_until)}` : ''}</span>
              {h.social_manager && <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-amber-300/20 text-amber-200">SM{h.social_manager_paid_until ? ` → ${fmtDate(h.social_manager_paid_until)}` : ''}</span>}
              {h.suspended_at ? <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-red-500/20 text-red-200">⛔ {t('owner.suspended')}</span> : <span className="rounded-full px-2.5 py-1 text-xs bg-lime-400/15 text-lime-200">● {t('owner.active')}</span>}
              <ViewAsButton host={h} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="card !p-3"><div className="text-gray-400 text-xs">{t('owner.colClubs')}</div><div className="text-white font-bold tabular-nums">{h.clubs_owned}/{h.club_limit ?? '∞'}</div></div>
            <div className="card !p-3"><div className="text-gray-400 text-xs">{t('owner.colPeople')}</div><div className="text-white font-bold tabular-nums">{h.people_used}/{h.people_limit}</div></div>
            <div className="card !p-3"><div className="text-gray-400 text-xs">{t('owner.xeveGames')}</div><div className="text-white font-bold tabular-nums">{h.xeve_games}</div></div>
          </div>

          <div className="grid lg:grid-cols-[2fr_1fr] gap-4 items-start">
            <Gate perm="plans"><PlanEditor host={h} onSaved={reload} /></Gate>
            <Gate owner><SuspendBox host={h} onChanged={reload} /></Gate>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <Notes host={h} notes={data.notes} onChanged={reload} />
            <div className="card !p-4">
              <h2 className="text-white font-semibold mb-2">🏠 {t('owner.clubsTitle')}</h2>
              {data.clubs.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('owner.noClubs')}</p>
              ) : (
                <ul className="divide-y divide-navy-700">
                  {data.clubs.map((c) => <ClubRow key={c.id} club={c} onChanged={reload} />)}
                </ul>
              )}
              <h2 className="text-white font-semibold mt-4 mb-2">💳 {t('owner.ordersTitle')}</h2>
              {data.orders.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('owner.noOrders')}</p>
              ) : (
                <ul className="divide-y divide-navy-700">
                  {data.orders.map((o) => (
                    <li key={o.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-gray-200"><span className="font-mono text-lime-300">{o.ref}</span> · {o.kind === 'tier' ? String(o.tier).toUpperCase() : 'SM'} · {o.months} {t('owner.months')}</span>
                      <span className="text-xs text-gray-400">{formatVnd(o.amount)} · {t(`admin.st_${o.status}`)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <StaffRoles staff={data.staff || []} clubs={data.clubs} />

          <div className="card !p-4">
            <h2 className="text-white font-semibold mb-1">📜 {t('owner.tabAudit')}</h2>
            {data.audit.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('owner.noAudit')}</p>
            ) : (
              <ul className="divide-y divide-navy-700">{data.audit.map((r) => <AuditRow key={r.id} row={r} showTarget={false} onChanged={reload} />)}</ul>
            )}
          </div>
        </div>
      )}
    </OwnerShell>
  );
}
