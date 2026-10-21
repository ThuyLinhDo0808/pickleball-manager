'use client';
import { useI18n } from '@/context/I18nContext';

// Hạng hội viên of the plan in use: 🥈 Bạc, 🥇 Vàng, 💎 Kim cương (chosen by the Host for each
// plan). A plan without a tier (made before tiers): ⭐ VIP by length (month / quarter / year).
const TIER_STYLE = {
  silver: { icon: '🥈', cls: 'border-slate-300/70 text-slate-200 bg-slate-300/10' },
  gold: { icon: '🥇', cls: 'border-amber-400/70 text-amber-300 bg-amber-400/10' },
  diamond: { icon: '💎', cls: 'border-sky-300/70 text-sky-200 bg-sky-300/10' },
};

export default function VipBadge({ stars, tier = null, className = '' }) {
  const { t } = useI18n();
  const base = 'inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] leading-4 font-semibold rounded border px-1.5 py-0.5 align-middle';
  if (TIER_STYLE[tier]) {
    return (
      <span title={t(`vip.tier_${tier}`)} className={`${base} ${TIER_STYLE[tier].cls} ${className}`}>
        <span aria-hidden="true">{TIER_STYLE[tier].icon}</span> {t(`vip.tier_${tier}`)}
      </span>
    );
  }
  if (!(stars > 0)) return null;
  const n = Math.min(stars, 3);
  return (
    <span title={t(`vip.stars${n}`)} aria-label={t(`vip.stars${n}`)} className={`${base} border-amber-400/70 text-amber-300 bg-amber-400/10 ${className}`}>
      <span aria-hidden="true">{'⭐'.repeat(n)}</span> VIP
    </span>
  );
}

export const PLAN_TIERS = ['silver', 'gold', 'diamond'];
