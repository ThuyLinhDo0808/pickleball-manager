'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { formatDateTime, formatMoney, parseMoney } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import { EVENT_STATUSES } from '@/lib/constants';
import { toast } from 'sonner';

export default function EventFinancePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(async () => {
    const [f, p, tx] = await Promise.all([
      api.get(`/api/events/${eventId}/finance`),
      api.get(`/api/events/${eventId}/participants`),
      api.get(`/api/transactions?event_id=${eventId}`),
    ]);
    return { finance: f.finance, event: f.event, participants: p.participants, txns: tx.transactions };
  }, [eventId]);

  const [courtCost, setCourtCost] = useState('');
  const [ballCost, setBallCost] = useState('');
  const [costsDirty, setCostsDirty] = useState(false);
  const [savingCosts, setSavingCosts] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  useEffect(() => {
    if (data?.event && !costsDirty) {
      setCourtCost(String(Number(data.event.court_cost) || ''));
      setBallCost(String(Number(data.event.ball_cost) || ''));
    }
  }, [data?.event?.court_cost, data?.event?.ball_cost]);

  const payers = useMemo(
    () => (data?.participants || []).filter((p: any) => ['registered', 'checked_in', 'no_show'].includes(p.status) || p.fee_paid),
    [data]
  );

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;
  if (error && !data) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  const { finance, event } = data;
  const feeOf = (p: any) => Number(p.fee_amount ?? event.fee_amount) || 0;
  const expected = payers.reduce((sum: number, p: any) => sum + feeOf(p), 0);
  const outstanding = payers.filter((p: any) => !p.fee_paid).reduce((sum: number, p: any) => sum + feeOf(p), 0);
  const profit = Number(finance?.profit_loss) || 0;
  const expenses = data.txns.filter((tx: any) => tx.type === 'expense');

  async function saveCosts(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingCosts(true);
      await api.patch(`/api/events/${eventId}`, { court_cost: parseMoney(courtCost), ball_cost: parseMoney(ballCost) });
      setCostsDirty(false);
      toast.success(t('common.saved'));
      reload();
    } catch (e: any) {
      toast.error(t('common.saveFailed') + ': ' + e.message);
    } finally {
      setSavingCosts(false);
    }
  }

  async function toggleFee(p: any) {
    try {
      await api.patch(`/api/events/${eventId}/participants/${p.id}/fee`, { fee_paid: !p.fee_paid });
      reload();
    } catch (e: any) {
      toast.error(t('finance.feeUpdateFailed') + ': ' + e.message);
    }
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoney(amount);
    if (!desc.trim() || value <= 0) return alert(t('finance.expenseInvalid'));
    try {
      setSavingExpense(true);
      await api.post('/api/transactions', { event_id: eventId, type: 'expense', source: 'event_expense', amount: value, description: desc.trim() });
      setDesc(''); setAmount('');
      toast.success(t('fund.expenseAdded'));
      reload();
    } catch (e: any) {
      toast.error(t('fund.expenseFailed') + ': ' + e.message);
    } finally {
      setSavingExpense(false);
    }
  }

  async function setStatus(status: string) {
    if (status === event.status) return;
    try {
      await api.patch(`/api/events/${eventId}`, { status });
      toast.success(t('finance.statusChanged', { status: t(`estatus.${status}`) }));
      reload();
    } catch (e: any) {
      toast.error(t('finance.statusFailed') + ': ' + e.message);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className={`rounded-3xl p-6 text-white shadow-sm ${profit >= 0 ? 'bg-emerald-800' : 'bg-red-900'}`}>
        <p className="text-xs text-emerald-200 font-medium">{profit >= 0 ? t('finance.profit') : t('finance.loss')} · {event.title}</p>
        <h2 className="text-3xl font-bold my-2">{formatMoney(profit)}</h2>
        <p className="text-xs text-emerald-100">
          {t('finance.summaryLine', { collected: formatMoney(finance?.fees_collected), court: formatMoney(event.court_cost), balls: formatMoney(event.ball_cost), other: formatMoney(finance?.other_expenses) })}
        </p>
        <p className="text-xs text-emerald-100 mt-1">
          {t('finance.stillToCollect', { outstanding: formatMoney(outstanding), expected: formatMoney(expected) })}
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-bold text-base">{t('finance.status')}</h3>
        <Segmented value={event.status} onChange={setStatus} options={EVENT_STATUSES.map((v) => ({ value: v, label: t(`estatus.${v}`) }))} />
        <p className="text-xs text-muted-foreground">{t('finance.statusHint')}</p>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-base">{t('finance.fixedCosts')}</h3>
        <Card>
          <form onSubmit={saveCosts} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.courtCost')}</label>
                <input type="text" value={courtCost} onChange={(e) => { setCourtCost(e.target.value); setCostsDirty(true); }} className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1">{t('eventForm.ballCost')}</label>
                <input type="text" value={ballCost} onChange={(e) => { setBallCost(e.target.value); setCostsDirty(true); }} className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <Button type="submit" variant="secondary" title={t('common.save')} loading={savingCosts} disabled={!costsDirty} className="w-full" />
          </form>
        </Card>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-base">{t('finance.fees', { paid: payers.filter((p: any) => p.fee_paid).length, total: payers.length })}</h3>
        {payers.length === 0 ? (
          <Card className="text-center py-6 text-muted-foreground">{t('finance.emptyPlayers')}</Card>
        ) : (
          <div className="space-y-2">
            {payers.map((p: any) => (
              <Card key={p.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                    {p.display_name[0]}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">{p.display_name}</h4>
                    <p className="text-xs text-muted-foreground">{formatMoney(feeOf(p))}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {p.fee_paid && <Badge label={t('fund.paid')} tone="ok" />}
                  <input type="checkbox" checked={p.fee_paid} onChange={() => toggleFee(p)} className="w-5 h-5 accent-primary cursor-pointer" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-base">{t('finance.otherExpenses')}</h3>
        <Card>
          <form onSubmit={addExpense} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('finance.whatFor')}</label>
              <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('finance.whatForPlaceholder')} className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('common.amount')}</label>
              <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.000" className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <Button type="submit" variant="secondary" title={t('fund.addExpense')} icon={Plus} loading={savingExpense} className="w-full" />
          </form>
        </Card>
      </div>

      {expenses.length > 0 && (
        <div className="space-y-2">
          {expenses.map((tx: any) => (
            <Card key={tx.id} className="flex justify-between items-center py-3">
              <div>
                <p className="font-bold text-sm">{tx.description}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(tx.created_at)}</p>
              </div>
              <span className="font-bold text-sm text-red-500">−{formatMoney(tx.amount)}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}