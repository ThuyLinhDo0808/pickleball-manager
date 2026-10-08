'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { UpgradeModal } from '@/components/PlanModals';
import { formatVnd } from '@/lib/format';

// Shown instead of a page (or a section) the plan doesn't include: what it does, which
// plan has it, and a way to upgrade. `owner = false` for a co-admin / staff member,
// who can't buy the owner's plan.
export default function LockedFeature({ feature, compact = false, owner = true }) {
  const { t } = useI18n();
  const { plan } = useWorkspace();
  const [open, setOpen] = useState(false);
  const minTier = plan?.catalog?.features?.[feature] || 'standard';
  const price = plan?.prices?.[minTier];
  return (
    <div className={compact ? 'rounded-xl border border-amber-300/40 bg-amber-300/5 p-3' : 'max-w-lg mx-auto card mt-4 text-center'}>
      <div className={compact ? 'flex items-start gap-3' : ''}>
        <span className={`${compact ? 'text-2xl' : 'text-4xl block mb-2'}`} aria-hidden="true">💎</span>
        <div className={compact ? 'min-w-0' : ''}>
          <h2 className="text-white font-bold">{t(`plan.feat_${feature}`)}</h2>
          <p className="text-gray-300 text-sm mt-1">{t(`plan.featHint_${feature}`)}</p>
          <p className="text-amber-200 text-sm mt-2">
            {t('plan.needsTier', { tier: minTier.toUpperCase() })}
            {price != null && <> · {t('plan.perMonth', { price: formatVnd(price) })}</>}
          </p>
          {owner ? (
            <button type="button" className={`btn-primary text-sm mt-3 ${compact ? '' : 'w-full sm:w-auto'}`} onClick={() => setOpen(true)}>
              💎 {t('plan.seePlans')}
            </button>
          ) : (
            <p className="text-gray-400 text-xs mt-2">{t('plan.askOwner')}</p>
          )}
        </div>
      </div>
      <UpgradeModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
