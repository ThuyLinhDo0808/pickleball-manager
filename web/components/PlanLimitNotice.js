'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { UpgradeModal } from '@/components/PlanModals';
import { useI18n } from '@/context/I18nContext';

// When an action hits the plan (a member limit, a locked feature — the API answers
// 402, see lib/api.js), explain it in plain words and offer the plans.
export default function PlanLimitNotice() {
  const { t } = useI18n();
  const [hit, setHit] = useState(null);
  const [upgrading, setUpgrading] = useState(false);
  useEffect(() => {
    const on = (e) => setHit(e.detail || {});
    window.addEventListener('pb:plan-limit', on);
    return () => window.removeEventListener('pb:plan-limit', on);
  }, []);
  if (!hit && !upgrading) return null;
  const body =
    hit?.code === 'member_limit'
      ? t(hit.member_type === 'guest' ? 'plan.limitGuest' : 'plan.limitFixed', { n: hit.limit })
      : hit?.code === 'feature_locked'
        ? t('plan.limitFeature', { feature: t(`plan.feat_${hit.feature}`), tier: String(hit.min_tier || '').toUpperCase() })
        : hit?.error || '';
  return (
    <>
      <Modal open={!!hit} title={`💎 ${t('plan.limitTitle')}`} onClose={() => setHit(null)}>
        <p className="text-gray-200 text-sm mb-4">{body}</p>
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary text-sm" onClick={() => setHit(null)}>{t('plan.close')}</button>
          <button type="button" className="btn-primary text-sm" onClick={() => { setHit(null); setUpgrading(true); }}>💎 {t('plan.seePlans')}</button>
        </div>
      </Modal>
      <UpgradeModal open={upgrading} onClose={() => setUpgrading(false)} />
    </>
  );
}
