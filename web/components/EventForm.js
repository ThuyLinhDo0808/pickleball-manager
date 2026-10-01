'use client';
import { useState } from 'react';
import Link from 'next/link';
import DatePopover from '@/components/DatePopover';
import { KIND_ICON, STATUS_STYLE } from '@/components/EventCalendar';
import { useI18n } from '@/context/I18nContext';
import { todayYmd } from '@/lib/dates';

export const GAME_KINDS = ['game', 'training', 'meeting', 'challenge'];
// open = upcoming; completed is also set automatically once the slot is over.
const STATUSES = ['open', 'completed', 'cancelled'];
const CANCEL_PRESETS = ['', '2', '6', '12', '24', '48'];

export const blankEvent = (date = todayYmd(), kind = 'game') => ({
  kind,
  title: '',
  event_date: date,
  start_time: '19:00',
  end_time: '21:00',
  location: '',
  courts: 2,
  slots: 16,
  level_min: '',
  level_max: '',
  fee_amount: 0,
  registration_deadline: '',
  cancel_deadline_hours: '12',
  notice: '',
  status: 'open',
  allow_public_registration: true,
  repeat_weeks: 1,
});

function Section({ n, title, hint, children }) {
  return (
    <section className="card mb-4">
      <h2 className="text-white font-semibold flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-lime-400 text-navy-950 text-xs font-bold">{n}</span>
        {title}
      </h2>
      {hint && <p className="text-gray-500 text-xs mt-1">{hint}</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, span = 1, children }) {
  const cls = `min-w-0 ${{ 1: 'col-span-1', 2: 'col-span-2', 4: 'col-span-2 md:col-span-4' }[span]}`;
  return (
    <div className={cls}>
      <label className="text-xs text-gray-400">{label}</label>
      {children}
      {hint && <p className="text-gray-500 text-xs mt-1">{hint}</p>}
    </div>
  );
}

// ISO timestamp -> <input type="datetime-local"> value in the viewer's timezone.
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// An existing event -> form values (for editing).
export function formFromEvent(ev) {
  return {
    ...blankEvent(ev.event_date, ev.kind || 'game'),
    title: ev.title || '',
    start_time: ev.start_time ? ev.start_time.slice(0, 5) : '',
    end_time: ev.end_time ? ev.end_time.slice(0, 5) : '',
    location: ev.location || '',
    courts: ev.courts ?? 1,
    slots: ev.slots ?? 16,
    level_min: ev.level_min ?? '',
    level_max: ev.level_max ?? '',
    fee_amount: ev.fee_amount ?? 0,
    registration_deadline: toLocalInput(ev.registration_deadline),
    cancel_deadline_hours: ev.cancel_deadline_hours == null ? '' : String(ev.cancel_deadline_hours),
    notice: ev.notice || '',
    status: ['draft', 'closed'].includes(ev.status) ? 'open' : ev.status,
    allow_public_registration: !!ev.allow_public_registration,
  };
}

// Form values -> API body (shared by create and edit).
export function eventPayload(f) {
  return {
    kind: f.kind,
    title: f.title.trim(),
    event_date: f.event_date,
    start_time: f.start_time || null,
    end_time: f.end_time || null,
    location: f.location.trim() || null,
    courts: Number(f.courts),
    slots: Number(f.slots),
    level_min: f.level_min === '' ? null : Number(f.level_min),
    level_max: f.level_max === '' ? null : Number(f.level_max),
    fee_amount: Number(f.fee_amount || 0),
    registration_deadline: f.registration_deadline ? new Date(f.registration_deadline).toISOString() : null,
    cancel_deadline_hours: f.cancel_deadline_hours === '' ? null : Number(f.cancel_deadline_hours),
    notice: f.notice.trim() || null,
    status: f.status,
    allow_public_registration: f.allow_public_registration,
  };
}

// The event form in 4 groups: basic info, rules & finance, notes, status.
// `kinds`: the activity types the Host may pick here (none → the kind is fixed by the page).
export default function EventForm({ initial, onSubmit, submitLabel, cancelHref = '/events', showRepeat = false, disabled = false, warning = null, kinds = null, dateField = null, lockTitle = false, showStatus = false }) {
  const { t } = useI18n();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!f.event_date) return setError(t('create.needDate'));
    if (f.start_time && f.end_time && f.end_time <= f.start_time) return setError(t('create.endAfterStart'));
    if (f.level_min !== '' && f.level_max !== '' && Number(f.level_max) < Number(f.level_min)) return setError(t('create.duprRange'));
    setBusy(true);
    try {
      await onSubmit(f);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
      <form onSubmit={submit} className="w-full">
        <Section n={1} title={t('create.basic')}>
          {kinds && kinds.length > 1 && (
            <Field label={t('kind.label')} span={4} hint={t(`kind.hint_${f.kind}`)}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                {kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={f.kind === k}
                    onClick={() => set({ kind: k })}
                    className={`rounded-lg border px-3 py-2 text-sm text-left ${f.kind === k ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
                  >
                    <span className="mr-1">{KIND_ICON[k]}</span>
                    {t(`kind.${k}`)}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label={t('events.title')} span={4}>
            <input
              className={`input ${lockTitle ? 'opacity-70 cursor-not-allowed' : ''}`}
              required
              maxLength={120}
              readOnly={lockTitle}
              placeholder={t('create.titlePh')}
              value={f.title}
              onChange={(e) => !lockTitle && set({ title: e.target.value })}
            />
          </Field>
          {dateField ? (
            <Field label={t('weekly.sessions')} span={4}>{dateField}</Field>
          ) : (
            <Field label={t('events.date')} span={2}>
              <DatePopover value={f.event_date} onChange={(d) => set({ event_date: d })} />
            </Field>
          )}
          <Field label={t('create.start')}>
            <input className="input" type="time" value={f.start_time} onChange={(e) => set({ start_time: e.target.value })} />
          </Field>
          <Field label={t('create.end')}>
            <input className="input" type="time" value={f.end_time} onChange={(e) => set({ end_time: e.target.value })} />
          </Field>
          <Field label={t('events.location')} span={2}>
            <input className="input" placeholder={t('create.locationPh')} value={f.location} onChange={(e) => set({ location: e.target.value })} />
          </Field>
          <Field label={t('events.courts')}>
            <input className="input" type="number" inputMode="numeric" min="1" max="50" value={f.courts} onChange={(e) => set({ courts: e.target.value })} />
          </Field>
          {showRepeat && (
            <Field label={t('events.repeatWeeks')} hint={t('events.repeatHint')}>
              <input className="input" type="number" inputMode="numeric" min="1" max="26" value={f.repeat_weeks} onChange={(e) => set({ repeat_weeks: e.target.value })} />
            </Field>
          )}
        </Section>

        <Section n={2} title={t('create.rules')}>
          <Field label={t('events.slots')}>
            <input className="input" type="number" inputMode="numeric" min="1" max="500" value={f.slots} onChange={(e) => set({ slots: e.target.value })} />
          </Field>
          <Field label={t('create.fee')}>
            <input className="input" type="number" inputMode="numeric" min="0" step="1000" value={f.fee_amount} onChange={(e) => set({ fee_amount: e.target.value })} />
          </Field>
          <Field label={t('events.levelMin')}>
            <input className="input" type="number" inputMode="decimal" step="0.25" min="1" max="8" placeholder="—" value={f.level_min} onChange={(e) => set({ level_min: e.target.value })} />
          </Field>
          <Field label={t('events.levelMax')}>
            <input className="input" type="number" inputMode="decimal" step="0.25" min="1" max="8" placeholder="—" value={f.level_max} onChange={(e) => set({ level_max: e.target.value })} />
          </Field>
          <Field label={t('events.deadline')} span={2}>
            <input className="input" type="datetime-local" value={f.registration_deadline} onChange={(e) => set({ registration_deadline: e.target.value })} />
          </Field>
          <Field label={t('policy.label')} span={2} hint={f.cancel_deadline_hours === '' ? t('policy.noneHint') : t('policy.hint', { h: f.cancel_deadline_hours })}>
            <select className="input" value={f.cancel_deadline_hours} onChange={(e) => set({ cancel_deadline_hours: e.target.value })}>
              {[...CANCEL_PRESETS, ...(CANCEL_PRESETS.includes(f.cancel_deadline_hours) ? [] : [f.cancel_deadline_hours])].map((h) => <option key={h} value={h}>{h === '' ? t('policy.none') : t('policy.hours', { h })}</option>)}
            </select>
          </Field>
        </Section>

        <Section n={3} title={t('create.notes')}>
          <Field label={t('events.notice')} span={4}>
            <textarea className="input" rows={3} placeholder={t('events.noticeHint')} value={f.notice} onChange={(e) => set({ notice: e.target.value })} />
          </Field>
          <label className="col-span-2 md:col-span-4 flex items-center gap-2 text-sm text-gray-200">
            <input type="checkbox" checked={f.allow_public_registration} onChange={(e) => set({ allow_public_registration: e.target.checked })} />
            {t('events.allowPublic')}
          </label>
        </Section>

        {showStatus && (
        <Section n={4} title={t('common.status')} hint={t('create.statusHint')}>
          <div className="col-span-2 md:col-span-4 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ status: s })}
                aria-pressed={f.status === s}
                className={`rounded-lg border-l-4 px-3 py-2 text-sm ${STATUS_STYLE[s]} ${f.status === s ? 'ring-2 ring-lime-400' : 'opacity-60 hover:opacity-100'}`}
              >
                {t(`events.status_${s}`)}
              </button>
            ))}
          </div>
        </Section>
        )}

        {warning && <p className="card !py-3 mb-3 border-yellow-400/50 text-yellow-200 text-sm">⚠️ {warning}</p>}
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <div className="flex gap-3">
          <button className="btn-primary" disabled={busy || disabled}>{busy ? '…' : submitLabel}</button>
          <Link href={cancelHref} className="btn-secondary">{t('common.cancel')}</Link>
        </div>
      </form>
  );
}
