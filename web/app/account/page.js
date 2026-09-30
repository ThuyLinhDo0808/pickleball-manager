'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { exportClubBackup } from '@/lib/exportExcel';
import NotifySettings from '@/components/NotifySettings';
import HostPaymentSettings from '@/components/HostPaymentSettings';
import PlanTable from '@/components/PlanTable';

export default function AccountPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { club } = useDefaultClub();
  const { data: sub } = useLoad(() => api.get('/api/host/subscription'), []);
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onBackup() {
    if (!club) return;
    const [members, events, rankings] = await Promise.all([
      api.get(`/api/clubs/${club.id}/members`),
      api.get(`/api/clubs/${club.id}/events`),
      api.get(`/api/clubs/${club.id}/rankings`),
    ]);
    exportClubBackup(club, members, events, rankings);
  }

  async function sendFeedback(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/host/feedback', { message: feedback, contact: user?.email });
      setFeedback('');
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('nav.account')}</h1>

      <div className="card mb-4">
        <p className="text-gray-400 text-sm">Email</p>
        <p className="text-white">{user?.email}</p>
        {sub && (
          <p className="text-gray-400 text-sm mt-2">
            Plan: <span className="text-lime-400 uppercase">{sub.tier}</span> · {sub.usage?.used}/{sub.usage?.capacity_limit}
          </p>
        )}
      </div>

      <PlanTable />
      <HostPaymentSettings />
      <NotifySettings />

      <div className="card mb-4">
        <h2 className="text-white font-semibold mb-2">Club backup</h2>
        <p className="text-gray-400 text-sm mb-3">Export Members, Schedule, and Rankings as one Excel file.</p>
        <button className="btn-secondary" onClick={onBackup} disabled={!club}>{t('common.exportExcel')}</button>
      </div>

      <div className="card">
        <h2 className="text-white font-semibold mb-2">Feedback</h2>
        {sent ? (
          <p className="text-lime-400 text-sm">Thanks — your feedback was sent.</p>
        ) : (
          <form onSubmit={sendFeedback} className="flex flex-col gap-3">
            <textarea className="input" rows={4} required value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <button className="btn-primary self-start" disabled={busy}>Send</button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
