'use client';
import { use, useMemo, useState } from 'react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function RankingsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = use(params);
  const { t } = useI18n();
  const { data, error, loading } = useLoad(async () => {
    const [a, m] = await Promise.all([
      api.get(`/api/clubs/${clubId}/rankings/all-time`),
      api.get(`/api/clubs/${clubId}/rankings/monthly`),
    ]);
    return { allTime: a.rankings, monthly: m.rankings };
  }, [clubId]);
  const [scope, setScope] = useState('monthly');

  const rows = useMemo(() => {
    if (!data) return [];
    const monthKey = new Date().toISOString().slice(0, 7);
    const list = scope === 'monthly'
      ? data.monthly.filter((r: any) => String(r.month).slice(0, 7) === monthKey)
      : data.allTime;
    return [...list].sort(
      (x: any, y: any) => y.wins - x.wins || Number(y.win_rate_pct) - Number(x.win_rate_pct) || y.matches_played - x.matches_played
    );
  }, [data, scope]);

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;
  if (error && !data) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-20">
      <Segmented
        value={scope}
        onChange={setScope}
        options={[{ value: 'monthly', label: t('rank.thisMonth') }, { value: 'all', label: t('rank.allTime') }]}
      />
      <p className="text-xs text-muted-foreground">{t('rank.explain')}</p>

      {rows.length === 0 ? (
        <Card className="text-center py-12 text-muted-foreground">
          {scope === 'monthly' ? t('rank.emptyMonth') : t('rank.empty')}
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r: any, i: number) => {
            const pct = Number(r.win_rate_pct || 0);
            return (
              <Card key={r.club_member_id + (r.month || '')} className="flex items-center gap-4">
                <span className={`w-8 text-center font-bold ${i < 3 ? 'text-xl' : 'text-sm text-muted-foreground'}`}>
                  {i < 3 ? MEDALS[i] : i + 1}
                </span>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0 text-sm">
                  {r.display_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-base truncate">{r.display_name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('rank.record', { w: r.wins, l: r.losses, n: r.matches_played })}</p>
                </div>
                <Badge
                  label={`${pct.toFixed(0)}%`}
                  tone={pct >= 60 ? 'ok' : pct >= 40 ? 'warn' : 'danger'}
                />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}