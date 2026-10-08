'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

const STATUSES = ['pending', 'paid', 'cancelled', 'all'];
const fmtDate = (ymd) => (ymd ? ymd.slice(0, 10).split('-').reverse().join('/') : '—');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '');

// App operator: plan orders paid by bank transfer. Match the transfer note in your
// bank app with the code here, then confirm — the Host's plan switches on at once.
export default function AdminPaymentsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState('pending');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const { data, error, reload } = useLoad(() => api.get(`/api/admin/plan-payments?status=${status}`), [status]);

  async function act(order, action) {
    const ask = action === 'confirm' ? t('admin.confirmAsk', { ref: order.ref, amount: formatVnd(order.amount) }) : t('admin.cancelAsk', { ref: order.ref });
    if (!window.confirm(ask)) return;
    setBusy(order.id);
    setMsg('');
    try {
      await api.post(`/api/admin/plan-payments/${order.id}/${action}`, {});
      setMsg(action === 'confirm' ? t('admin.confirmed', { ref: order.ref }) : t('admin.cancelled', { ref: order.ref }));
      reload();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h1 className="text-2xl font-bold text-white">💳 {t('admin.title')}</h1>
        <Link href="/account" className="text-gray-400 text-sm hover:text-white">← {t('admin.back')}</Link>
      </div>
      <p className="text-gray-400 text-sm mb-4">{t('admin.hint')}</p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-sm border ${status === s ? 'border-lime-400 bg-lime-400 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}
          >
            {t(`admin.st_${s}`)}
          </button>
        ))}
      </div>

      {msg && <p className="card text-sm text-lime-300 mb-3">{msg}</p>}
      {error && <p className="card text-sm text-red-300 mb-3">{error.message || String(error)}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && data.orders.length === 0 && <p className="card text-gray-400 text-sm">{t('admin.empty')}</p>}

      <div className="flex flex-col gap-3">
        {data?.orders.map((o) => (
          <div key={o.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lime-300 font-bold">{o.ref}</span>
                <span className="text-white font-bold">{formatVnd(o.amount)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${o.status === 'paid' ? 'bg-lime-400 text-navy-950' : o.status === 'pending' ? 'bg-amber-300 text-navy-950' : 'bg-navy-700 text-gray-300'}`}>
                  {t(`admin.st_${o.status}`)}
                </span>
              </div>
              <div className="text-gray-200 text-sm mt-1">
                {o.kind === 'tier' ? `${t('admin.tier')} ${String(o.tier).toUpperCase()}` : 'Social Manager'} · {t('plan.nMonths', { n: o.months })}
              </div>
              <div className="text-gray-400 text-xs mt-0.5 break-all">
                {o.host?.full_name ? `${o.host.full_name} · ` : ''}{o.host?.email || o.host?.id} · {fmtTime(o.created_at)}
              </div>
              {o.current && (
                <div className="text-gray-500 text-xs mt-0.5">
                  {t('admin.now', {
                    tier: String(o.current.tier).toUpperCase(),
                    until: o.current.tier_paid_until ? ` → ${fmtDate(o.current.tier_paid_until)}` : '',
                    sm: o.current.social_manager ? `✓ (${fmtDate(o.current.social_manager_paid_until)})` : '✗',
                  })}
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
    </AppShell>
  );
}
