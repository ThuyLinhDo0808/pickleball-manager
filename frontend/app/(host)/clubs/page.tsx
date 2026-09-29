'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { formatMoney, todayISO } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CapacityBanner from '@/components/host/CapacityBanner';
import { toast } from 'sonner';

export default function ClubListPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { data, error, loading, reload, retry } = useLoad(() => api.get(`/clubs?today=${todayISO()}`), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');
  const [saving, setSaving] = useState(false);

  async function createClub(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return alert(t('club.nameRequired'));
    try {
      setSaving(true);
      const { club } = await api.post('/clubs', { name: name.trim(), monthly_fee_default: Number(fee.replace(/\D/g, '')) || 0 });
      setName(''); setFee(''); setCreating(false);
      toast.success(t('common.saved'));
      router.push(`/clubs/${club.id}/members`);
    } catch (err: any) {
      toast.error(t('club.createFailed') + ': ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;
  if (error && !data) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  const clubs = data?.clubs || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <CapacityBanner />

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t('ws.clubFull')}</h1>
        <Button title={t('club.create')} icon={Plus} onClick={() => setCreating(true)} />
      </div>

      {clubs.length === 0 ? (
        <Card className="text-center py-12">
          <p className="font-bold text-lg mb-2">{t('club.emptyTitle')}</p>
          <p className="text-sm text-muted-foreground mb-6">{t('club.emptyBody')}</p>
          <Button title={t('club.create')} icon={Plus} onClick={() => setCreating(true)} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {clubs.map((item: any) => (
            <Link key={item.id} href={`/clubs/${item.id}/members`} className="block">
              <Card className="flex items-center gap-4 hover:border-primary transition-colors cursor-pointer">
                <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center text-primary shrink-0">
                  <Users className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg truncate">{item.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('club.members', { count: item.member_count })} · {t('club.upcoming', { count: item.upcoming_events })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('club.monthlyFee')}: {formatMoney(item.monthly_fee_default)}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </Card>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md bg-background">
            <h2 className="text-lg font-bold mb-4">{t('club.newTitle')}</h2>
            <form onSubmit={createClub} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">{t('club.name')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('club.namePlaceholder')}
                  autoFocus
                  required
                  className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">{t('club.defaultFee')}</label>
                <input
                  type="text"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="200.000"
                  className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground mt-1">{t('club.defaultFeeHint')}</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" title={t('common.cancel')} onClick={() => setCreating(false)} />
                <Button type="submit" title={t('club.create')} loading={saving} />
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}