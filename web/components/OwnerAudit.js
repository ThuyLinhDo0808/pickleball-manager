'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { fmtDate, fmtTime, useOwnerMe } from '@/components/OwnerShell';

const UNDOABLE = ['subscription.update', 'account.suspend', 'account.unsuspend', 'club.member_addon'];
const isDateKey = (k) => /_until$/.test(k);

// "tier: basic → pro", only for the fields that changed.
// Label of a field / an action, falling back to the raw name when there is no translation.
const labelOr = (t, key, raw) => {
  const v = t(key);
  return v && v !== key ? v : raw;
};
export const actionLabel = (t, action) => labelOr(t, `owner.act_${String(action || '').replace(/\./g, '_')}`, action);

function Diff({ from, to }) {
  const { t } = useI18n();
  const keys = [...new Set([...Object.keys(from || {}), ...Object.keys(to || {})])].filter(
    (k) => !/_id$/.test(k) && k !== 'paid' && JSON.stringify(from?.[k] ?? null) !== JSON.stringify(to?.[k] ?? null),
  );
  if (!keys.length) return null;
  const show = (k, v) => {
    if (v == null || v === '') return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    if (isDateKey(k)) return fmtDate(v);
    if (k === 'suspended_at') return fmtTime(v);
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    if (typeof v === 'object') return Object.entries(v).map(([a, b]) => `${labelOr(t, `owner.field_${a}`, a)} ${b}`).join(' · ');
    return String(v);
  };
  return (
    <ul className="mt-1 text-xs text-gray-300 space-y-0.5">
      {keys.map((k) => (
        <li key={k}>
          <span className="text-gray-500">{labelOr(t, `owner.field_${k}`, k)}:</span> <span className="line-through text-gray-500">{show(k, from?.[k])}</span> → <b className="text-gray-100">{show(k, to?.[k])}</b>
        </li>
      ))}
    </ul>
  );
}

export function AuditRow({ row, onChanged, showTarget = true }) {
  const { t } = useI18n();
  const me = useOwnerMe();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function undo() {
    if (!window.confirm(t('owner.undoAsk'))) return;
    setBusy(true);
    setMsg('');
    try {
      await api.post(`/api/owner/audit/${row.id}/undo`, {});
      onChanged?.();
    } catch (err) {
      setMsg(err.payload?.code === 'changed_since' ? t('owner.undoChanged') : err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-white text-sm font-semibold">{actionLabel(t, row.action)}</span>
          {showTarget && row.target_host_id && (
            <Link href={`/owner/hosts/${row.target_host_id}`} className="ml-2 text-sky-300 text-sm hover:underline">{row.target_email}</Link>
          )}
          {row.undone_at && <span className="ml-2 rounded-full bg-navy-700 px-2 py-0.5 text-[11px] text-gray-300">↩ {t('owner.undone')}</span>}
        </div>
        <div className="flex items-center gap-2 text-gray-500 text-xs">
          <span>{fmtTime(row.created_at)} · {row.actor_email}</span>
          {me?.owner && UNDOABLE.includes(row.action) && !row.undone_at && !row.new_value?.paid?.length && (
            <button type="button" className="rounded border border-navy-600 px-2 py-0.5 text-gray-200 hover:border-amber-300" disabled={busy} onClick={undo}>↩ {t('owner.undo')}</button>
          )}
        </div>
      </div>
      {row.new_value?.club_name && <p className="text-gray-300 text-xs mt-0.5">{row.new_value.club_name}</p>}
      {row.note && (row.action === 'undo'
        ? <p className="text-gray-400 text-xs mt-0.5">↩ {actionLabel(t, row.note)}</p>
        : <p className="text-gray-400 text-xs mt-0.5 italic">“{row.note}”</p>)}
      {row.action === 'note.add' ? <p className="text-gray-300 text-xs mt-1">{row.new_value?.body}</p> : <Diff from={row.old_value} to={row.new_value} />}
      {(row.new_value?.paid || []).map((o) => (
        <p key={o.ref} className="text-lime-300 text-xs mt-0.5">{t('owner.paidRecorded', { amount: Number(o.amount).toLocaleString('vi-VN'), kind: o.kind === 'social_manager' ? 'Social Manager' : t('owner.planShort'), months: o.months, ref: o.ref })}</p>
      ))}
      {msg && <p className="text-red-300 text-xs mt-1">{msg}</p>}
    </li>
  );
}
