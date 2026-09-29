'use client';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// Referee / coordinator home: the events a Host assigned to this account.
export default function StaffEventsPage() {
  const { t } = useI18n();
  const { staffInfo } = useWorkspace();
  const { data: events, loading } = useLoad(() => api.get('/api/staff/events'), []);

  return (
    <AppShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('staffView.title')}</h1>
      {staffInfo && staffInfo.email_verified === false && <p className="card text-yellow-300 text-sm mb-4">{t('staffView.unverified')}</p>}
      {loading && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {!loading && (events || []).length === 0 && <p className="text-gray-400 text-sm">{t('staffView.none')}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(events || []).map((e) => (
          <Link key={e.id} href={`/staff/${e.id}`} className="card hover:border-lime-400 transition">
            <div className="flex justify-between gap-2">
              <span className="text-white font-semibold">{e.title}</span>
              <span className="text-xs rounded-full px-2 py-0.5 bg-navy-700 text-lime-300 shrink-0">{t(`staff.${e.role}`)}</span>
            </div>
            <div className="text-gray-400 text-sm">
              {e.event_date} {e.start_time?.slice(0, 5) || ''} · {e.location || '—'}
            </div>
            <div className="text-gray-300 text-sm mt-1">
              {e.club_name && <span className="text-gray-400">{e.club_name} · </span>}
              {e.main_count}/{e.slots}
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
