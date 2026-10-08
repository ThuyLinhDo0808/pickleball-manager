'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';

import { HIGHLIGHTS } from '@/lib/planFeatures';

// Fallback before the plan has loaded; the real catalog comes from GET /api/host/plan.
const DEFAULT_TIERS = ['free', 'basic', 'standard', 'advanced', 'pro'];
const DEFAULT_LIMITS = { free: { clubs: 1, fixed: 8, guest: 10 }, basic: { clubs: 1, fixed: 16, guest: 20 }, standard: { clubs: 2, fixed: 50, guest: 100 }, advanced: { clubs: 3, fixed: 100, guest: 200 }, pro: { clubs: null, fixed: null, guest: null } };
export const CLUB_LIMIT = Object.fromEntries(DEFAULT_TIERS.map((t) => [t, DEFAULT_LIMITS[t].clubs]));

export const atClubLimit = (plan) => !!plan?.enforced && plan.club_limit != null && plan.clubs_owned >= plan.club_limit;

function useRequest(kind) {
  const { reloadPlan } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // 'applied' | 'requested'
  const [error, setError] = useState('');
  async function send(extra = {}) {
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/api/host/plan/request', { kind, ...extra });
      setDone(r.downgraded ? 'downgraded' : r.applied ? 'applied' : r.payment ? 'payment' : 'requested');
      await reloadPlan();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  // Stop the add-on / take back a waiting request.
  async function cancel(cancelKind) {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/host/plan/cancel', { kind: cancelKind });
      setDone(null);
      await reloadPlan();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, done, error, send, cancel, reset: () => { setDone(null); setError(''); } };
}


const fmtDate = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '');

function CopyLine({ label, value, strong }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value));
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      /* clipboard blocked — the value is still visible */
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-navy-700 last:border-0">
      <div className="min-w-0">
        <div className="text-gray-400 text-[11px]">{label}</div>
        <div className={`break-all ${strong ? 'text-lime-300 font-bold' : 'text-white font-semibold'} text-sm`}>{value}</div>
      </div>
      <button type="button" onClick={copy} className="text-lime-400 text-xs shrink-0">{done ? t('join.copied') : t('join.copy')}</button>
    </div>
  );
}

// A transfer order waiting for the money: VietQR + the details to type by hand.
export function PlanPaymentBox({ payment, onCancel, busy }) {
  const { t } = useI18n();
  const [qrFailed, setQrFailed] = useState(false);
  const what = payment.kind === 'tier' ? (payment.tier || '').toUpperCase() : 'Social Manager';
  return (
    <div className="rounded-xl border border-amber-300/40 bg-amber-300/5 p-3">
      <p className="text-amber-200 text-sm font-semibold">⏳ {t('plan.payTitle', { what, months: payment.months })}</p>
      <p className="text-gray-300 text-xs mt-1 mb-3">{t('plan.payHint')}</p>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr] items-start">
        {payment.qr_url && !qrFailed && (
          <div className="bg-white rounded-xl p-2 mx-auto w-full max-w-[200px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={payment.qr_url} alt="VietQR" className="w-full h-auto" onError={() => setQrFailed(true)} />
          </div>
        )}
        <div className="min-w-0">
          <CopyLine label={t('plan.payAmount')} value={formatVnd(payment.amount)} strong />
          <CopyLine label={t('plan.payNote')} value={payment.ref} strong />
          <CopyLine label={t('plan.payBank')} value={payment.bank.name || payment.bank.code} />
          <CopyLine label={t('plan.payAccount')} value={payment.bank.account} />
          <CopyLine label={t('plan.payHolder')} value={payment.bank.holder} />
        </div>
      </div>
      <p className="text-gray-400 text-[11px] mt-2">{t('plan.payNoteHint', { ref: payment.ref })}</p>
      {onCancel && (
        <button type="button" className="underline text-gray-300 hover:text-white text-xs mt-2" disabled={busy} onClick={onCancel}>{t('plan.cancelRequest')}</button>
      )}
    </div>
  );
}

