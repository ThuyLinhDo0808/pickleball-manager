'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import EventForm, { blankEvent, eventPayload } from '@/components/EventForm';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { api } from '@/lib/api';

export default function CreateEventPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const isClub = workspace === 'club';
  // /events/create?date=YYYY-MM-DD (from the calendar's day view)
  const [initial, setInitial] = useState(null);
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('date');
    setInitial(blankEvent(/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : undefined));
  }, []);

  async function create(f) {
    const created = await api.post('/api/events', {
      ...eventPayload(f),
      club_id: isClub ? club?.id || null : null,
      repeat_weeks: isClub ? Number(f.repeat_weeks || 1) : 1,
    });
    // One event: open it so the Host can share the link. Several: back to the calendar.
    router.push(created.created_count > 1 ? '/events' : `/events/${created.id}`);
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-white text-2xl font-bold">{t('create.title')}</h1>
        <Link href="/events" className="text-gray-400 text-sm hover:text-white">← {isClub ? t('nav.schedule') : t('nav.kevents')}</Link>
      </div>
      {isClub && club && <p className="text-gray-400 text-sm -mt-2 mb-4">{t('create.forClub', { name: club.name })}</p>}
      {initial && (
        <EventForm initial={initial} onSubmit={create} submitLabel={t('create.submit')} showRepeat={isClub} disabled={isClub && !club} />
      )}
    </AppShell>
  );
}
