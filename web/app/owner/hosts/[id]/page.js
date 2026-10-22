'use client';
import { useEffect, useState } from 'react';
import DeleteClub from '@/components/OwnerDeleteClub';
import OwnerMfaReset from '@/components/OwnerMfaReset';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import OwnerShell, { fmtDate, fmtTime, TIER_BADGE, useOwnerMe, consoleCan } from '@/components/OwnerShell';
import { AuditRow } from '@/components/OwnerAudit';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api, startViewAs } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import Hint from '@/components/ui/Hint';
import AddonSwitches from '@/components/owner/AddonSwitches';
import UiIcon from '@/components/ui/UiIcon';

const TIERS = ['free', 'basic', 'standard', 'advanced', 'pro'];

// Plan, end dates, Social Manager and gift months, in one form: one block per product
// (Club Manager, Social Manager), a preview of what will change, the reason, Save.
const PAID = TIERS.filter((x) => x !== 'free');
const EXTEND = [1, 2, 3, 6, 12];
const todayYmd = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
function addMonthsYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
const dmy = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '—');
const money = (v) => Number(String(v || '').replace(/\D/g, '')) || 0;

function StatusPill({ on, until }) {
  const { t } = useI18n();
  let cls = 'border-navy-500 text-gray-400';
  let text = t('owner.st_none');
  if (on) {
    if (!until) {
      cls = 'border-lime-400/50 text-lime-300';
      text = t('owner.st_noEnd');
    } else {
      const days = Math.round((Date.parse(until) - Date.parse(todayYmd())) / 86400000);
      if (days < 0) {
        cls = 'border-red-400/60 text-red-300';
        text = t('owner.st_expired', { date: dmy(until) });
      } else {
        cls = days <= 7 ? 'border-amber-300/60 text-amber-200' : 'border-lime-400/50 text-lime-300';
        text = t('owner.st_daysLeft', { n: days, date: dmy(until) });
      }
    }
  }
  return <span className={`text-[11px] rounded-full border px-2 py-0.5 whitespace-nowrap ${cls}`}>{text}</span>;
}

