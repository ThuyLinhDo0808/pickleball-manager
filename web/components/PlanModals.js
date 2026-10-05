'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { api } from '@/lib/api';

// Clubs each plan may own (kept in step with backend services/plan.js).
export const CLUB_LIMIT = { free: 1, basic: 3, standard: 10, pro: null };
const TIERS = ['free', 'basic', 'standard', 'pro'];

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
      setDone(r.downgraded ? 'downgraded' : r.applied ? 'applied' : 'requested');
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

// The plans side by side: ask for a bigger one ("you need a bigger plan to run another
// club"), or go back down to a smaller one when it still fits.
export function UpgradeModal({ open, onClose }) {
  const { t } = useI18n();
  const { plan } = useWorkspace();
  const req = useRequest('tier');
  const current = plan?.tier || 'free';
  const limited = atClubLimit(plan);
  function downgrade(tier) {
    if (window.confirm(t('plan.downConfirm', { tier: tier.toUpperCase(), n: CLUB_LIMIT[tier] ?? '∞' }))) req.send({ tier });
  }
  return (
    <Modal open={open} title={`💎 ${limited ? t('plan.upgradeTitle') : t('plan.changeTitle')}`} onClose={() => { req.reset(); onClose(); }}>
      <p className="text-gray-300 text-sm mb-3">
        {limited
          ? t('plan.upgradeBody', { tier: current.toUpperCase(), n: plan?.club_limit ?? '∞', owned: plan?.clubs_owned ?? 0 })
          : t('plan.changeBody', { tier: current.toUpperCase(), owned: plan?.clubs_owned ?? 0, n: plan?.club_limit ?? '∞' })}
      </p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {TIERS.map((tier) => {
          const isCurrent = tier === current;
          const higher = TIERS.indexOf(tier) > TIERS.indexOf(current);
          return (
            <div key={tier} className={`rounded-xl border p-3 ${isCurrent ? 'border-lime-400 bg-lime-400/5' : 'border-navy-600'}`}>
              <div className="text-white font-bold uppercase">{tier}</div>
              <div className="text-gray-300 text-sm">{CLUB_LIMIT[tier] == null ? t('plan.clubsUnlimited') : t('plan.clubsN', { n: CLUB_LIMIT[tier] })}</div>
              {isCurrent ? (
                <div className="text-lime-300 text-xs mt-2">✓ {t('plan.current')}</div>
              ) : higher ? (
                <button type="button" className="btn-primary !py-1 !px-2 text-xs mt-2 w-full" disabled={req.busy} onClick={() => req.send({ tier })}>
                  {plan?.self_serve ? t('plan.switchTo') : t('plan.requestTo')}
                </button>
              ) : CLUB_LIMIT[tier] != null && (plan?.clubs_owned ?? 0) > CLUB_LIMIT[tier] ? (
                <p className="text-gray-500 text-[11px] mt-2 leading-snug">{t('plan.downBlocked', { owned: plan?.clubs_owned ?? 0, n: CLUB_LIMIT[tier] })}</p>
              ) : (
                <button type="button" className="btn-secondary !py-1 !px-2 text-xs mt-2 w-full" disabled={req.busy} onClick={() => downgrade(tier)}>
                  ↓ {t('plan.downTo')}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {plan?.upgrade_requested_at && req.done !== 'downgraded' && (
        <p className="text-amber-300 text-xs mb-2">
          ⏳ {t('plan.requestedOn', { tier: (plan.upgrade_requested_tier || '').toUpperCase() })}{' '}
          <button type="button" className="underline text-gray-300 hover:text-white" disabled={req.busy} onClick={() => req.cancel('upgrade_request')}>{t('plan.cancelRequest')}</button>
        </p>
      )}
      {req.done === 'requested' && <p className="text-lime-300 text-sm mb-2">✓ {t('plan.requestSent')}</p>}
      {req.done === 'downgraded' && <p className="text-lime-300 text-sm mb-2">✓ {t('plan.downDone', { tier: current.toUpperCase() })}</p>}
      {req.done === 'applied' && <p className="text-lime-300 text-sm mb-2">✓ {t('plan.applied')}</p>}
      {req.error && <p className="text-red-400 text-sm mb-2">{req.error}</p>}
      <button type="button" className="btn-secondary w-full" onClick={() => { req.reset(); onClose(); }}>{t('plan.close')}</button>
    </Modal>
  );
}

const SM_FEATURES = ['f1', 'f2', 'f3', 'f4', 'f5'];

// The Social Manager add-on (Xé Vé): what it adds, and the sign-up.
export function SocialManagerPanel({ compact = false }) {
  const { t } = useI18n();
  const { plan } = useWorkspace();
  const req = useRequest('social_manager');
  const active = !!plan?.social_manager;
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
      {active ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-lime-300 text-sm">✓ {t('plan.smOn')}</p>
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
