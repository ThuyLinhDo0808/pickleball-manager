'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STATUS_STYLE } from '@/components/EventCalendar';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Host controls that don't wait for any deadline: open / close sign-ups, cancel,
// fix the details, or delete an event created by mistake.
export default function EventControls({ event, onChanged }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const deadlinePassed = event.registration_deadline && new Date(event.registration_deadline) < new Date();
  const takingSignups = event.allow_public_registration && ['draft', 'open'].includes(event.status) && !deadlinePassed;

  async function patch(fields, confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    setError('');
    try {
      onChanged(await api.patch(`/api/events/${event.id}`, fields));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Opening works whatever the deadline says: a passed deadline is cleared.
  function open() {
    patch({ status: 'open', allow_public_registration: true, ...(deadlinePassed ? { registration_deadline: null } : {}) }, deadlinePassed ? t('manage.openPastDeadline') : null);
  }

  async function remove() {
    if (!window.confirm(t('manage.deleteAsk', { title: event.title }))) return;
    setBusy(true);
    setError('');
    try {
      await api.del(`/api/events/${event.id}`);
      router.push('/events');
    } catch (err) {
      if (err.payload?.code === 'has_activity') {
        const ok = window.confirm(t('manage.deleteForceAsk', { people: err.payload.participants, money: err.payload.transactions }));
        if (ok) {
          try {
            await api.del(`/api/events/${event.id}?force=1`);
            router.push('/events');
            return;
          } catch (e2) {
            setError(e2.message);
          }
        }
      } else {
        setError(err.message);
      }
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4 !py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md border-l-4 px-2 py-1 text-xs font-semibold ${STATUS_STYLE[event.status]}`}>{t(`events.status_${event.status}`)}</span>
        <span className={`text-xs ${takingSignups ? 'text-lime-400' : 'text-gray-400'}`}>
          {takingSignups
            ? t('events.registrationOpen')
            : ['draft', 'open'].includes(event.status) && deadlinePassed
              ? t('manage.lockedDeadline')
              : ['draft', 'open'].includes(event.status) && !event.allow_public_registration
                ? t('events.linkOff')
                : t('events.registrationClosed')}
        </span>
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:w-auto sm:ml-auto [&>*]:text-center">
          {takingSignups ? (
            <button className="btn-secondary !py-1.5 text-sm" disabled={busy} onClick={() => patch({ status: 'closed' }, t('manage.closeAsk'))}>🔒 {t('manage.close')}</button>
          ) : (
            event.status !== 'completed' && (
              <button className="btn-primary !py-1.5 text-sm" disabled={busy} onClick={open}>🔓 {t('manage.open')}</button>
            )
          )}
          {!['completed', 'cancelled'].includes(event.status) && (
            <button className="btn-secondary !py-1.5 text-sm" disabled={busy} onClick={() => patch({ status: 'completed' })}>✓ {t('manage.complete')}</button>
          )}
          <Link href={`/events/${event.id}/edit`} className="btn-secondary !py-1.5 text-sm">✏️ {t('manage.edit')}</Link>
          {event.status !== 'cancelled' && (
            <button className="btn-secondary !py-1.5 text-sm text-orange-300" disabled={busy} onClick={() => patch({ status: 'cancelled' }, t('manage.cancelAsk'))}>
              {t('manage.cancelEvent')}
            </button>
          )}
          <button className="rounded-lg px-3 py-1.5 text-sm border border-red-500/60 text-red-400 hover:bg-red-500/10" disabled={busy} onClick={remove}>
            🗑 {t('common.delete')}
          </button>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}