function TierChips({ value, options, onChange, disabled, label }) {
  const { t } = useI18n();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((x) => (
        <button
          key={x}
          type="button"
          role="radio"
          aria-checked={value === x}
          disabled={disabled}
          onClick={() => onChange(x)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold tracking-wide transition disabled:opacity-40 ${value === x ? 'border-lime-400 bg-lime-400/10 text-lime-300' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
        >
          {x === 'free' ? t('owner.f_free') : x.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// One product: plan, end date, quick extension, money received.
function ProductBlock({ icon, title, on, current, tier, tierOptions, onTier, until, onUntil, months, onMonths, paid, onPaid, newEnd, disabled, toggle, offHint }) {
  const { t } = useI18n();
  const L = 'block text-gray-400 text-xs font-medium mb-1.5';
  return (
    <section className="rounded-xl border border-navy-700 bg-navy-900/40">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-navy-700">
        <UiIcon name={icon} className="w-5 h-5 text-gray-400" />
        <h3 className="text-white font-semibold">{title}</h3>
        <StatusPill on={current.on} until={current.until} />
        {toggle && <span className="ml-auto">{toggle}</span>}
      </header>
      {on ? (
        <div className="p-4 grid gap-4 md:grid-cols-2">
          <div>
            <span className={L}>{t('owner.fTier')}</span>
            <TierChips value={tier} options={tierOptions} onChange={onTier} label={t('owner.fTier')} />
          </div>
          <label className="block">
            <span className={L}>{t('owner.fUntil')}</span>
            <input className="input text-sm" type="date" value={disabled ? '' : until} disabled={disabled || !!months} onChange={(e) => onUntil(e.target.value)} />
            <span className="block text-gray-500 text-[11px] mt-1">{months ? t('owner.untilByExtend') : t('owner.noEndHint')}</span>
          </label>
          <div>
            <span className={L}>{t('owner.fExtend')}</span>
            <div className="flex flex-wrap gap-1.5">
              {EXTEND.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  aria-pressed={Number(months) === n}
                  onClick={() => onMonths(Number(months) === n ? '' : String(n))}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs tabular-nums transition disabled:opacity-40 ${Number(months) === n ? 'border-sky-400 bg-sky-400/10 text-sky-200' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
                >
                  +{n} {t('owner.months')}
                </button>
              ))}
            </div>
            {newEnd && <span className="block text-sky-200 text-xs mt-1.5">→ {t('owner.newEnd', { date: dmy(newEnd) })}</span>}
          </div>
          <label className="block">
            <span className={L}>{t('owner.fPaid')}</span>
            <span className="relative block">
              <input className="input text-sm !pr-8 tabular-nums" inputMode="numeric" value={paid} disabled={disabled} onChange={(e) => onPaid(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm" aria-hidden="true">đ</span>
            </span>
            <span className="block text-gray-500 text-[11px] mt-1">{money(paid) ? t('owner.paidAsRevenue') : t('owner.paidEmptyGift')}</span>
          </label>
        </div>
      ) : (
        <p className="px-4 py-3 text-gray-400 text-sm">{offHint}</p>
      )}
    </section>
  );
}

function PlanEditor({ host, onSaved }) {
  const { t } = useI18n();
  const blank = () => ({
    tier: host.tier,
    tier_paid_until: host.tier_paid_until || '',
    add_months: '',
    social_manager: host.social_manager,
    sm_tier: host.sm_tier || 'basic',
    social_manager_paid_until: host.social_manager_paid_until || '',
    sm_add_months: '',
    paid_amount: '',
    sm_paid_amount: '',
    note: '',
  });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => setF(blank()), [host.tier, host.tier_paid_until, host.social_manager, host.sm_tier, host.social_manager_paid_until]); // eslint-disable-line react-hooks/exhaustive-deps
  const put = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  // What Save sends (same rules as before).
  const body = { note: f.note };
  if (f.tier !== host.tier) body.tier = f.tier;
  if ((f.tier_paid_until || null) !== (host.tier_paid_until || null) && f.tier !== 'free') body.tier_paid_until = f.tier_paid_until || null;
  if (f.add_months && f.tier !== 'free') body.add_months = Number(f.add_months);
  if (f.social_manager !== host.social_manager) body.social_manager = f.social_manager;
  if (f.social_manager && f.sm_tier !== (host.sm_tier || 'basic')) body.sm_tier = f.sm_tier;
  if (f.social_manager && (f.social_manager_paid_until || null) !== (host.social_manager_paid_until || null)) body.social_manager_paid_until = f.social_manager_paid_until || null;
  if (f.social_manager && f.sm_add_months) body.sm_add_months = Number(f.sm_add_months);
  const changed = Object.keys(body).length > 1;
  if (changed && f.tier !== 'free' && money(f.paid_amount)) body.paid_amount = money(f.paid_amount);
  if (changed && f.social_manager && money(f.sm_paid_amount)) body.sm_paid_amount = money(f.sm_paid_amount);
  const total = (body.paid_amount || 0) + (body.sm_paid_amount || 0);

  // Preview of the new end dates (the server computes the same way).
  const today = todayYmd();
  const extendFrom = (cur) => (cur && cur >= today ? cur : today);
  const tierEnd = body.add_months ? addMonthsYmd(extendFrom(f.tier_paid_until || host.tier_paid_until), body.add_months) : null;
  const smEnd = body.sm_add_months ? addMonthsYmd(extendFrom(f.social_manager_paid_until || host.social_manager_paid_until), body.sm_add_months) : null;

  const changes = [];
  if (body.tier) changes.push(t('owner.ch_tier', { from: host.tier === 'free' ? t('owner.f_free') : host.tier.toUpperCase(), to: body.tier === 'free' ? t('owner.f_free') : body.tier.toUpperCase() }));
  if (tierEnd) changes.push(t('owner.ch_extend', { what: 'Club Manager', n: body.add_months, date: dmy(tierEnd) }));
  else if ('tier_paid_until' in body) changes.push(t('owner.ch_until', { what: 'Club Manager', date: body.tier_paid_until ? dmy(body.tier_paid_until) : t('owner.st_noEnd') }));
  if ('social_manager' in body) changes.push(body.social_manager ? t('owner.ch_smOn') : t('owner.ch_smOff'));
  if (body.sm_tier) changes.push(t('owner.ch_smTier', { to: body.sm_tier.toUpperCase() }));
  if (smEnd) changes.push(t('owner.ch_extend', { what: 'Social Manager', n: body.sm_add_months, date: dmy(smEnd) }));
  else if ('social_manager_paid_until' in body) changes.push(t('owner.ch_until', { what: 'Social Manager', date: body.social_manager_paid_until ? dmy(body.social_manager_paid_until) : t('owner.st_noEnd') }));

  async function save(e) {
    e.preventDefault();
    if (!changed) return setMsg(t('owner.nothingChanged'));
    if (!window.confirm(total ? t('owner.saveAskPaid', { amount: total.toLocaleString('vi-VN') }) : t('owner.saveAskGift'))) return;
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

  const smSwitch = (
    <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-gray-300">
      {f.social_manager ? t('owner.smOn') : t('owner.smOff')}
      <input type="checkbox" role="switch" className="sr-only peer" checked={f.social_manager} onChange={(e) => put('social_manager')(e.target.checked)} aria-label="Social Manager" />
      <span className="relative w-9 h-5 rounded-full bg-navy-600 peer-checked:bg-amber-300 transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-lime-400" />
    </label>
  );

  return (
    <form onSubmit={save} className="card !p-4 flex flex-col gap-4">
      <div>
        <h2 className="text-white font-semibold">{t('owner.planTitle')} <Hint inline text={t('owner.planHint')} /></h2>
      </div>

      <ProductBlock
        icon="court"
        title="Club Manager"
        on
        current={{ on: host.tier !== 'free', until: host.tier_paid_until }}
        tier={f.tier}
        tierOptions={TIERS}
        onTier={(v) => setF((x) => ({ ...x, tier: v, ...(v === 'free' ? { add_months: '', paid_amount: '' } : {}) }))}
        until={f.tier_paid_until}
        onUntil={put('tier_paid_until')}
        months={f.add_months}
        onMonths={put('add_months')}
        paid={f.paid_amount}
        onPaid={put('paid_amount')}
        newEnd={tierEnd}
        disabled={f.tier === 'free'}
      />
      <ProductBlock
        icon="ticket"
        title="Social Manager"
        on={f.social_manager}
        current={{ on: host.social_manager, until: host.social_manager_paid_until }}
        tier={f.sm_tier}
        tierOptions={PAID}
        onTier={put('sm_tier')}
        until={f.social_manager_paid_until}
        onUntil={put('social_manager_paid_until')}
        months={f.sm_add_months}
        onMonths={put('sm_add_months')}
        paid={f.sm_paid_amount}
        onPaid={put('sm_paid_amount')}
        newEnd={smEnd}
        toggle={smSwitch}
        offHint={t('owner.smOffHint')}
      />

      <p className="text-gray-500 text-xs flex gap-2"><span aria-hidden="true"><UiIcon name="info" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></span><span>{t('owner.paidAmountHint')}</span></p>

      <div className="rounded-xl border border-navy-700 bg-navy-900/40 p-4 flex flex-col gap-3">
        <div>
          <p className="text-gray-400 text-xs font-medium mb-1">{t('owner.changesTitle')}</p>
          {changes.length ? (
            <ul className="text-sm text-gray-100 list-disc pl-5 space-y-0.5">
              {changes.map((c) => <li key={c}>{c}</li>)}
              <li className={total ? 'text-lime-300' : 'text-gray-400'}>{total ? t('owner.ch_paid', { amount: total.toLocaleString('vi-VN') }) : t('owner.ch_gift')}</li>
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">{t('owner.nothingChanged')}</p>
          )}
        </div>
        <label className="block">
          <span className="block text-gray-400 text-xs font-medium mb-1.5">{t('owner.reason')}</span>
          <input className="input text-sm" value={f.note} onChange={(e) => put('note')(e.target.value)} maxLength={300} placeholder={t('owner.reasonPh')} />
        </label>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {msg && <span className="text-sm text-gray-300 mr-auto" role="status">{msg}</span>}
          {changed && <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => { setF(blank()); setMsg(''); }}>{t('owner.reset')}</button>}
          <button className="btn-primary text-sm" disabled={busy || !changed}>{busy ? t('common.loading') : t('owner.savePlan')}</button>
        </div>
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
      <h2 className="text-white font-semibold mb-1">{t('owner.suspendTitle')}</h2>
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
      <h2 className="text-white font-semibold mb-2">{t('owner.notesTitle')}</h2>
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
        <span className="text-gray-200 truncate">
          {club.name}
          {club.kind === 'community' && <span className="ml-1.5 text-[10px] rounded-full border border-amber-300/60 text-amber-200 px-1.5 py-0.5 align-middle">{t('creq.kind_community')}</span>}
        </span>
        <span className="text-gray-400 text-xs">{t('owner.placesLine', { fixed: place(r?.fixed), guest: place(r?.guest) })} · {fmtDate(club.created_at)}</span>
      </div>
      <div className="flex gap-3 mt-1 text-xs">
        {consoleCan(me, 'plans') && <button type="button" className="text-sky-300 hover:underline" onClick={() => setMode(mode === 'addon' ? null : 'addon')}>{t('owner.addonBtn')}</button>}
        {me?.owner && <button type="button" className="text-amber-300 hover:underline" onClick={() => setMode(mode === 'transfer' ? null : 'transfer')}>{t('owner.transferBtn')}</button>}
        {me?.owner && <button type="button" className="text-red-300 hover:underline ml-auto" onClick={() => setMode(mode === 'delete' ? null : 'delete')}>{t('owner.delClubBtn')}</button>}
      </div>
      {mode === 'delete' && <DeleteClub club={club} onDone={() => { setMode(null); onChanged(); }} />}
      {mode && mode !== 'delete' && (
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
      <h2 className="text-white font-semibold mb-1">{t('owner.rolesTitle')}</h2>
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
      {t('owner.viewAs')}
    </button>
  );
}

// Tính năng theo Host: paid features switched on for this Host only.
function HostAddons({ hostId }) {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get(`/api/owner/hosts/${hostId}/addons`), [hostId]);
  return (
    <div className="card !p-4">
      <h2 className="text-white font-semibold mb-1">{t('addons.hostTitle')}</h2>
      <p className="text-gray-400 text-xs mb-2">{t('addons.hostHint')}</p>
      {error ? <p className="text-amber-200 text-xs">{error.message}</p> : data ? <AddonSwitches hostId={hostId} value={data} onChanged={reload} /> : <p className="text-gray-500 text-sm">{t('common.loading')}</p>}
    </div>
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
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TIER_BADGE[h.tier]}`}>{h.tier}{h.tier !== 'free' && h.tier_paid_until ? ` → ${fmtDate(h.tier_paid_until)}` : ''}</span>
              {h.billing === 'paying' && <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-lime-400/15 text-lime-200" title={t('owner.billPayingHint')}>{t('owner.billPaying')}</span>}
              {h.billing === 'gifted' && <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-violet-300/20 text-violet-200" title={t('owner.billGiftedHint')}>{t('owner.billGifted')}</span>}
              {h.social_manager && <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-amber-300/20 text-amber-200">SM {String(h.sm_tier || 'basic').toUpperCase()}{h.social_manager_paid_until ? ` → ${fmtDate(h.social_manager_paid_until)}` : ''}</span>}
              {h.suspended_at ? <span className="rounded-full px-2.5 py-1 text-xs font-bold bg-red-500/20 text-red-200">{t('owner.suspended')}</span> : <span className="rounded-full px-2.5 py-1 text-xs bg-lime-400/15 text-lime-200">● {t('owner.active')}</span>}
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
            <div className="flex flex-col gap-4">
              <Gate owner><SuspendBox host={h} onChanged={reload} /></Gate>
              <Gate owner><HostAddons hostId={h.id} /></Gate>
              <Gate owner><OwnerMfaReset host={h} onChanged={reload} /></Gate>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <Notes host={h} notes={data.notes} onChanged={reload} />
            <div className="card !p-4">
              <h2 className="text-white font-semibold mb-2">{t('owner.clubsTitle')}</h2>
              {data.clubs.length === 0 ? (
                <p className="text-gray-500 text-sm">{t('owner.noClubs')}</p>
              ) : (
                <ul className="divide-y divide-navy-700">
                  {data.clubs.map((c) => <ClubRow key={c.id} club={c} onChanged={reload} />)}
                </ul>
              )}
              <h2 className="text-white font-semibold mt-4 mb-2">{t('owner.ordersTitle')}</h2>
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
            <h2 className="text-white font-semibold mb-1">{t('owner.tabAudit')}</h2>
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
