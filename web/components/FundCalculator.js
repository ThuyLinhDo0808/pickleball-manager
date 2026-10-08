'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

const ROUND_STEPS = [1000, 5000, 10000, 50000, 100000];
const EMPTY = { rate_per_hour: '', hours_per_session: '', sessions_per_month: '', discount_pct: '', balls: '', water: '', members: '', round_to: 10000, carry_sessions: '', guest_slots: [] };

const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0);

// What each member pays a month: court (rent/hour × hours × sessions, less the
// fixed-booking discount) + balls + water, shared by the members, rounded up.
// Anything else the club spends is collected separately ("Khác").
export function fundMath(c) {
  const court = num(c.rate_per_hour) * num(c.hours_per_session) * num(c.sessions_per_month);
  const discount = Math.round((court * num(c.discount_pct)) / 100);
  const courtNet = court - discount;
  const total = courtNet + num(c.balls) + num(c.water);
  const members = num(c.members);
  const perPerson = members ? Math.round(total / members) : 0;
  const step = num(c.round_to) || 1000;
  const rounded = perPerson ? Math.ceil(perPerson / step) * step : 0;
  return { court, discount, courtNet, total, perPerson, rounded, collected: rounded * members };
}

function Row({ label, children, strong, tone }) {
  return (
    <tr className={tone || ''}>
      <td className={`px-3 py-2 ${strong ? 'font-semibold' : 'text-gray-300'}`}>{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums w-44">{children}</td>
    </tr>
  );
}

function NumIn({ value, onChange, step = 1, suffix }) {
  return (
    <span className="inline-flex items-center gap-1 justify-end w-full">
      <input className="input !py-1 text-right tabular-nums" type="number" min="0" step={step} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      {suffix && <span className="text-gray-500 text-xs shrink-0">{suffix}</span>}
    </span>
  );
}

// The Host's monthly fund worksheet (like the club's Excel sheet), saved with the club.
// `onUse(amount)` (optional) puts a figure into the entry form.
export default function FundCalculator({ club, onUse }) {
  const { t } = useI18n();
  const { updateClub } = useClubs();
  const [c, setC] = useState(() => ({ ...EMPTY, ...(club?.fund_calc || {}) }));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k) => (v) => setC((x) => ({ ...x, [k]: v }));

  // No member count saved yet: start from the active fixed members.
  useEffect(() => {
    if (!club || c.members !== '') return;
    api
      .get(`/api/clubs/${club.id}/members`)
      .then((rows) => setC((x) => (x.members === '' ? { ...x, members: rows.filter((m) => m.member_type === 'fixed' && m.is_active !== false).length || '' } : x)))
      .catch(() => {});
  }, [club?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = fundMath(c);
  const slots = c.guest_slots || [];
  const setSlot = (i, k, v) => setC((x) => ({ ...x, guest_slots: x.guest_slots.map((g, j) => (j === i ? { ...g, [k]: v } : g)) }));

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      await updateClub(club.id, { fund_calc: { ...c, guest_slots: slots.filter((g) => g.label || g.price) } });
      setMsg(t('calc.saved'));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="rounded-xl border border-navy-700 overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-navy-700">
            <tr className="bg-navy-900">
              <td colSpan={2} className="px-3 py-2 text-lime-300 font-semibold">🏠 {t('calc.fixed')}</td>
            </tr>
            <Row label={t('calc.rate')}><NumIn value={c.rate_per_hour} onChange={set('rate_per_hour')} suffix="đ" /></Row>
            <Row label={t('calc.hours')}><NumIn value={c.hours_per_session} onChange={set('hours_per_session')} step="0.5" /></Row>
            <Row label={t('calc.sessions')}><NumIn value={c.sessions_per_month} onChange={set('sessions_per_month')} /></Row>
            <Row label={t('calc.court')}>{formatVnd(m.court)}</Row>
            <Row label={t('calc.discount')}>
              <span className="inline-flex items-center gap-2 justify-end w-full">
                <span className="w-24"><NumIn value={c.discount_pct} onChange={set('discount_pct')} suffix="%" /></span>
                <span className="text-orange-300">−{formatVnd(m.discount)}</span>
              </span>
            </Row>
            <Row label={t('calc.courtNet')}>{formatVnd(m.courtNet)}</Row>
            <Row label={t('calc.balls')}><NumIn value={c.balls} onChange={set('balls')} suffix="đ" /></Row>
            <Row label={t('calc.water')}><NumIn value={c.water} onChange={set('water')} suffix="đ" /></Row>
            <Row label={t('calc.total')} strong>{formatVnd(m.total)}</Row>
            <Row label={t('calc.members')}><NumIn value={c.members} onChange={set('members')} /></Row>
            <Row label={t('calc.perPerson')}>{formatVnd(m.perPerson)}</Row>
            <Row label={t('calc.rounded')} strong tone="bg-amber-300/15 text-amber-200">
              <span className="inline-flex items-center gap-2 justify-end w-full">
                <select className="input !py-1 !w-auto text-xs" value={c.round_to} onChange={(e) => set('round_to')(Number(e.target.value))} aria-label={t('calc.roundTo')}>
                  {ROUND_STEPS.map((s) => <option key={s} value={s}>{t('calc.roundStep', { v: formatVnd(s) })}</option>)}
                </select>
                <span className="text-amber-200 font-bold text-base">{formatVnd(m.rounded)}</span>
              </span>
            </Row>
            <Row label={t('calc.carry')}><NumIn value={c.carry_sessions} onChange={set('carry_sessions')} /></Row>

            <tr className="bg-navy-900">
              <td colSpan={2} className="px-3 py-2 text-sky-300 font-semibold">🤝 {t('calc.guests')}</td>
            </tr>
            {slots.map((g, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5">
                  <input className="input !py-1" placeholder={t('calc.slotPh')} maxLength={40} value={g.label} onChange={(e) => setSlot(i, 'label', e.target.value)} />
                </td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1 w-full">
                    <NumIn value={g.price} onChange={(v) => setSlot(i, 'price', v)} suffix="đ" />
                    <button type="button" className="text-gray-500 hover:text-red-400 px-1" aria-label={t('common.delete')} onClick={() => setC((x) => ({ ...x, guest_slots: x.guest_slots.filter((_, j) => j !== i) }))}>×</button>
                  </span>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} className="px-3 py-2">
                {slots.length < 10 && (
                  <button type="button" className="text-lime-400 text-sm" onClick={() => setC((x) => ({ ...x, guest_slots: [...(x.guest_slots || []), { label: '', price: '' }] }))}>
                    + {t('calc.addSlot')}
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-gray-500 text-xs mt-2">{t('calc.hint')}</p>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button type="button" className="btn-secondary text-sm" disabled={saving} onClick={save}>💾 {t('calc.save')}</button>
        {onUse && m.rounded > 0 && (
          <>
            <button type="button" className="btn-primary text-sm" onClick={() => onUse(m.rounded)}>{t('calc.usePerPerson', { v: formatVnd(m.rounded) })}</button>
            {m.collected > 0 && <button type="button" className="btn-secondary text-sm" onClick={() => onUse(m.collected)}>{t('calc.useTotal', { v: formatVnd(m.collected) })}</button>}
          </>
        )}
        <Link href="/finance/plans" className="text-lime-400 text-sm ml-auto">{t('calc.toPlans')} →</Link>
      </div>
      {msg && <p className="text-sm text-lime-300 mt-2">{msg}</p>}
    </div>
  );
}
