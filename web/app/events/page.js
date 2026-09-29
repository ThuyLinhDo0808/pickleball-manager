'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { useDefaultClub } from '@/lib/useDefaultClub';

const emptyForm = { title: '', event_date: '', start_time: '', location: '', courts: 2, slots: 16, fee_amount: 0, registration_deadline: '' };

export default function EventsPage() {
  const { t } = useI18n();
  const { club } = useDefaultClub();
  const { data: events, loading, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/events`) : Promise.resolve([])),
    [club?.id]
  );
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createEvent(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/events', {
        ...form,
        club_id: club?.id || null,
        courts: Number(form.courts),
        slots: Number(form.slots),
        fee_amount: Number(form.fee_amount || 0),
        registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
        status: 'open',
      });
      setForm(emptyForm);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...(events || [])].sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('nav.schedule')}</h1>

      <form onSubmit={createEvent} className="card mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-400">Title</label>
          <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('events.date')}</label>
          <input className="input" type="date" required value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('events.time')}</label>
          <input className="input" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('events.location')}</label>
          <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('events.courts')}</label>
          <input className="input" type="number" min="1" value={form.courts} onChange={(e) => setForm({ ...form, courts: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('events.slots')}</label>
          <input className="input" type="number" min="1" value={form.slots} onChange={(e) => setForm({ ...form, slots: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('common.fee')}</label>
          <input className="input" type="number" min="0" value={form.fee_amount} onChange={(e) => setForm({ ...form, fee_amount: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('events.deadline')}</label>
          <input className="input" type="datetime-local" value={form.registration_deadline} onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })} />
        </div>
        <div className="md:col-span-3 flex items-center gap-3">
          <button className="btn-primary w-full md:w-auto" disabled={busy || !club}>{t('events.addEvent')}</button>
          {error && <span className="text-red-400 text-sm">{error}</span>}
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
        {!loading && sorted.length === 0 && <p className="text-gray-400 text-sm">—</p>}
        {sorted.map((e) => (
          <Link key={e.id} href={`/events/${e.id}`} className="card hover:border-lime-400 transition">
            <div className="flex justify-between gap-2">
              <span className="text-white font-semibold">{e.title}</span>
              <span className="text-gray-400 text-xs uppercase">{e.status}</span>
            </div>
            <div className="text-gray-400 text-sm">{e.event_date} {e.start_time || ''} · {e.location || '—'}</div>
            <div className="text-gray-300 text-sm mt-1">
              {e.main_count}/{e.slots} {t('events.mainList').toLowerCase()}
              {e.waitlist_count > 0 && ` · ${e.waitlist_count} ${t('events.waitlist').toLowerCase()}`}
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
