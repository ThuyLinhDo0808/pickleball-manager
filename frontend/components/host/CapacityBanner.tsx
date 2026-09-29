'use client';
import Link from 'next/link';
import { Ribbon } from 'lucide-react';
import { Card } from '../ui/card';
import { ProgressBar } from '../ui/progress';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';

export default function CapacityBanner() {
  const { t } = useI18n();
  const { data } = useLoad(() => api.get('/api/host/me'), []);
  const sub = data?.subscription;
  
  if (!sub) return null;

  const pct = Math.min(100, Math.round((sub.current_usage / Math.max(1, sub.max_capacity)) * 100));
  const colorClass = pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-primary';

  return (
    <Link href="/plan" className="block w-full">
      <Card className="py-3 hover:opacity-85 transition-opacity">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2 text-primary">
            <Ribbon className="w-4 h-4" />
            <span className="font-bold text-sm">{t('plan.name', { tier: t(`tier.${sub.tier}`) })}</span>
          </div>
          <span className="text-muted-foreground text-sm">
            {t('plan.usage', { used: sub.current_usage, max: sub.max_capacity })}
          </span>
        </div>
        <ProgressBar value={sub.current_usage} max={sub.max_capacity} colorClass={colorClass} />
        {pct >= 80 && (
          <p className={`text-xs mt-2 ${pct >= 100 ? 'text-destructive' : 'text-amber-500'}`}>
            {pct >= 100 ? t('plan.full') : t('plan.nearlyFull')}
          </p>
        )}
      </Card>
    </Link>
  );
}