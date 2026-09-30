'use client';
import { useI18n } from '@/context/I18nContext';
import { useFeatures } from '@/lib/useFeatures';

const TIERS = ['free', 'basic', 'standard', 'pro'];
const CAPACITY = { free: 30, basic: 100, standard: 300, pro: 1000 };
// Display groups (the server decides which tier unlocks what: feature_tiers).
const GROUPS = [
  ['automations', ['qr_checkin', 'auto_notify', 'balanced_pairing']],
  ['operations', ['staff_roles', 'team_league', 'cancel_policy']],
  ['analytics', ['advanced_analytics', 'audit_trail', 'privacy']],
];
const rank = (t) => TIERS.indexOf(t);

// Plan comparison: every paid feature, which plan unlocks it, and the Host's current plan.
export default function PlanTable() {
  const { t } = useI18n();
  const { sub } = useFeatures();
  if (!sub) return null;
  const current = sub.tier || 'free';
  const need = sub.feature_tiers || {};

  return (
    <section id="plans" className="card mb-4 scroll-mt-4">
      <h2 className="text-white font-semibold">{t('plans.title')}</h2>
      <p className="text-gray-400 text-sm mb-3">
        {t('plans.current')} <span className="text-lime-400 font-semibold">{t(`plans.tier_${current}`)}</span>
        {sub.usage && ` · ${sub.usage.used}/${sub.usage.capacity_limit} ${t('plans.people')}`}
      </p>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm grid-table compact-cells min-w-[40rem]">
          <thead>
            <tr className="bg-navy-900 text-gray-300">
              <th className="text-left">{t('plans.feature')}</th>
              {TIERS.map((tier) => (
                <th key={tier} className={`text-center w-24 ${tier === current ? 'text-lime-400' : ''}`}>
                  {t(`plans.tier_${tier}`)}
                  {tier === current && <div className="text-[10px] font-normal">{t('plans.yourPlan')}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="text-gray-200">{t('plans.capacity')}</td>
              {TIERS.map((tier) => <td key={tier} className={`text-center tabular-nums ${tier === current ? 'bg-lime-400/5' : ''}`}>{CAPACITY[tier]}</td>)}
            </tr>
            <tr>
              <td className="text-gray-200">{t('plans.basics')}</td>
              {TIERS.map((tier) => <td key={tier} className={`text-center text-lime-400 ${tier === current ? 'bg-lime-400/5' : ''}`}>✓</td>)}
            </tr>
            {GROUPS.map(([group, list]) => [
              <tr key={group} className="bg-navy-900/60">
                <td colSpan={TIERS.length + 1} className="text-gray-400 text-xs font-semibold uppercase tracking-wide">{t(`plans.g_${group}`)}</td>
              </tr>,
              ...list.map((f) => (
                <tr key={f}>
                  <td>
                    <div className="text-white">{t(`plans.f_${f}`)}</div>
                    <div className="text-gray-500 text-xs">{t(`plans.f_${f}_desc`)}</div>
                  </td>
                  {TIERS.map((tier) => (
                    <td key={tier} className={`text-center ${tier === current ? 'bg-lime-400/5' : ''}`}>
                      {rank(tier) >= rank(need[f] || 'free') ? <span className="text-lime-400">✓</span> : <span className="text-gray-600">—</span>}
                    </td>
                  ))}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <p className="text-gray-400 text-xs mt-3">{t('plans.howToUpgrade')}</p>
    </section>
  );
}
