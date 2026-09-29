'use client';
import { useMemo, useState } from 'react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';

function tone(pct: number | null) {
  if (pct === null || pct === undefined) return 'neutral';
  return pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'danger';
}

export default function PlayersReliabilityPage() {
  const { t } = useI18n();
  const { data, error, loading } = useLoad(() => api.get('/events/players/reliability'), []);
  const [order, setOrder] = useState('worst');

  const players = useMemo(() => {
    const list = [...(data?.players || [])];
    const score = (p: any) => (p.reliability_pct === null ? 101 : Number(p.reliability_pct));
    list.sort((a: any, b: any) => (order === 'worst' ? score(a) - score(b) : score(b) - score(a)));
    return list;
  }, [data, order]);

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;
  if (error && !data) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-20">
      <Segmented
        value={order}
        onChange={setOrder}
        options={[{ value: 'worst', label: t('players.worstFirst') }, { value: 'best', label: t('players.bestFirst') }]}
      />
      <p className="text-xs text-muted-foreground">{t('players.explain')}</p>

      {players.length === 0 ? (
        <Card className="text-center py-12 text-muted-foreground">{t('players.emptyTitle')}</Card>
      ) : (
        <div className="space-y-2">
          {players.map((item: any) => {
            const pct = item.reliability_pct === null ? null : Number(item.reliability_pct);
            return (
              <Card key={item.player_key} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0 text-sm">
                  {item.display_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-base truncate">{item.display_name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('players.stats', { events: item.events_registered, shown: item.check_ins, noshow: item.no_shows })}
                  </p>
                </div>
                <Badge
                  label={pct === null ? t('players.noData') : `${pct.toFixed(0)}%`}
                  tone={tone(pct)}
                />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}