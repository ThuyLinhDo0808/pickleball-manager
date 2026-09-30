'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

const STATUSES = ['draft', 'open', 'closed', 'completed', 'cancelled'];

// ISO timestamp -> value for <input type="datetime-local"> in the viewer's timezone.
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formFrom(event) {
  return {
    allow_public_registration: !!event.allow_public_registration,
    status: event.status,
    registration_deadline: toLocalInput(event.registration_deadline),
    notice: event.notice || '',
    cancel_deadline_hours: event.cancel_deadline_hours == null ? '' : String(event.cancel_deadline_hours),
  };
}

// Host controls for the player-facing sign-up link: on/off, deadline, notice, share.
export default function EventShareCard({ event, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => formFrom(event));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === 'function');
  }, []);
  useEffect(() => setForm(formFrom(event)), [event]);

  const link = `${origin}/e/${event.public_token}`;
  const dirty = JSON.stringify(form) !== JSON.stringify(formFrom(event));
  const deadlinePassed = event.registration_deadline && new Date(event.registration_deadline) < new Date();
  const isOpen = event.allow_public_registration && ['draft', 'open'].includes(event.status) && !deadlinePassed;

  async function save(patch = form) {
    setBusy(true);
    setError('');
    try {
      const updated = await api.patch(`/api/events/${event.id}`, {
        ...patch,
        registration_deadline: patch.registration_deadline ? new Date(patch.registration_deadline).toISOString() : null,
        notice: patch.notice?.trim() || null,
        cancel_deadline_hours: patch.cancel_deadline_hours === '' ? null : Number(patch.cancel_deadline_hours),
      });
      onSaved?.(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt(t('events.copyLink'), link);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: event.title, url: link });
    } catch {
      /* user dismissed */
    }
  }

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-white font-semibold">{t('events.shareTitle')}</h2>
        <span className={`text-xs rounded-full px-2 py-0.5 ${isOpen ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-700 text-gray-300'}`}>
          {isOpen ? t('events.registrationOpen') : t('events.registrationClosed')}
        </span>
      </div>
      <p className="text-gray-400 text-xs mb-3">{t('events.shareHint')}</p>

      <label className="flex items-center gap-2 text-sm text-gray-200 mb-3">
        <input
          type="checkbox"
          checked={form.allow_public_registration}
          onChange={(e) => {
            const next = { ...form, allow_public_registration: e.target.checked };
            setForm(next);
            save(next);
          }}
          disabled={busy}
        />
        {t('events.allowPublic')}
      </label>

      {event.allow_public_registration ? (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="input text-sm flex-1 min-w-0" />
          <div className="flex gap-2">
            <button type="button" className="btn-primary text-sm flex-1 sm:flex-none" onClick={copy}>
              {copied ? t('events.copied') : t('events.copyLink')}
            </button>
            {canShare && (
              <button type="button" className="btn-secondary text-sm flex-1 sm:flex-none" onClick={share}>
                {t('events.share')}
              </button>
            )}
            <a href={link} target="_blank" rel="noreferrer" className="btn-secondary text-sm flex-1 sm:flex-none text-center">
              {t('events.openLink')}
            </a>
          </div>
        </div>
      ) : (
        <p className="text-gray-500 text-sm mb-4">{t('events.linkOff')}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <div>
          <label className="text-xs text-gray-400">{t('common.status')}</label>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`events.status_${s}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('events.deadline')}</label>
          <input
            className="input"
            type="datetime-local"
            value={form.registration_deadline}
            onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-gray-400">{t('policy.label')}</label>
          <select className="input" value={form.cancel_deadline_hours} onChange={(e) => setForm({ ...form, cancel_deadline_hours: e.target.value })}>
            {['', '2', '6', '12', '24', '48', ...(['', '2', '6', '12', '24', '48'].includes(form.cancel_deadline_hours) ? [] : [form.cancel_deadline_hours])].map((h) => (
              <option key={h} value={h}>{h === '' ? t('policy.none') : t('policy.hours', { h })}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-gray-400">{t('events.notice')}</label>
          <textarea
            className="input"
            rows={3}
            placeholder={t('events.noticeHint')}
            value={form.notice}
            onChange={(e) => setForm({ ...form, notice: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-3">
          <button className="btn-primary w-full sm:w-auto" disabled={busy || !dirty}>{t('common.save')}</button>
          {error && <span className="text-red-400 text-sm">{error}</span>}
        </div>
      </form>
    </div>
  );
}
