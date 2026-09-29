'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { Wallet, Check, Plus } from 'lucide-react';
import { api } from '@/lib/services/api';
import { useLoad } from '@/lib/hooks/useLoad';
import { useI18n } from '@/lib/i18n';
import { formatDateTime, formatMoney, localMonthKey, parseMoney } from '@/lib/utils/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import { toast } from 'sonner';

export default function FundPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = use(params);
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(async () => {
    const [c, b, tx, m] = await Promise.all([
      api.get(`/clubs/${clubId}`),
      api.get(`/clubs/${clubId}/fund-balance`),
      api.get(`/transactions?club_id=${clubId}`),
      api.get(`/clubs/${clubId}/members`),
    ]);
    return { club: c.club, balance: b.balance, txns: tx.transactions, members: m.members };
  }, [clubId]);

  const [feeAmount, setFeeAmount] = useState('');
  const [showCollect, setShowCollect] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [category, setCategory] = useState('court_cost');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const CATEGORIES = [
    { value: 'court_cost', label: t('fund.court') },
    { value: 'ball_cost', label: t('fund.balls') },
    { value: 'other', label: t('fund.other') },
  ];
  const sourceLabel = (src: string) => t(`fund.src.${src}`);

  const defaultFee = data?.club?.monthly_fee_default;
  useEffect(() => {
    if (defaultFee !== undefined && feeAmount === '') {
      setFeeAmount(String(Number(defaultFee) || ''));
    }
  }, [defaultFee]);

  const thisMonth = localMonthKey(new Date().toISOString());
  const paidIds = useMemo(() => {
    const set = new Set();
    (data?.txns || []).forEach((tx: any) => {
      if (!tx.is_voided && tx.source === 'membership_fee' && tx.related_member_id && localMonthKey(tx.created_at) === thisMonth) {
        set.add(tx.related_member_id);
      }
    });
    return set;
  }, [data, thisMonth]);

  const fixedMembers = useMemo(
    () => (data?.members || []).filter((m: any) => m.status === 'active' && m.member_type === 'fixed'),
    [data]
  );

  if (loading) return <div className="p-8 text-center">Đang tải...</div>;
  if (error && !data) return <div className="p-8 text-center text-destructive">Lỗi tải dữ liệu</div>;

  const bal = data.balance;
  const unpaid = fixedMembers.filter((m: any) => !paidIds.has(m.id));

  async function collect(member: any) {
    const fee = parseMoney(feeAmount);
    if (fee <= 0) return alert(t('fund.setFeeBody'));
    try {
      setBusyId(member.id);
      await api.post('/api/transactions', {
        club_id: clubId, type: 'income', source: 'membership_fee', amount: fee,
        description: t('fund.feeDesc', { name: member.display_name }), related_member_id: member.id,
      });
      toast.success(t('fund.collected', { name: member.display_name }));
      reload();
    } catch (e: any) {
      toast.error(t('fund.collectFailed') + ': ' + e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoney(amount);
    if (value <= 0) return alert(t('common.amountPositive'));
    const label = desc.trim() || CATEGORIES.find((c) => c.value === category)?.label || '';
    try {
      setSaving(true);
      await api.post('/api/transactions', { club_id: clubId, type: 'expense', source: category, amount: value, description: label });
      setDesc(''); setAmount('');
      toast.success(t('fund.expenseAdded'));
      reload();
    } catch (e: any) {
      toast.error(t('fund.expenseFailed') + ': ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmVoid(tx: any) {
    if (tx.is_voided) return;
    if (window.confirm(t('fund.voidBody', { name: tx.description || sourceLabel(tx.source), amount: formatMoney(tx.amount) }))) {
      api.post(`/api/transactions/${tx.id}/void`, { void_reason: 'Voided by host' })
        .then(() => { toast.success(t('fund.voided')); reload(); })
        .catch((e: any) => toast.error(t('fund.voidFailed') + ': ' + e.message));
    }
  }

  const positive = Number(bal.balance) >= 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className={`rounded-3xl p-6 text-white shadow-sm ${positive ? 'bg-blue-900' : 'bg-red-900'}`}>
        <p className="text-xs text-blue-200 font-medium">{t('fund.balance')}</p>
        <h2 className="text-3xl font-bold my-2">{formatMoney(bal.balance)}</h2>
        <p className="text-xs text-blue-100">
          {t('fund.inOut', { inc: formatMoney(bal.total_income), out: formatMoney(bal.total_expense) })}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-base">{t('fund.monthlyFees', { n: unpaid.length })}</h3>
          <button onClick={() => setShowCollect(!showCollect)} className="text-sm font-bold text-primary hover:underline">
            {showCollect ? t('common.hide') : t('common.show')}
          </button>
        </div>

        {showCollect && (
          <Card>
            <div className="mb-4">
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('fund.feePerMember')}</label>
              <input
                type="text"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {fixedMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('fund.noFixed')}</p>
            ) : (
              <div className="space-y-2">
                {fixedMembers.map((m: any) => {
                  const paid = paidIds.has(m.id);
                  return (
                    <div key={m.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                          {m.display_name[0]}
                        </div>
                        <span className="font-bold text-sm">{m.display_name}</span>
                      </div>
                      {paid ? (
                        <Badge label={t('fund.paid')} tone="ok" icon={Check} />
                      ) : (
                        <Button title={t('fund.collect')} size="sm" loading={busyId === m.id} onClick={() => collect(m)} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-base">{t('fund.addExpense')}</h3>
        <Card>
          <form onSubmit={addExpense} className="space-y-4">
            <Segmented value={category} onChange={setCategory} options={CATEGORIES} />
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('fund.note')}</label>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={t('fund.notePlaceholder')}
                className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">{t('common.amount')}</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="450.000"
                className="w-full h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <Button type="submit" variant="secondary" title={t('fund.addExpense')} icon={Plus} loading={saving} className="w-full" />
          </form>
        </Card>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-base">{t('fund.history')}</h3>
        <p className="text-xs text-muted-foreground">{t('fund.historyHint')}</p>

        {data.txns.length === 0 ? (
          <Card className="text-center py-8 text-muted-foreground">{t('fund.emptyTitle')}</Card>
        ) : (
          <div className="space-y-2">
            {data.txns.slice(0, 40).map((tx: any) => {
              const income = tx.type === 'income';
              return (
                <Card key={tx.id} onDoubleClick={() => confirmVoid(tx)} className={`cursor-pointer ${tx.is_voided ? 'opacity-45' : ''}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <p className={`font-bold text-sm ${tx.is_voided ? 'line-through' : ''}`}>
                        {tx.description || sourceLabel(tx.source)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{sourceLabel(tx.source)} · {formatDateTime(tx.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold text-sm ${income ? 'text-emerald-600' : 'text-red-500'}`}>
                        {income ? '+' : '−'}{formatMoney(tx.amount)}
                      </span>
                      {tx.is_voided && <div><Badge label={t('common.voided')} tone="warn" /></div>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}