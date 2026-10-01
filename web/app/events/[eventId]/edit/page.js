'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import EventForm, { GAME_KINDS, eventPayload, formFromEvent } from '@/components/EventForm';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// Fix any detail of an event (wrong date, time, fee, slots…) at any time.
export default function EditEventPage() {
  const { eventId } = useParams();
  const { t } = useI18n();
  const router = useRouter();
  const { data: event } = useLoad(() => api.get(`/api/events/${eventId}`), [eventId]);
  const { data: people } = useLoad(() => api.get(`/api/events/${eventId}/participants`), [eventId]);

  async function save(f) {
    await api.patch(`/api/events/${eventId}`, eventPayload(f));
    router.push(`/events/${eventId}`);
  }

  const active = (people || []).filter((p) => ['registered', 'checked_in', 'pending', 'waitlisted'].includes(p.status)).length;
  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-white text-2xl font-bold">{t('manage.editTitle')}</h1>
        <Link href={`/events/${eventId}`} className="text-gray-400 text-sm hover:text-white">← {event?.title || ''}</Link>
      </div>
      {!event ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : (
        <EventForm
          initial={formFromEvent(event)}
          onSubmit={save}
          submitLabel={t('common.save')}
          cancelHref={`/events/${eventId}`}
          warning={active ? t('manage.editWarning', { n: active }) : null}
          kinds={event.club_id ? ['weekly', ...GAME_KINDS] : GAME_KINDS}
          showStatus
        />
      )}
    </AppShell>
  );
}
