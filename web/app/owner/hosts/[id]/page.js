'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import OwnerShell, { fmtDate, fmtTime, TIER_BADGE } from '@/components/OwnerShell';
import { AuditRow } from '@/components/OwnerAudit';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
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
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="card !p-3"><div className="text-gray-400 text-xs">{t('owner.colClubs')}</div><div className="text-white font-bold tabular-nums">{h.clubs_owned}/{h.club_limit ?? '∞'}</div></div>
            <div className="card !p-3"><div className="text-gray-400 text-xs">{t('owner.colPeople')}</div><div className="text-white font-bold tabular-nums">{h.people_used}/{h.people_limit}</div></div>
            <div className="card !p-3"><div className="text-gray-400 text-xs">{t('owner.xeveGames')}</div><div className="text-white font-bold tabular-nums">{h.xeve_games}</div></div>
          </div>

          <div className="grid lg:grid-cols-[2fr_1fr] gap-4 items-start">
            <PlanEditor host={h} onSaved={reload} />
            <SuspendBox host={h} onChanged={reload} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <Notes host={h} notes={data.notes} onChanged={reload} />
            <div className="card !p-4">
              <h2 className="text-white font-semibold mb-2">🏠 {t('owner.clubsTitle')}</h2>
              {data.clubs.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('owner.noClubs')}</p>
              ) : (
                <ul className="divide-y divide-navy-700">
                  {data.clubs.map((c) => (
                    <li key={c.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-200 truncate">{c.sport === 'badminton' ? '🏸' : '🏓'} {c.name}</span>
                      <span className="text-gray-400 text-xs shrink-0">{t('owner.nMembers', { n: c.members })} · {fmtDate(c.created_at)}</span>
                    </li>
                  ))}
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
