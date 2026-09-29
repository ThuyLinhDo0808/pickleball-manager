'use client';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useClubs } from '@/context/ClubContext';
import Link from 'next/link';
import PendingPayments from '@/components/PendingPayments';

export default function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  const { data: me } = useLoad(() => (user ? api.get('/api/host/me') : Promise.resolve(null)), [user?.id]);
  const { clubs, club, selectClub } = useClubs();
  const { data: events } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/events`) : Promise.resolve([])),
    [club?.id]
  );

  const usage = me?.usage;
  const upcoming = (events || [])
    .filter((e) => new Date(e.event_date) >= new Date(new Date().toDateString()))
    .slice(0, 5);

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('nav.dashboard')}</h1>

      {usage && (
        <div className="card mb-6">
          <div className="flex justify-between items-center gap-2 mb-2">
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

      <PendingPayments club={club} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-white font-semibold">{t('nav.club')}</h2>
            <Link href="/clubs" className="text-lime-400 text-sm">{t('clubs.manage')} →</Link>
          </div>
          {clubs.length === 0 && <p className="text-gray-400 text-sm">—</p>}
          {clubs.map((c) => (
            <button
              key={c.id}
              onClick={() => selectClub(c.id)}
              className={`w-full flex items-center justify-between gap-2 text-left text-sm py-2 ${
                c.id === club?.id ? 'text-lime-400' : 'text-gray-200 hover:text-lime-400'
              }`}
            >
              <span className="truncate">{c.name}</span>
              {c.id === club?.id && <span className="text-xs shrink-0">{t('clubs.current')}</span>}
            </button>
          ))}
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-white font-semibold">{t('events.addEvent')}</h2>
            <Link href="/events" className="text-lime-400 text-sm">{t('nav.schedule')} →</Link>
          </div>
          {upcoming.length === 0 && <p className="text-gray-400 text-sm">—</p>}
          {upcoming.map((e) => (
            <Link key={e.id} href={`/events/${e.id}`} className="block text-gray-200 text-sm py-2 truncate hover:text-lime-400">
              {e.event_date} — {e.title}
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
