'use client';
import { useI18n } from '@/context/I18nContext';

// VIP chip for a fixed member on a membership plan: ⭐ month, ⭐⭐ quarter, ⭐⭐⭐ year.
export default function VipBadge({ stars, className = '' }) {
  const { t } = useI18n();
  if (!(stars > 0)) return null;
  const n = Math.min(stars, 3);
  return (
    <span
      title={t(`vip.stars${n}`)}
      aria-label={t(`vip.stars${n}`)}
      className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] leading-4 font-semibold rounded border border-amber-400/70 text-amber-300 bg-amber-400/10 px-1.5 py-0.5 align-middle ${className}`}
    >
      <span aria-hidden="true">{'⭐'.repeat(n)}</span> VIP
    </span>
  );
}
