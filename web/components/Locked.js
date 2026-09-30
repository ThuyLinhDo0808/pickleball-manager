'use client';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { useFeatures } from '@/lib/useFeatures';

// Small "🔒 BASIC" pill linking to the plan comparison.
export function UpgradeBadge({ feature, className = '' }) {
  const { t } = useI18n();
  const { has, tierFor } = useFeatures();
  if (has(feature)) return null;
  return (
    <Link
      href="/account#plans"
      title={t('plans.needTier', { tier: t(`plans.tier_${tierFor(feature)}`) })}
      className={`inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-400/20 whitespace-nowrap ${className}`}
    >
      🔒 {t(`plans.tier_${tierFor(feature)}`)}
    </Link>
  );
}

// Replaces a whole feature block with an upgrade card when the plan lacks it.
export function LockedSection({ feature, title, children }) {
  const { t } = useI18n();
  const { has, tierFor } = useFeatures();
  if (has(feature)) return children;
  return (
    <section className="card mb-4 border-amber-400/40">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        {title && <h2 className="text-white font-semibold">{title}</h2>}
        <UpgradeBadge feature={feature} />
      </div>
      <p className="text-gray-300 text-sm">{t(`plans.f_${feature}_desc`)}</p>
      <Link href="/account#plans" className="btn-primary inline-block mt-3 text-sm">
        {t('plans.upgradeTo', { tier: t(`plans.tier_${tierFor(feature)}`) })}
      </Link>
    </section>
  );
}