// Pick how many months, see the total, then get the transfer details.
function Checkout({ kind, tier, req, onBack }) {
  const { t } = useI18n();
  const { plan } = useWorkspace();
  const choices = plan?.month_choices || [1, 3, 6, 12];
  const [months, setMonths] = useState(choices[0]);
  const price = plan?.prices?.[kind === 'social_manager' ? 'social_manager' : tier] ?? 0;
  const what = kind === 'tier' ? tier.toUpperCase() : 'Social Manager';
  return (
    <div className="rounded-xl border border-lime-400/40 bg-lime-400/5 p-3">
      <p className="text-white font-semibold text-sm">{t('plan.checkoutTitle', { what })}</p>
      <p className="text-gray-400 text-xs mb-2">{t('plan.perMonth', { price: formatVnd(price) })}</p>
      <div className="flex flex-wrap gap-1.5 mb-3" role="radiogroup" aria-label={t('plan.months')}>
        {choices.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={months === m}
            onClick={() => setMonths(m)}
            className={`rounded-lg px-3 py-1.5 text-sm border ${months === m ? 'border-lime-400 bg-lime-400 text-navy-950 font-bold' : 'border-navy-600 text-gray-200'}`}
          >
            {t('plan.nMonths', { n: m })}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-gray-300 text-sm">{t('plan.total')}: <b className="text-white text-base">{formatVnd(price * months)}</b></span>
        <div className="flex gap-2 ml-auto">
          {onBack && <button type="button" className="btn-secondary !py-1.5 text-sm" onClick={onBack}>{t('common.cancel')}</button>}
          <button type="button" className="btn-primary !py-1.5 text-sm" disabled={req.busy} onClick={() => req.send({ ...(tier ? { tier } : {}), months })}>
            {t('plan.getPayment')}
          </button>
        </div>
      </div>
    </div>
  );
}

// The plans side by side: ask for a bigger one ("you need a bigger plan to run another
// club"), or go back down to a smaller one when it still fits.
export function UpgradeModal({ open, onClose }) {
  const { t } = useI18n();
  const { plan } = useWorkspace();
  const req = useRequest('tier');
  const [picking, setPicking] = useState(null); // tier being paid for
  const current = plan?.tier || 'free';
  const limited = atClubLimit(plan);
  const paid = !plan?.self_serve; // upgrades go through a bank transfer
  const pending = plan?.pending_payments?.tier;
  const close = () => { req.reset(); setPicking(null); onClose(); };
  const TIERS = plan?.catalog?.tiers || DEFAULT_TIERS;
  const LIMITS = plan?.catalog?.limits || DEFAULT_LIMITS;
  function downgrade(tier) {
    if (window.confirm(t('plan.downConfirm', { tier: tier.toUpperCase(), n: LIMITS[tier]?.clubs ?? '∞' }))) req.send({ tier });
  }
  return (
    <Modal open={open} title={`💎 ${limited ? t('plan.upgradeTitle') : t('plan.changeTitle')}`} onClose={close}>
      <p className="text-gray-300 text-sm mb-3">
        {limited
          ? t('plan.upgradeBody', { tier: current.toUpperCase(), n: plan?.club_limit ?? '∞', owned: plan?.clubs_owned ?? 0 })
          : t('plan.changeBody', { tier: current.toUpperCase(), owned: plan?.clubs_owned ?? 0, n: plan?.club_limit ?? '∞' })}
      </p>
      {plan?.expired_tier && <p className="text-red-300 text-sm mb-2">{t('plan.expired', { tier: plan.expired_tier.toUpperCase() })}</p>}
      {paid && picking && !(req.done === 'payment') && (
        <div className="mb-3"><Checkout kind="tier" tier={picking} req={req} onBack={() => setPicking(null)} /></div>
      )}
      {paid && pending && req.done !== 'downgraded' && (
        <div className="mb-3"><PlanPaymentBox payment={pending} busy={req.busy} onCancel={() => { setPicking(null); req.cancel('upgrade_request'); }} /></div>
      )}
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        {TIERS.map((tier) => {
          const isCurrent = tier === current;
          const higher = TIERS.indexOf(tier) > TIERS.indexOf(current);
          const lim = LIMITS[tier] || {};
          const n = (v) => (v == null ? '∞' : v);
          return (
            <div key={tier} className={`relative rounded-xl border p-3 flex flex-col ${isCurrent ? 'border-lime-400 bg-lime-400/5' : tier === 'standard' ? 'border-amber-300/60' : 'border-navy-600'}`}>
              {tier === 'standard' && !isCurrent && <span className="absolute -top-2 right-2 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-navy-950">{t('plan.popular')}</span>}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-white font-bold uppercase">{tier}</span>
                <span className="text-amber-200 text-xs font-semibold">{tier === 'free' ? t('plan.freeLabel') : plan?.prices?.[tier] != null ? t('plan.perMonth', { price: formatVnd(plan.prices[tier]) }) : ''}</span>
              </div>
              <div className="text-gray-400 text-xs mt-0.5">{t(`plan.for_${tier}`)}</div>
              <ul className="text-gray-200 text-xs mt-2 space-y-0.5">
                <li>🏠 {lim.clubs == null ? t('plan.clubsUnlimited') : t('plan.clubsN', { n: lim.clubs })}</li>
                <li>👥 {lim.fixed == null ? t('plan.membersUnlimited') : t('plan.membersN', { fixed: n(lim.fixed), guest: n(lim.guest) })}</li>
                {(HIGHLIGHTS[tier] || []).map((k) => <li key={k} className="text-gray-300">✓ {t(`plan.${k}`)}</li>)}
              </ul>
              <div className="mt-auto pt-2">
                {isCurrent ? (
                  <>
                    <div className="text-lime-300 text-xs">✓ {plan?.trial ? t('plan.trialCurrent', { date: fmtDate(plan.trial.ends_on) }) : t('plan.current')}</div>
                    {!plan?.trial && plan?.tier_paid_until && <div className="text-gray-400 text-[11px]">{t('plan.paidUntil', { date: fmtDate(plan.tier_paid_until) })}</div>}
                    {paid && tier !== 'free' && (
                      <button type="button" className="btn-secondary !py-1 !px-2 text-xs mt-2 w-full" disabled={req.busy} onClick={() => setPicking(tier)}>{plan?.trial ? t('plan.buyThis') : t('plan.renew')}</button>
                    )}
                  </>
                ) : higher ? (
                  <button type="button" className="btn-primary !py-1 !px-2 text-xs w-full" disabled={req.busy} onClick={() => (paid ? setPicking(tier) : req.send({ tier }))}>
                    {plan?.self_serve ? t('plan.switchTo') : t('plan.requestTo')}
                  </button>
                ) : lim.clubs != null && (plan?.clubs_owned ?? 0) > lim.clubs ? (
                  <p className="text-gray-500 text-[11px] leading-snug">{t('plan.downBlocked', { owned: plan?.clubs_owned ?? 0, n: lim.clubs })}</p>
                ) : (
                  <button type="button" className="btn-secondary !py-1 !px-2 text-xs w-full" disabled={req.busy} onClick={() => downgrade(tier)}>
                    ↓ {t('plan.downTo')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!paid && plan?.upgrade_requested_at && req.done !== 'downgraded' && (
        <p className="text-amber-300 text-xs mb-2">
          ⏳ {t('plan.requestedOn', { tier: (plan.upgrade_requested_tier || '').toUpperCase() })}{' '}
          <button type="button" className="underline text-gray-300 hover:text-white" disabled={req.busy} onClick={() => req.cancel('upgrade_request')}>{t('plan.cancelRequest')}</button>
        </p>
      )}
      {req.done === 'requested' && <p className="text-lime-300 text-sm mb-2">✓ {t('plan.requestSent')}</p>}
      {req.done === 'downgraded' && <p className="text-lime-300 text-sm mb-2">✓ {t('plan.downDone', { tier: current.toUpperCase() })}</p>}
      {req.done === 'applied' && <p className="text-lime-300 text-sm mb-2">✓ {t('plan.applied')}</p>}
      {req.error && <p className="text-red-400 text-sm mb-2">{req.error}</p>}
      <button type="button" className="btn-secondary w-full" onClick={close}>{t('plan.close')}</button>
    </Modal>
  );
}

const SM_FEATURES = ['f1', 'f2', 'f3', 'f4', 'f5'];

// The Social Manager add-on (Xé Vé): what it adds, and the sign-up.
export function SocialManagerPanel({ compact = false }) {
  const { t } = useI18n();
  const { plan } = useWorkspace();
  const req = useRequest('social_manager');
  const [renewing, setRenewing] = useState(false);
  const active = !!plan?.social_manager;
  const paid = !plan?.self_serve;
  const pending = plan?.pending_payments?.social_manager;
  return (
    <div>
      <div className="flex items-start gap-3 mb-3">
        <span className="h-12 w-12 shrink-0 rounded-2xl bg-amber-300/15 text-2xl flex items-center justify-center" aria-hidden="true">🎟</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-white font-bold">Social Manager</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${active ? 'bg-lime-400 text-navy-950' : 'bg-navy-700 text-gray-300'}`}>
              {active ? t('plan.smActive') : t('plan.smAddon')}
            </span>
          </div>
          <p className="text-gray-400 text-sm">{t('plan.smPitch')}</p>
        </div>
      </div>
      {!compact && (
        <ul className="grid gap-1.5 text-sm text-gray-200 mb-3">
          {SM_FEATURES.map((k) => (
            <li key={k} className="flex gap-2">
              <span className="text-lime-400" aria-hidden="true">✓</span>
              {t(`plan.sm_${k}`)}
            </li>
          ))}
        </ul>
      )}
      {pending ? (
        <PlanPaymentBox payment={pending} busy={req.busy} onCancel={() => { setRenewing(false); req.cancel('social_manager_request'); }} />
      ) : paid && (renewing || (!active && !plan?.social_manager_requested_at)) && plan ? (
        <Checkout kind="social_manager" req={req} onBack={renewing ? () => setRenewing(false) : null} />
      ) : active ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-lime-300 text-sm">
            ✓ {t('plan.smOn')}
            {plan?.social_manager_paid_until && <span className="block text-gray-400 text-xs">{t('plan.paidUntil', { date: fmtDate(plan.social_manager_paid_until) })}</span>}
          </p>
          {paid && <button type="button" className="btn-secondary !py-1 text-sm" onClick={() => setRenewing(true)}>{t('plan.renew')}</button>}
          <button
            type="button"
            className="text-red-300 hover:text-red-200 text-sm underline"
            disabled={req.busy}
            onClick={() => window.confirm(t('plan.smCancelConfirm')) && req.cancel('social_manager')}
          >
            {t('plan.smCancel')}
          </button>
        </div>
      ) : req.done === 'requested' || plan?.social_manager_requested_at ? (
        <div className="rounded-lg border border-amber-300/40 bg-amber-300/5 px-3 py-2 text-amber-200 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>⏳ {t('plan.smRequested')}</span>
          <button type="button" className="underline text-gray-300 hover:text-white" disabled={req.busy} onClick={() => req.cancel('social_manager_request')}>{t('plan.cancelRequest')}</button>
        </div>
      ) : (
        <button type="button" className="btn-primary w-full" disabled={req.busy || !plan} onClick={() => req.send()}>
          🎟 {plan?.self_serve ? t('plan.smActivate') : t('plan.smSignUp')}
        </button>
      )}
      {req.done === 'applied' && <p className="text-lime-300 text-sm mt-2">✓ {t('plan.applied')}</p>}
      {req.error && <p className="text-red-400 text-sm mt-2">{req.error}</p>}
    </div>
  );
}

export function SocialManagerModal({ open, onClose }) {
  const { t } = useI18n();
  return (
    <Modal open={open} title="Social Manager" onClose={onClose}>
      <SocialManagerPanel />
      <button type="button" className="btn-secondary w-full mt-3" onClick={onClose}>{t('plan.close')}</button>
    </Modal>
  );
}
