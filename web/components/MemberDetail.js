'use client';
import { levelTag } from '@/lib/levels';
import LevelInput from '@/components/LevelInput';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import VipBadge from '@/components/VipBadge';
import { MemberExtraFields } from '@/components/MemberExtras';
import { GuestPerkBadge } from '@/components/GuestColumns';
import MemberHistory from '@/components/MemberHistory';
import { dmy, missingInfo, my, tenureLabel } from '@/lib/memberDates';
import BirthInput, { birthFromMember, birthPayload } from '@/components/BirthInput';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd, thisMonth } from '@/lib/format';
import { todayYmd } from '@/lib/dates';
import MemberLink from '@/components/MemberLink';
import Hint from '@/components/ui/Hint';
import UiIcon from '@/components/ui/UiIcon';

export const FLAGS = ['unpaid', 'late', 'attitude'];
export const FLAG_STYLE = {
  unpaid: 'bg-red-500/15 text-red-300 border-red-500/40',
  late: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  attitude: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
};
const PAY_STYLE = {
  paid: 'bg-lime-400 text-navy-950',
  pending: 'bg-yellow-500/20 text-yellow-300',
  overdue: 'bg-red-500/20 text-red-300',
};

// The last day of a month / quarter / year plan bought from `month` (YYYY-MM).
function periodEnd(month, period) {
  const [y, m] = month.split('-').map(Number);
  const last = y * 12 + (m - 1) + ({ month: 1, quarter: 3, year: 12 }[period] || 1) - 1;
  const ly = Math.floor(last / 12);
  const lm = (last % 12) + 1;
  return `${ly}-${String(lm).padStart(2, '0')}-${String(new Date(Date.UTC(ly, lm, 0)).getUTCDate()).padStart(2, '0')}`;
}

