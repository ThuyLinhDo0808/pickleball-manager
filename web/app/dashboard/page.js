'use client';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  const { data: me } = useLoad(() => (user ? api.get('/api/host/me') : Promise.resolve(null)), [user?.id]);
  const { data: clubs } = useLoad(() => (user ? api.get('/api/clubs') : Promise.resolve([])), [user?.id]);
  const { data: events } = useLoad(() => (user ? api.get('/api/events') : Promise.resolve([])), [user?.id]);

  const usage = me?.usage;
  const upcoming = (events || [])
    .filter((e) => new Date(e.event_date) >= new Date(new Date().toDateString()))
    .slice(0, 5);

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('nav.dashboard')}</h1>

      {usage && (
        <div className="card mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-300 text-sm">
              {usage.tier?.toUpperCase()} · {usage.used}/{usage.capacity_limit}
            </span>
            <span className="text-lime-400 text-sm">{usage.remaining} còn lại</span>
          </div>
          <div className="w-full bg-navy-900 rounded-full h-2">
            <div
              className="bg-lime-400 h-2 rounded-full"
              style={{ width: `${Math.min(100, (usage.used / usage.capacity_limit) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-white font-semibold">{t('nav.club')}</h2>
            <Link href="/club/members" className="text-lime-400 text-sm">{t('common.edit')} →</Link>
          </div>
          {(clubs || []).length === 0 && <p className="text-gray-400 text-sm">—</p>}
          {(clubs || []).map((c) => (
            <div key={c.id} className="text-gray-200 text-sm py-1">{c.name}</div>
          ))}
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-white font-semibold">{t('events.addEvent')}</h2>
            <Link href="/events" className="text-lime-400 text-sm">{t('nav.schedule')} →</Link>
          </div>
          {upcoming.length === 0 && <p className="text-gray-400 text-sm">—</p>}
          {upcoming.map((e) => (
            <Link key={e.id} href={`/events/${e.id}`} className="block text-gray-200 text-sm py-1 hover:text-lime-400">
              {e.event_date} — {e.title}
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
