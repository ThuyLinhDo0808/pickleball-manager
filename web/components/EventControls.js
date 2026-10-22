'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STATUS_STYLE } from '@/components/EventCalendar';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { localDate } from '@/lib/dates';

// Host controls on the event page. Status is open → completed (automatic once the time
// slot is over) or cancelled. Nobody signed up → it can be deleted; otherwise cancel it.
export default function EventControls({ event, onChanged }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const live = ['draft', 'open', 'closed'].includes(event.status);
  const deadlinePassed = event.registration_deadline && new Date(event.registration_deadline) < new Date();
  const takingSignups = event.allow_public_registration && live && !deadlinePassed;
  const atText = (iso) => localDate(new Date(iso), lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }, true);

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

  async function remove() {
    if (!window.confirm(t('manage.deleteAsk', { title: event.title }))) return;
    setBusy(true);
    setError('');
    try {
      await api.del(`/api/events/${event.id}`);
      router.push('/events');
    } catch (err) {
      if (err.payload?.code === 'has_signups') {
        setError(t('manage.hasSignups'));
      } else if (
        (err.payload?.code === 'past_has_data' &&
          window.confirm(t('manage.deletePastAsk', { title: event.title, people: err.payload.participants, matches: err.payload.matches, money: err.payload.transactions }))) ||
        (err.payload?.code === 'has_activity' && window.confirm(t('manage.deleteForceAsk', { people: err.payload.participants, money: err.payload.transactions })))
      ) {
        try {
          await api.del(`/api/events/${event.id}?force=1`);
          router.push('/events');
          return;
        } catch (e2) {
          setError(e2.message);
        }
      } else {
        setError(err.message);
      }
      setBusy(false);
    }
  }

  const status = live ? 'open' : event.status;
  return (
    <div className="card mb-4 !py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md border-l-4 px-2 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>{t(`events.status_${status}`)}</span>
        <span className={`text-xs ${takingSignups ? 'text-lime-400' : 'text-gray-400'}`}>
          {event.kind === 'meeting'
            ? live ? t('vote.openShort') : t('vote.closedShort')
            : takingSignups
            ? `${t('reg.open')}`
            : live && event.allow_public_registration && deadlinePassed
              ? `${t('reg.closedByTime', { at: atText(event.registration_deadline) })}`
              : `${t('reg.closed')}`}
        </span>
        {/* The auto-close time stays on its own: closing / opening by hand never changes it. */}
        {event.kind !== 'meeting' && live && event.registration_deadline && !deadlinePassed && (
          <span className="text-xs text-gray-300">{t('reg.autoAt', { at: atText(event.registration_deadline) })}</span>
        )}
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:w-auto sm:ml-auto [&>*]:text-center">
          {/* One button each way: close now / open again. The auto-close time is left as it is,
              unless it has already passed (then opening again removes it, after asking). */}
          {event.kind !== 'meeting' && live && takingSignups && (
            <button className="btn-secondary !py-1.5 text-sm" disabled={busy} onClick={() => patch({ allow_public_registration: false }, t('manage.closeSignupsAsk'))}>
              {t('manage.closeSignups')}
            </button>
          )}
          {event.kind !== 'meeting' && live && !takingSignups && (
            <button className="btn-primary !py-1.5 text-sm" disabled={busy} onClick={() => patch(deadlinePassed ? { registration_deadline: null, allow_public_registration: true } : { allow_public_registration: true }, deadlinePassed ? t('reg.openPastAsk', { at: atText(event.registration_deadline) }) : null)}>
              {t('manage.reopenSignups')}
            </button>
          )}
          {event.status !== 'cancelled' && (
            <Link href={`/events/${event.id}/edit`} className="btn-secondary !py-1.5 text-sm">{t('manage.edit')}</Link>
          )}
          {live && (
            <button className="btn-secondary !py-1.5 text-sm text-orange-300" disabled={busy} onClick={() => patch({ status: 'cancelled' }, t('manage.cancelAsk'))}>
              ✕ {t('manage.cancelEvent')}
            </button>
          )}
          <button className="rounded-lg px-3 py-1.5 text-sm border border-red-500/60 text-red-400 hover:bg-red-500/10" disabled={busy} onClick={remove}>
            {t('common.delete')}
          </button>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}
