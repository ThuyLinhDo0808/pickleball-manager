'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

export default function FundPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data, loading, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/fund`) : Promise.resolve(null)),
    [club?.id]
  );
  const [form, setForm] = useState({ type: 'income', category: '', amount: '', note: '' });
  const [busy, setBusy] = useState(false);

  async function addTxn(e) {
    e.preventDefault();
    if (!club) return;
    setBusy(true);
    try {
      await api.post('/api/transactions', {
        owner_type: 'club',
        club_id: club.id,
        type: form.type,
        category: form.category || null,
        amount: Number(form.amount || 0),
        note: form.note || null,
      });
      setForm({ type: 'income', category: '', amount: '', note: '' });
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('nav.fund')}</h1>

      <div className="card mb-6">
        <span className="text-gray-400 text-sm">{t('finance.balance')}</span>
        <div className="text-lime-400 text-3xl font-bold">{(data?.balance || 0).toLocaleString('vi-VN')} ₫</div>
      </div>

      <form onSubmit={addTxn} className="card mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="income">{t('finance.income')}</option>
          <option value="expense">{t('finance.expense')}</option>
        </select>
        <input className="input" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input className="input" type="number" placeholder="Amount" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input className="input" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="btn-primary md:col-span-4" disabled={busy || !club}>{t('common.add')}</button>
      </form>

      <div className="card">
        {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left border-b border-navy-700">
              <th className="py-2">Date</th>
              <th>Type</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {(data?.transactions || []).map((tx) => (
              <tr key={tx.id} className={`border-b border-navy-800 ${tx.is_voided ? 'opacity-40 line-through' : ''}`}>
                <td className="py-2 text-gray-300">{tx.occurred_on}</td>
                <td className={tx.type === 'income' ? 'text-lime-400' : 'text-red-400'}>{t(`finance.${tx.type}`)}</td>
                <td className="text-gray-300">{tx.category || '—'}</td>
                <td className="text-gray-300">{Number(tx.amount).toLocaleString('vi-VN')} ₫</td>
                <td className="text-gray-300">{tx.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