function RegisterForm({ club, member, plans, onDone }) {
  const { t, sport } = useI18n();
  const active = plans.filter((p) => p.is_active);
  const [form, setForm] = useState({ plan_id: active[0]?.id || '', start_month: thisMonth(), start_date: todayYmd(), count: 1, amount: '', from: '', sessions: '', paid: true });
  // A session pack (community) starts on a day and runs N months; a period plan starts on a month.
  const plan = plans.find((p) => p.id === form.plan_id);
  const pack = !!plan?.validity_months;
  // Month / quarter / year bought part-way through (one period): from the day bought to the end
  // of the period, with only the sessions left — counted from the club's kèo in those days.
  const { data: clubEvents } = useLoad(() => (pack || !plan ? Promise.resolve([]) : api.get(`/api/clubs/${club.id}/events`).catch(() => [])), [club.id, pack, plan?.id]);
  const single = !pack && plan && Number(form.count) === 1;
  const periodStart = `${form.start_month}-01`;
  const periodLast = single ? periodEnd(form.start_month, plan.period) : null;
  const from = single ? (form.from && form.from >= periodStart && form.from <= periodLast ? form.from : todayYmd() > periodStart && todayYmd() <= periodLast ? todayYmd() : periodStart) : null;
  const partial = single && from > periodStart;
  const limited = Number(plan?.sessions_included) > 0;
  const sessionsInRange = (clubEvents || []).filter((e) => e.event_date >= from && e.event_date <= periodLast && e.status !== 'cancelled' && !['meeting', 'tournament'].includes(e.kind)).length;
  const autoSessions = limited && !partial ? Number(plan.sessions_included) : limited ? Math.min(Number(plan.sessions_included), sessionsInRange || Math.round((Number(plan.sessions_included) * (Date.parse(periodLast) - Date.parse(from) + 86400000)) / (Date.parse(periodLast) - Date.parse(periodStart) + 86400000))) : null;
  const sessions = form.sessions === '' || form.sessions == null ? autoSessions : Number(form.sessions);
  const autoAmount = partial && limited && sessions ? Math.round((Number(plan.price) * sessions) / Number(plan.sessions_included) / 1000) * 1000 : plan?.price ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function pickPlan(id) {
    const plan = plans.find((p) => p.id === id);
    setForm({ ...form, plan_id: id, amount: '', sessions: '' });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/members/${member.id}/memberships`, {
        plan_id: form.plan_id,
        ...(pack ? { start_date: form.start_date } : { start_month: form.start_month, count: Number(form.count) }),
        ...(partial ? { start_date: from, ...(limited ? { sessions } : {}) } : {}),
        amount: form.amount === '' ? (autoAmount === '' ? null : Number(autoAmount)) : Number(form.amount),
        status: form.paid ? 'paid' : 'pending',
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!active.length) {
    return (
      <p className="text-gray-400 text-sm">
        {t('membership.noPlans')}{' '}
        <Link href="/finance/plans" className="text-lime-400">{t('membership.createPlans')} →</Link>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 bg-navy-900 rounded-lg p-3">
      <div className="col-span-2">
        <label className="text-xs text-gray-400">{t('membership.plan')}</label>
        <select className="input" value={form.plan_id} onChange={(e) => pickPlan(e.target.value)}>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.validity_months ? t('plans.packShort', { n: p.sessions_included, m: p.validity_months }) : t(`plans.${p.period}`)} · {formatVnd(p.price)}
            </option>
          ))}
        </select>
      </div>
      {pack ? (
        <>
          <div className="col-span-2">
            <label className="text-xs text-gray-400">{t('membership.startDate')}</label>
            <input className="input" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <p className="col-span-2 text-gray-500 text-xs -mt-2">{t('membership.packHint', { n: plan.sessions_included, m: plan.validity_months })}</p>
        </>
      ) : (
        <>
          <div>
            <label className="text-xs text-gray-400">{t('membership.startMonth')}</label>
            <input className="input" type="month" required value={form.start_month} onChange={(e) => setForm({ ...form, start_month: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400">{t('membership.count')}</label>
            <input className="input" type="number" inputMode="numeric" min="1" max="12" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
          </div>
          <p className="col-span-2 text-gray-500 text-xs -mt-2">{t('membership.countHint')}</p>
          {single && (
            <>
              <div>
                <label className="text-xs text-gray-400" htmlFor="ms-from">{t('membership.fromDay')}</label>
                <input id="ms-from" className="input" type="date" min={periodStart} max={periodLast} value={from} onChange={(e) => setForm({ ...form, from: e.target.value, sessions: '', amount: '' })} />
              </div>
              <div>
                <span className="text-xs text-gray-400">{t('membership.toDay')}</span>
                <p className="input !bg-navy-900/60 tabular-nums">{dmy(periodLast)}</p>
              </div>
              {limited && !partial && <p className="col-span-2 text-gray-500 text-xs -mt-1">{t('membership.fullHint', { total: plan.sessions_included })}</p>}
              {limited && partial && (
                <div className="col-span-2">
                  <label className="text-xs text-gray-400" htmlFor="ms-sessions">{t('membership.sessionsBought')}</label>
                  <input id="ms-sessions" className="input" type="number" inputMode="numeric" min="1" max={plan.sessions_included} value={sessions ?? ''} onChange={(e) => setForm({ ...form, sessions: e.target.value, amount: '' })} />
                  <p className="text-gray-500 text-xs mt-1">{t('membership.partialHint', { n: sessions || 0, total: plan.sessions_included, events: sessionsInRange })}</p>
                </div>
              )}
            </>
          )}
        </>
      )}
      <div className="col-span-2">
        <label className="text-xs text-gray-400">{t('membership.amount')}</label>
        <input className="input" type="number" inputMode="numeric" min="0" step="1" value={form.amount === '' ? autoAmount : form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </div>
      <label className="col-span-2 flex items-center gap-2 text-sm text-gray-200">
        <input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} />
        {t('membership.alreadyPaid')}
      </label>
      {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
      <button className="btn-primary col-span-2" disabled={busy || !form.plan_id}>{t('membership.register')}</button>
    </form>
  );
}

// Popup with a member's internal notes and membership passes.
// Edit the member's details (name, phone, gender, DUPR, type, tier, birth date, join month).
const fromMember = (m) => ({
  full_name: m.full_name || '',
  phone: m.phone || '',
  gender: m.gender || '',
  dupr_level: m.dupr_level ?? '',
  dupr_id: m.dupr_id || '',
  // Community: someone still in their first 30 days shows as "Người chơi mới".
  member_type: m.member_type === 'guest' && m.newcomer_until && m.newcomer_until >= new Date().toISOString().slice(0, 10) ? 'new' : m.member_type || 'fixed',
  tier: m.tier || '',
  guest_perk: m.guest_perk ? 'priority' : '',
  guest_discount_pct: m.guest_discount_pct ?? '',
  birth: birthFromMember(m),
  joined: m.joined_on ? m.joined_on.slice(0, 7) : '',
  is_active: m.is_active !== false,
  district: m.district || '',
});

function MemberEdit({ member, busy, onSave, onSaveDupr, autoEdit = false, community = false }) {
  const { t, sport } = useI18n();
  const [open, setOpen] = useState(autoEdit);
  const [f, setF] = useState(() => fromMember(member));
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-gray-400">
          {t('members.birthDate')}: <span className="text-gray-200">{member.birth_date ? dmy(member.birth_date) : member.birth_year ?? '—'}</span>
        </span>
        <span className="text-gray-400">
          {t('members.joined')}: <span className="text-gray-200">{member.joined_on ? `${my(member.joined_on)} · ${tenureLabel(member.joined_on, t)}` : '—'}</span>
        </span>
        <button type="button" className="btn-secondary !py-1.5 text-sm ml-auto" onClick={() => { setF(fromMember(member)); setOpen(true); }}>
          {t('members.edit')}
        </button>
        {missingInfo(member).length > 0 && (
          <p className="w-full text-xs text-amber-300">
            {t('members.incompleteDetail', { fields: missingInfo(member).map((k) => t(`members.miss_${k}`)).join(', ') })}{' '}
            <button type="button" className="underline text-lime-300" onClick={() => { setF(fromMember(member)); setOpen(true); }}>{t('quickfix.add')}</button>
          </p>
        )}
      </div>
    );
  }

  async function save(e) {
    e.preventDefault();
    // DUPR ID (pickleball): saved on its own, so a taken / bad ID says so before the rest.
    const duprId = f.dupr_id.trim().toUpperCase();
    if (sport !== 'badminton' && onSaveDupr && duprId !== (member.dupr_id || '')) {
      if ((await onSaveDupr(duprId || null)) === false) return;
    }
    const ok = await onSave({
      full_name: f.full_name.trim(),
      phone: f.phone.trim() || null,
      gender: f.gender || null,
      dupr_level: f.dupr_level === '' ? null : Number(f.dupr_level),
      // 'new' (community): a drop-in in their first 30 days; the server keeps the date.
      member_type: f.member_type === 'new' && !community ? 'guest' : f.member_type,
      tier: f.member_type === 'fixed' && !community ? f.tier || null : null,
      // Community: anyone can be "khách ưu tiên" (VIP = holding a pass, not a field).
      ...(f.member_type !== 'fixed' || community
        ? { guest_perk: f.guest_perk || null, guest_discount_pct: f.guest_perk && f.guest_discount_pct !== '' ? Number(f.guest_discount_pct) : null }
        : {}),
      ...birthPayload(f.birth),
      joined_on: f.joined ? `${f.joined}-01` : null,
      is_active: f.is_active,
      district: f.district,
    });
    if (ok !== false) setOpen(false);
  }

  return (
    <form onSubmit={save} className="grid grid-cols-2 gap-3 rounded-lg border border-navy-600 p-3">
      {member.user_id && member.account_verified && <p className="col-span-2 text-[11px] text-sky-200">{t('members.syncsProfile')}</p>}
      <div className="col-span-2">
        <label className="text-xs text-gray-400">{member.user_id ? t('members.nickname') : t('common.name')} {member.user_id && <Hint inline text={t('members.nicknameHint')} />}</label>
        <input className="input" required value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} />
      </div>
      <div className="min-w-0">
        <label className="text-xs text-gray-400">{t('common.phone')}</label>
        <input className="input" type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
      </div>
      <div className="min-w-0">
        <label className="text-xs text-gray-400">{t('members.gender')}</label>
        <select className="input" value={f.gender} onChange={(e) => set({ gender: e.target.value })}>
          <option value="">—</option>
          <option value="male">{t('members.male')}</option>
          <option value="female">{t('members.female')}</option>
        </select>
      </div>
      <div className="min-w-0">
        <label className="text-xs text-gray-400">{t('common.level')}</label>
        <LevelInput value={f.dupr_level} onChange={(v) => set({ dupr_level: v })} />
      </div>
      {sport !== 'badminton' && (
        <div className="min-w-0">
          <label className="text-xs text-gray-400" htmlFor="edit-dupr-id">{t('dupr.idLabel')}</label>
          <input id="edit-dupr-id" className="input font-mono placeholder:font-sans" maxLength={10} autoCapitalize="characters" autoComplete="off" placeholder={t('dupr.idPh')} value={f.dupr_id} onChange={(e) => set({ dupr_id: e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 10) })} />
        </div>
      )}
      <BirthInput id="edit-birth-year" value={f.birth} onChange={(birth) => set({ birth })} required={f.member_type === 'fixed'} />
      <div className="min-w-0">
        <label className="text-xs text-gray-400">{t('members.type')}</label>
        <select className="input" value={f.member_type} onChange={(e) => set({ member_type: e.target.value })}>
          {community ? (
            <>
              <option value="guest">{t('members.guest')}</option>
              <option value="fixed">{t('members.fixed')}</option>
              <option value="new">{t('members.newPlayer')}</option>
            </>
          ) : (
            <>
              <option value="fixed">{t('members.fixed')}</option>
              <option value="guest">{t('members.guest')}</option>
            </>
          )}
        </select>
      </div>
      <div className="min-w-0">
        {f.member_type === 'fixed' && !community ? (
          <>
            <label className="text-xs text-gray-400">{t('members.tier')}</label>
            <select className="input" value={f.tier} onChange={(e) => set({ tier: e.target.value })}>
              <option value="">—</option>
              <option value="vip">{t('members.vip')}</option>
              <option value="standard">{t('members.standard')}</option>
            </select>
          </>
        ) : (
          <>
            <span className="text-xs text-gray-400">{t('guests.perk')}</span>
            <label className="input flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!f.guest_perk}
                onChange={(e) => set({ guest_perk: e.target.checked ? 'priority' : '', guest_discount_pct: e.target.checked ? f.guest_discount_pct : '' })}
              />
              <span>{t('guests.perk_priority')}</span>
            </label>
          </>
        )}
      </div>
      {(f.member_type === 'guest' || community) && f.guest_perk && (
        <div className="col-span-2">
          <label htmlFor="md-discount" className="text-xs text-gray-400">{t('guests.discountLabel')}</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-28">
              <input
                id="md-discount"
                className="input !pr-7"
                type="number"
                inputMode="numeric"
                min="0"
                max="100"
                step="1"
                placeholder="0"
                value={f.guest_discount_pct}
                onChange={(e) => set({ guest_discount_pct: e.target.value })}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
            {[10, 20, 30, 50].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set({ guest_discount_pct: String(p) })}
                className={`rounded-full border px-2.5 py-1 text-xs ${String(f.guest_discount_pct) === String(p) ? 'border-lime-400 text-lime-300' : 'border-navy-600 text-gray-300'}`}
              >
                −{p}%
              </button>
            ))}
          </div>
          <Hint text={t('guests.discountHint')} className="mt-1" />
        </div>
      )}
      <MemberExtraFields idPrefix="md" value={f} onChange={set} />
      <div className="min-w-0">
        <label className="text-xs text-gray-400">{t('members.joinedMonth')}</label>
        <input className="input" type="month" value={f.joined} onChange={(e) => set({ joined: e.target.value })} />
      </div>
      <label className="min-w-0 flex items-center gap-2 text-sm text-gray-200 self-end pb-2">
        <input type="checkbox" checked={f.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
        {t('members.active')}
      </label>
      <div className="col-span-2 flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
        <button className="btn-primary flex-1" disabled={busy || !f.full_name.trim()}>{t('common.save')}</button>
      </div>
    </form>
  );
}

export default function MemberDetail({ club, member, onClose, onChanged, autoEdit = false, onReview = null }) {
  const { t, sport } = useI18n();
  const open = !!member;
  const { data: plans } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/plans`) : Promise.resolve([])), [club?.id]);
  const { data: passes, reload: reloadPasses } = useLoad(
    () => (open ? api.get(`/api/clubs/${club.id}/members/${member.id}/memberships`) : Promise.resolve([])),
    [member?.id]
  );
  const [flags, setFlags] = useState([]);
  const [notes, setNotes] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFlags(member?.flags || []);
    setNotes(member?.notes || '');
    setShowRegister(false);
  }, [member?.id]);

  if (!open) return null;

  const planName = (id) => plans?.find((p) => p.id === id)?.name || '';
  // Community: anyone can buy a pass ("khách VIP"); clubs: fixed members only.
  const community = club?.kind === 'community';
  const canPass = member.member_type === 'fixed' || community;

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      reloadPasses();
      onChanged();
      return true;
    } catch (err) {
      window.alert(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const patchMember = (body) => run(() => api.patch(`/api/clubs/${club.id}/members/${member.id}`, body));
  const saveDupr = (duprId) => run(() => api.patch(`/api/clubs/${club.id}/members/${member.id}/dupr`, { dupr_id: duprId }));

  function toggleFlag(f) {
    const next = flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f];
    setFlags(next);
    patchMember({ flags: next });
  }

  const base = `/api/clubs/${club.id}/memberships`;

  return (
    <Modal open title={member.full_name} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {/* Bad behaviour: move to "To review" (suspended for a while, the player is told). */}
        {onReview && !member.review_started_at && (
          <button type="button" className="self-start rounded-lg px-3 py-1.5 text-sm border border-amber-300/60 text-amber-200 hover:bg-amber-300/10" onClick={() => onReview(member)}>
            {t('mod.moveToReview')}
          </button>
        )}
        <div className="text-gray-400 text-sm flex flex-wrap gap-x-4 gap-y-1">
          <span>
            {member.member_type === 'fixed' ? t('members.fixed') : t('members.guest')}
            {member.member_type === 'fixed' && member.tier && ` · ${t(`members.${member.tier}`)}`}
          </span>
          {member.member_type === 'fixed' && <VipBadge stars={member.vip_stars} tier={member.vip_tier} />}
          {(member.member_type !== 'fixed' || club?.kind === 'community') && member.guest_perk && <GuestPerkBadge perk={member.guest_perk} pct={member.guest_discount_pct} />}
          {member.phone && <a href={`tel:${member.phone}`} className="text-lime-400">{member.phone}</a>}
          {member.dupr_level != null && <span>{levelTag(member.dupr_level, sport, t)}</span>}
          {member.debt > 0 && <span className="text-red-300">{t('membership.debt')}: {formatVnd(member.debt)}</span>}
        </div>

        <MemberEdit community={club?.kind === 'community'} key={member.id} member={member} busy={busy} onSave={patchMember} onSaveDupr={saveDupr} autoEdit={autoEdit} />

        {member.account_email && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-navy-900 px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="text-gray-400 text-xs">{t('payments.linked')}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-white break-all">{member.account_email}</span>
                {member.account_verified ? (
                  <span className="pill-good"><UiIcon name="check" className="w-3.5 h-3.5" />{t('verify.verified')}</span>
                ) : (
                  <span className="pill-warn">{t('verify.pending')}</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-1">
              {!member.account_verified && (
                <button
                  type="button"
                  className="btn-primary text-sm"
                  disabled={busy}
                  onClick={() => window.confirm(t('verify.ask', { email: member.account_email, name: member.full_name })) && patchMember({ account_verified: true })}
                >
                  {t('verify.do')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* No account yet (phone did not match): a personal link, or name their account. */}
        {!member.user_id && <MemberLink club={club} member={member} onChanged={onChanged} />}

        <section>
          <h3 className="text-white font-semibold text-sm mb-2">{t('flags.title')}</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {FLAGS.map((f) => (
              <button
                key={f}
                type="button"
                disabled={busy}
                onClick={() => toggleFlag(f)}
                className={`text-sm rounded-full border px-3 py-1 transition ${
                  flags.includes(f) ? FLAG_STYLE[f] : 'border-navy-600 text-gray-400 hover:text-gray-200'
                }`}
              >
                {flags.includes(f) ? '✓ ' : ''}
                {t(`flags.${f}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input text-sm" placeholder={t('flags.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button
              type="button"
              className="btn-secondary text-sm shrink-0"
              disabled={busy || notes === (member.notes || '')}
              onClick={() => patchMember({ notes: notes.trim() || null })}
            >
              {t('common.save')}
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold text-sm">{t('membership.title')}</h3>
            {canPass && (
              <button type="button" className="text-lime-400 text-sm" onClick={() => setShowRegister((s) => !s)}>
                {showRegister ? t('common.cancel') : `+ ${t('membership.register')}`}
              </button>
            )}
          </div>
          {!canPass && <p className="text-gray-400 text-xs mb-2">{t('membership.guestNoPlans')}</p>}
          {community && <Hint text={t('social.vipHint')} className="mb-2" />}

          {showRegister && plans && canPass && (
            <div className="mb-3">
              <RegisterForm
                club={club}
                member={member}
                plans={plans}
                onDone={() => {
                  setShowRegister(false);
                  reloadPasses();
                  onChanged();
                }}
              />
            </div>
          )}

          {(passes || []).length === 0 && !showRegister && canPass && <p className="text-gray-400 text-sm">{t('membership.none')}</p>}
          <div className="flex flex-col gap-2">
            {(passes || []).map((p) => {
              const unlimited = p.sessions_included === 0;
              return (
                <div key={p.membership_id} className="bg-navy-900 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-white text-sm font-semibold">{p.period_label}</div>
                      <div className="text-gray-400 text-xs break-words">{planName(p.plan_id)} · {formatVnd(p.amount)}</div>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 shrink-0 font-semibold ${PAY_STYLE[p.status]}`}>
                      {t(`membership.${p.status}`)}
                    </span>
                  </div>
                  <div className="text-gray-300 text-xs mt-2">
                    {unlimited
                      ? t('membership.usedUnlimited', { used: p.sessions_used })
                      : t('membership.used', { used: p.sessions_used, total: p.sessions_included })}
                  </div>
                  {!unlimited && (
                    <div className="w-full bg-navy-800 rounded-full h-1.5 mt-1">
                      <div className="bg-lime-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, (100 * p.sessions_used) / p.sessions_included)}%` }} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
                    <button
                      disabled={busy}
                      className={p.status === 'paid' ? 'text-gray-400' : 'text-lime-400'}
                      onClick={() => run(() => api.patch(`${base}/${p.membership_id}`, { status: p.status === 'paid' ? 'pending' : 'paid' }))}
                    >
                      {p.status === 'paid' ? t('membership.markUnpaid') : t('membership.markPaid')}
                    </button>
                    <button
                      disabled={busy || (!unlimited && p.sessions_remaining <= 0)}
                      className="text-gray-300 disabled:opacity-30"
                      onClick={() => run(() => api.post(`${base}/${p.membership_id}/sessions`, {}))}
                    >
                      {t('membership.useSession')}
                    </button>
                    <button
                      disabled={busy || p.sessions_used <= 0}
                      className="text-gray-300 disabled:opacity-30"
                      onClick={() => run(() => api.del(`${base}/${p.membership_id}/sessions/last`))}
                    >
                      {t('membership.undoSession')}
                    </button>
                    <button
                      disabled={busy}
                      className="text-red-400 ml-auto"
                      onClick={() => {
                        if (window.confirm(t('membership.deleteConfirm', { label: p.period_label }))) {
                          run(() => api.del(`${base}/${p.membership_id}`));
                        }
                      }}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <MemberHistory key={member.id} club={club} member={member} />
      </div>
    </Modal>
  );
}
