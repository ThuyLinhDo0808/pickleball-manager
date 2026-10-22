'use client';
import { halfHours, policyText } from '@/lib/cancelPolicy';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import Hint from '@/components/ui/Hint';


// ISO timestamp -> value for <input type="datetime-local"> in the viewer's timezone.
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formFrom(event) {
  return {
    registration_deadline: toLocalInput(event.registration_deadline),
    notice: event.notice || '',
    cancel_deadline_hours: event.cancel_deadline_hours == null ? '' : String(event.cancel_deadline_hours),
    cancel_half_hours: event.cancel_half_hours == null ? '' : String(event.cancel_half_hours),
    no_refund: !!event.no_refund,
  };
}

// Host controls for the player-facing sign-up link: share it, auto-close time, refund rules,
// notice. Taking sign-ups / closed is one button in EventControls (not repeated here).
export default function EventShareCard({ event, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => formFrom(event));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [origin, setOrigin] = useState('');
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === 'function');
  }, []);
  useEffect(() => setForm(formFrom(event)), [event]);

  // Short link (/e/<8 characters>); older events without one keep the full token.
  const link = `${origin}/e/${event.short_code || event.public_token}`;
  const shown = link.replace(/^https?:\/\//, '');
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
        cancel_deadline_hours: patch.no_refund || patch.cancel_deadline_hours === '' ? null : Number(patch.cancel_deadline_hours),
        cancel_half_hours: patch.no_refund ? null : halfHours(patch.cancel_deadline_hours, patch.cancel_half_hours),
        no_refund: !!patch.no_refund,
      });
      onSaved?.(updated);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 4000);
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
        <h2 className="text-white font-semibold">{t('events.shareTitle')} <Hint inline text={t('events.shareHint')} /></h2>
        <span className={`text-xs rounded-full px-2 py-0.5 ${isOpen ? 'bg-lime-400 text-navy-950 font-semibold' : 'bg-navy-700 text-gray-300'}`}>
          {isOpen ? t('reg.open') : t('reg.closed')}
        </span>
      </div>

      {!isOpen && <p className="text-gray-400 text-sm mb-2">{t('reg.linkClosedNote')}</p>}
      {(
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input readOnly value={shown} onFocus={(e) => e.target.select()} className="input text-sm flex-1 min-w-0 font-mono" aria-label={t('events.copyLink')} />
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
      )}

      {/* Deadline, refund rules and the note: tucked away — open / close is one button above. */}
      <details className="rounded-lg border border-navy-700 px-3 py-2">
      <summary className="cursor-pointer text-sm text-gray-200 select-none">{t('events.moreSettings')}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3"
      >
        <div>
          <label className="text-sm text-gray-300">{t('reg.autoClose')}</label>
          <div className="flex gap-2">
            <input
              className="input flex-1 min-w-0"
              type="datetime-local"
              value={form.registration_deadline}
              onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })}
            />
            {form.registration_deadline && (
              <button type="button" className="btn-secondary !px-3 text-sm" onClick={() => setForm({ ...form, registration_deadline: '' })}>✕ {t('reg.mode_none')}</button>
            )}
          </div>
          {!form.registration_deadline && <p className="text-gray-400 text-xs mt-1">{t('reg.noAutoClose')}</p>}
        </div>
        <div>
          <label className="text-sm text-gray-300">{t('policy.refundLabel')}</label>
          <select className="input" value={form.no_refund ? 'no' : form.cancel_deadline_hours} onChange={(e) => setForm(e.target.value === 'no' ? { ...form, no_refund: true, cancel_deadline_hours: '' } : { ...form, no_refund: false, cancel_deadline_hours: e.target.value })}>
            <option value="no">{t('policy.noRefund')}</option>
            {['', '2', '6', '12', '24', '48', ...(['', '2', '6', '12', '24', '48'].includes(form.cancel_deadline_hours) ? [] : [form.cancel_deadline_hours])].map((h) => (
              <option key={h} value={h}>{h === '' ? t('policy.none') : t('policy.fullBefore', { h })}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('policy.halfLabel')}</label>
          <select className="input" disabled={form.cancel_deadline_hours === ''} value={halfHours(form.cancel_deadline_hours, form.cancel_half_hours) ?? ''} onChange={(e) => setForm({ ...form, cancel_half_hours: e.target.value })}>
            {['', '1', '2', '3', '4', '6', '12', '24'].filter((h) => h === '' || Number(h) < Number(form.cancel_deadline_hours)).map((h) => (
              <option key={h} value={h}>{h === '' ? t('policy.noHalf') : t('policy.hoursShort', { h })}</option>
            ))}
          </select>
        </div>
        {form.cancel_deadline_hours !== '' && <p className="sm:col-span-2 -mt-1 text-xs text-gray-400">{policyText(t, form.cancel_deadline_hours, form.cancel_half_hours)}</p>}
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
          {savedMsg && !error && <span className="text-lime-300 text-sm" role="status">✓ {t('common.savedLong')}</span>}
        </div>
      </form>
      </details>
    </div>
  );
}
