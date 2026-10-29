'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { formatDay, hhmm } from '@/lib/dates';
import { dmy } from '@/lib/coach';

// "Còn N buổi" for a student paying by package; grey "chưa có gói" when they have none
// (and a session was already charged to nothing).
export function BalanceChip({ b, charged = false, noPackage = false }) {
  const { t } = useI18n();
  if (!b) return null;
  if (b.has_package) {
    return (
      <span className={`text-[11px] rounded-full px-2 py-0.5 tabular-nums whitespace-nowrap ${b.remaining <= 1 ? 'bg-amber-300/15 text-amber-200' : 'bg-lime-400/15 text-lime-300'}`} title={b.expires_on ? t('coach.balExpires', { d: dmy(b.expires_on) }) : undefined}>
        {t('coach.balLeft', { n: b.remaining })}{charged ? ' ✓' : ''}
      </span>
    );
  }
  if (charged) return <span className="text-[11px] rounded-full px-2 py-0.5 bg-lime-400/15 text-lime-300 whitespace-nowrap">{t('coach.balCharged')}</span>;
  return <span className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${noPackage ? 'bg-amber-300/15 text-amber-200' : 'bg-navy-700 text-gray-400'}`}>{t('coach.balNone')}</span>;
}

const MINE_TONE = { present: 'text-lime-300', absent: 'text-red-300', excused: 'text-sky-300' };

// The student's view of one enrolment: package left, attendance so far, the upcoming
// sessions with "Tôi không đi được" (free before the coach's deadline, marked late after).
// `excuse(sessionId, undo)` is supplied by the page (signed in or by secret link).
export function MySessions({ e, excuse }) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const live = e.status === 'confirmed';
  const tally = e.tally;
  async function go(s, undo) {
    if (!undo && !s.can_excuse && !window.confirm(t('coach.excuseLateAsk', { h: e.coach?.cancel_hours ?? 0 }))) return;
    setBusy(true);
    try {
      await excuse(s.id, undo);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 grid gap-1.5">
      {live && (e.balance || tally) && (
        <p className="text-xs text-gray-300 tabular-nums flex flex-wrap gap-x-3">
          {e.pay_mode === 'package' && e.balance && (
            <span className={e.balance.has_package ? (e.balance.remaining <= 1 ? 'text-amber-200' : 'text-lime-300') : 'text-gray-400'}>
              {e.balance.has_package ? t('coach.balLeft', { n: e.balance.remaining }) : t('coach.balNone')}
              {e.balance.expires_on ? ` (${t('coach.balExpires', { d: dmy(e.balance.expires_on) })})` : ''}
            </span>
          )}
          {tally && (tally.present + tally.absent + tally.excused > 0) && (
            <span className="text-gray-400">{t('coach.att_present')} {tally.present} · {t('coach.att_absent')} {tally.absent} · {t('coach.att_excused')} {tally.excused}</span>
          )}
        </p>
      )}
      {live && e.next_sessions?.length > 0 && (
        <ul className="grid gap-1">
          {e.next_sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-xs tabular-nums">
              <span className="text-gray-200 capitalize min-w-0 flex-1">
                {formatDay(s.session_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' })} · {hhmm(s.start_time)}{s.court_name ? ` · ${s.court_name}` : ''}
                {s.mine && <span className={`ml-2 ${MINE_TONE[s.mine.status]}`}>{s.mine.by_student ? t(s.mine.late ? 'coach.attLateNotice' : 'coach.attNotice') : t(`coach.att_${s.mine.status}`)}</span>}
              </span>
              {excuse && !s.started && !s.mine && (
                <button type="button" disabled={busy} className={`shrink-0 px-2 min-h-[36px] ${s.can_excuse ? 'text-gray-300 hover:text-white' : 'text-amber-200'}`} onClick={() => go(s, false)}>{t('coach.excuse')}</button>
              )}
              {excuse && !s.started && s.mine?.by_student && (
                <button type="button" disabled={busy} className="shrink-0 px-2 min-h-[36px] text-lime-300 hover:text-lime-200" onClick={() => go(s, true)}>{t('coach.excuseUndo')}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Coach side: a student's packages with "Thêm gói" (from one of the coach's packages or
// typed in), paid / unpaid, cancel.
export function PurchasesPanel({ student, packages, onChanged }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ package_id: '', name: '', sessions_total: 8, price: 0, valid_months: 2, paid: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const pick = (id) => {
    const p = (packages || []).find((x) => x.id === id);
    setF(p ? { ...f, package_id: id, name: p.name, sessions_total: p.sessions, price: p.price, valid_months: p.valid_months } : { ...f, package_id: '' });
  };
  async function add(ev) {
    ev.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post(`/api/coach/students/${student.id}/purchases`, { ...f, package_id: f.package_id || null, name: f.name.trim(), sessions_total: Number(f.sessions_total), price: Number(f.price), valid_months: Number(f.valid_months) });
      setAdding(false);
      onChanged();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function patch(p, body) {
    setBusy(true);
    try {
      await api.patch(`/api/coach/purchases/${p.id}`, body);
      onChanged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function refund(p) {
    const raw = window.prompt(t('coach.refundAsk', { left: p.sessions_total - p.sessions_used, total: p.sessions_total }), String(p.suggest_refund ?? 0));
    if (raw == null) return;
    const amount = Math.round(Number(String(raw).replace(/[^\d]/g, '')) || 0);
    const reason = window.prompt(t('coach.refundReason'), '') ?? '';
    setBusy(true);
    try {
      await api.post(`/api/coach/purchases/${p.id}/refund`, { amount, reason });
      onChanged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(p) {
    if (!window.confirm(t('coach.purchaseDeleteAsk'))) return;
    setBusy(true);
    try {
      await api.del(`/api/coach/purchases/${p.id}`);
      onChanged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }
  const list = student.purchases || [];
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-gray-300 text-sm font-semibold">
          {t('coach.purchases')}
          {student.balance?.has_package && <span className="ml-2 text-lime-300 font-normal tabular-nums">{t('coach.balLeft', { n: student.balance.remaining })}</span>}
        </h3>
        <button type="button" className="btn-secondary text-xs" onClick={() => setAdding((v) => !v)}>+ {t('coach.purchaseAdd')}</button>
      </div>
      {!list.length && !adding && <p className="text-gray-500 text-sm">{t('coach.purchasesNone')}</p>}
      {list.map((p) => {
        const left = p.sessions_total - p.sessions_used;
        const dead = ['cancelled', 'refunded', 'expired'].includes(p.status);
        return (
          <div key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 border-b border-navy-700 last:border-b-0 text-sm ${dead ? 'opacity-60' : ''}`}>
            <span className="flex-1 min-w-[10rem]">
              <span className="text-white">{p.name}</span>
              <span className="block text-gray-400 text-xs tabular-nums">
                {t('coach.purchaseUsed', { used: p.sessions_used, total: p.sessions_total })} · {Number(p.price).toLocaleString('vi-VN')} ₫ · {dmy(p.starts_on)}{p.expires_on ? ` → ${dmy(p.expires_on)}` : ''}
                {dead ? ` · ${t(`coach.pstatus_${p.status}`)}${p.status === 'refunded' && p.refund_amount != null ? ` ${Number(p.refund_amount).toLocaleString('vi-VN')} ₫` : ''}` : p.status === 'pending' ? ` · ${t('coach.pstatus_pending')}${p.has_proof ? ` · ${t('coach.orderProof')}` : ''}` : left <= 0 ? ` · ${t('coach.purchaseEmpty')}` : ''}
              </span>
            </span>
            {!dead && (
              <button type="button" disabled={busy} onClick={() => patch(p, { paid: !p.paid_at })} className={`text-[11px] rounded-full px-2 py-1 min-h-[32px] ${p.paid_at ? 'bg-lime-400/15 text-lime-300' : 'bg-amber-300/15 text-amber-200'}`}>
                {t(p.paid_at ? 'coach.purchasePaid' : 'coach.purchaseUnpaid')}
              </button>
            )}
            {!dead && p.sessions_used === 0 && <button type="button" disabled={busy} className="text-red-300 hover:text-red-200 text-xs px-2 min-h-[32px]" onClick={() => remove(p)}>{t('common.delete')}</button>}
            {p.status === 'active' && p.paid_at && p.price > 0 && <button type="button" disabled={busy} className="text-sky-200 hover:text-white text-xs px-2 min-h-[32px]" onClick={() => refund(p)}>{t('coach.refund')}</button>}
            {!dead && p.sessions_used > 0 && <button type="button" disabled={busy} className="text-gray-400 hover:text-white text-xs px-2 min-h-[32px]" onClick={() => window.confirm(t('coach.purchaseCancelAsk')) && patch(p, { status: 'cancelled' })}>{t('coach.purchaseCancel')}</button>}
          </div>
        );
      })}
      {adding && (
        <form onSubmit={add} className="grid gap-2 mt-2 rounded-lg border border-navy-700 p-3">
          {(packages || []).length > 0 && (
            <div>
              <label className="text-xs text-gray-400">{t('coach.purchasePick')}</label>
              <select className="input" value={f.package_id} onChange={(ev) => pick(ev.target.value)}>
                <option value="">{t('coach.purchaseCustom')}</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sessions} {t('coach.sessionsUnit')} · {Number(p.price).toLocaleString('vi-VN')} ₫</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-gray-400">{t('coach.pkgName')}</label>
              <input className="input" required maxLength={80} value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('coach.pkgSessions')}</label>
              <input className="input" type="number" min="1" max="200" required value={f.sessions_total} onChange={(ev) => setF({ ...f, sessions_total: ev.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('coach.pkgPrice')}</label>
              <input className="input" type="number" min="0" step="1000" required value={f.price} onChange={(ev) => setF({ ...f, price: ev.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-400">{t('coach.pkgMonths')}</label>
              <input className="input" type="number" min="0" max="24" value={f.valid_months} onChange={(ev) => setF({ ...f, valid_months: ev.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-200 self-end min-h-[44px]">
              <input type="checkbox" checked={f.paid} onChange={(ev) => setF({ ...f, paid: ev.target.checked })} /> {t('coach.purchasePaid')}
            </label>
          </div>
          {msg && <p className="text-red-300 text-sm">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
            <button className="btn-primary text-sm" disabled={busy}>{t('common.add')}</button>
          </div>
        </form>
      )}
    </section>
  );
}

// Coach side: a student's attendance history, newest first.
export function HistoryList({ history }) {
  const { t, lang } = useI18n();
  if (!history?.length) return <p className="text-gray-500 text-sm">{t('coach.historyNone')}</p>;
  return (
    <ul className="grid gap-1 text-xs tabular-nums">
      {history.map((h) => (
        <li key={h.id} className="flex items-center gap-2">
          <span className="text-gray-200 capitalize">{h.session ? formatDay(h.session.session_date, lang, { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—'} · {h.session ? hhmm(h.session.start_time) : ''}</span>
          <span className="text-gray-500 min-w-0 truncate flex-1">{h.session?.class_title}</span>
          <span className={MINE_TONE[h.status]}>{t(`coach.att_${h.status}`)}{h.late ? ` (${t('coach.attLate')})` : ''}</span>
          {h.purchase_id && <span className="text-gray-500">−1</span>}
        </li>
      ))}
    </ul>
  );
}
