'use client';
import { useState } from 'react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const TIERS = [
  { tier: 'free', cap: 30 },
  { tier: 'basic', cap: 100 },
  { tier: 'standard', cap: 300 },
  { tier: 'pro', cap: 1000 },
];

export default function PlanPage() {
  const { t } = useI18n();
  const { data, loading, reload } = useLoad(() => api.get('/host/me'), []);
  const [busy, setBusy] = useState<string | null>(null);

  if (loading || !data) return <div className="p-8 text-center">Đang tải...</div>;
  const sub = data.subscription;

  async function choose(item: any) {
    const over = sub.current_usage > item.cap;
    const name = t(`tier.${item.tier}`);
    
    const confirmMsg = t('plan.switchBody', { cap: item.cap }) + (over ? `\n\n${t('plan.overLimit', { used: sub.current_usage, cap: item.cap })}` : '');
    
    if (window.confirm(confirmMsg)) {
      try {
        setBusy(item.tier);
        await api.post('/host/subscription', { tier: item.tier });
        toast.success(t('plan.switched', { name }));
        reload();
      } catch (e: any) {
        toast.error(t('plan.switchFailed') + ': ' + e.message);
      } finally {
        setBusy(null);
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <p className="text-xs font-bold text-muted-foreground">{t('plan.currentUsage')}</p>
        <h2 className="text-3xl font-bold my-2">{sub.current_usage} / {sub.max_capacity}</h2>
        <ProgressBar value={sub.current_usage} max={sub.max_capacity} />
        <p className="text-xs text-muted-foreground mt-3">{t('plan.usageExplain')}</p>
      </Card>

      <div className="space-y-3 mt-6">
        {TIERS.map((item) => {
          const current = item.tier === sub.tier;
          return (
            <Card key={item.tier} className={current ? 'border-primary' : ''}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold">{t(`tier.${item.tier}`)}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t('plan.upTo', { cap: item.cap })}</p>
                </div>
                {current ? (
                  <Badge label={t('plan.current')} tone="accent" />
                ) : (
                  <Button variant="secondary" title={t('plan.select')} loading={busy === item.tier} onClick={() => choose(item)} />
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-4">{t('plan.billingNote')}</p>
    </div>
  );
}