'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import OwnerShell, { fmtDate, fmtTime } from '@/components/OwnerShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

const STATUSES = ['pending', 'paid', 'cancelled', 'all'];

// Plan orders paid by bank transfer: match the note (PBM…) and amount in the bank app,
// then confirm — the host's plan switches on at once. Paid history exports to Excel.
function Payments() {
  const { t } = useI18n();
  const params = useSearchParams();
  const [status, setStatus] = useState(STATUSES.includes(params.get('status')) ? params.get('status') : 'pending');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const qs = `status=${status}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`;
  const { data, error, reload } = useLoad(() => api.get(`/api/owner/payments?${qs}`), [qs]);

  async function act(order, action) {
    const ask = action === 'confirm' ? t('admin.confirmAsk', { ref: order.ref, amount: formatVnd(order.amount) }) : t('admin.cancelAsk', { ref: order.ref });
    if (!window.confirm(ask)) return;
    setBusy(order.id);
    setMsg('');
    try {
      await api.post(`/api/owner/payments/${order.id}/${action}`, {});
      setMsg(action === 'confirm' ? t('admin.confirmed', { ref: order.ref }) : t('admin.cancelled', { ref: order.ref }));
      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy('');
    }
  }

  function exportExcel() {
    const rows = data.orders.map((o) => ({
      [t('owner.xRef')]: o.ref,
      [t('owner.xCreated')]: fmtTime(o.created_at),
      [t('owner.xConfirmed')]: o.confirmed_at ? fmtTime(o.confirmed_at) : '',
      [t('owner.xHost')]: o.host?.email || '',
      [t('owner.xName')]: o.host?.full_name || '',
      [t('owner.xItem')]: o.kind === 'tier' ? `${t('admin.tier')} ${String(o.tier).toUpperCase()}` : 'Social Manager',
      [t('owner.xMonths')]: o.months,
      [t('owner.xAmount')]: o.amount,
      [t('owner.xStatus')]: t(`admin.st_${o.status}`),
      [t('owner.xBy')]: o.confirmed_by || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [12, 16, 16, 28, 20, 18, 8, 12, 14, 26].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Thanh toan goi');
    XLSX.writeFile(wb, `thanh-toan-goi_${status}${from ? `_${from}` : ''}${to ? `_${to}` : ''}.xlsx`);
  }

  return (
    <>
      <p className="text-gray-400 text-sm mb-4">{t('admin.hint')}</p>
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-sm border ${status === s ? 'border-amber-300 bg-amber-300 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}>
              {t(`admin.st_${s}`)}
            </button>
          ))}
        </div>
        <label className="text-xs text-gray-400">
          {t('owner.from')}
          <input type="date" className="input !py-1 text-sm mt-0.5" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-gray-400">
          {t('owner.to')}
          <input type="date" className="input !py-1 text-sm mt-0.5" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="btn-secondary !py-1.5 text-sm ml-auto" disabled={!data?.orders.length} onClick={exportExcel}>⬇ Excel</button>
      </div>

      {data && (
        <p className="text-gray-400 text-sm mb-3">
          {t('owner.nOrders', { n: data.orders.length })}
          {data.total_paid > 0 && <> · {t('owner.paidTotal')}: <b className="text-lime-300">{formatVnd(data.total_paid)}</b></>}
        </p>
      )}
      {msg && <p className="card text-sm text-lime-300 mb-3">{msg}</p>}
      {error && <p className="card text-sm text-red-300 mb-3">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && data.orders.length === 0 && <p className="card text-gray-400 text-sm">{t('admin.empty')}</p>}

      <div className="flex flex-col gap-3">
        {data?.orders.map((o) => (
          <div key={o.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lime-300 font-bold">{o.ref}</span>
                <span className="text-white font-bold">{formatVnd(o.amount)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${o.status === 'paid' ? 'bg-lime-400 text-navy-950' : o.status === 'pending' ? 'bg-amber-300 text-navy-950' : 'bg-navy-700 text-gray-300'}`}>{t(`admin.st_${o.status}`)}</span>
              </div>
              <div className="text-gray-200 text-sm mt-1">{o.kind === 'tier' ? `${t('admin.tier')} ${String(o.tier).toUpperCase()}` : 'Social Manager'} · {o.months} {t('owner.months')}</div>
              <div className="text-gray-400 text-xs mt-0.5 break-all">
                <Link href={`/owner/hosts/${o.host?.id}`} className="text-sky-300 hover:underline">{o.host?.full_name ? `${o.host.full_name} · ` : ''}{o.host?.email || o.host?.id}</Link> · {fmtTime(o.created_at)}
              </div>
              {o.current && (
                <div className="text-gray-500 text-xs mt-0.5">
                  {t('admin.now', { tier: String(o.current.tier).toUpperCase(), until: o.current.tier_paid_until ? ` → ${fmtDate(o.current.tier_paid_until)}` : '', sm: o.current.social_manager ? `✓ (${fmtDate(o.current.social_manager_paid_until)})` : '✗' })}
                </div>
              )}
              {o.status === 'paid' && <div className="text-gray-500 text-xs mt-0.5">{t('admin.confirmedBy', { who: o.confirmed_by || '—', at: fmtTime(o.confirmed_at) })}</div>}
            </div>
            {o.status === 'pending' && (
              <div className="flex gap-2 shrink-0">
                <button type="button" className="btn-secondary !py-1.5 text-sm" disabled={busy === o.id} onClick={() => act(o, 'cancel')}>{t('admin.cancel')}</button>
                <button type="button" className="btn-primary !py-1.5 text-sm" disabled={busy === o.id} onClick={() => act(o, 'confirm')}>✓ {t('admin.confirm')}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function OwnerPaymentsPage() {
  const { t } = useI18n();
  return (
    <OwnerShell title={t('admin.title')}>
      <Suspense fallback={null}>
        <Payments />
      </Suspense>
    </OwnerShell>
  );
}
