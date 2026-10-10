'use client';
import LevelInput from '@/components/LevelInput';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DatePopover from '@/components/DatePopover';
import { KIND_ICON, STATUS_STYLE } from '@/components/EventCalendar';
import { useI18n } from '@/context/I18nContext';
import { todayYmd } from '@/lib/dates';
import { mapsEmbed, mapsHref } from '@/lib/maps';

export const GAME_KINDS = ['game', 'training', 'meeting', 'challenge'];
// open = upcoming; completed is also set automatically once the slot is over.
const STATUSES = ['open', 'completed', 'cancelled'];
const CANCEL_PRESETS = ['', '2', '6', '12', '24', '48'];
export const PLAY_FORMATS = ['open', 'men', 'women', 'mixed'];
// What the fee includes: quick picks that fill the "Dịch vụ" line.
const SERVICE_PICKS = ['balls', 'water', 'fruit', 'towel', 'parking'];
// What a session costs the Host (balls are bought in the ball store instead).
export const COST_CATEGORIES = ['court', 'water', 'coach', 'other'];

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
  services: '',
  play_format: '',
  map_url: '',
  cost_items: [],
  deadline_auto: true,
});

// Registration closes when the cancel-for-free window starts: start time minus the cancel
// deadline (no cancel deadline → at the start time). E.g. 17:00, 12 hours → 05:00.
export function autoDeadline(date, start, hours) {
  if (!date || !start) return '';
  const d = new Date(`${date}T${start.slice(0, 5)}:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setHours(d.getHours() - (hours === '' || hours == null ? 0 : Number(hours)));
  return toLocalInput(d.toISOString());
}

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
    services: ev.services || '',
    play_format: ev.play_format || '',
    map_url: ev.map_url || '',
    cost_items: (ev.cost_items || []).map((c) => ({ category: c.category, amount: String(c.amount), note: c.note || '' })),
    // Auto when the saved deadline is exactly "start minus the cancel deadline".
    deadline_auto:
      !!ev.registration_deadline &&
      toLocalInput(ev.registration_deadline) === autoDeadline(ev.event_date, ev.start_time, ev.cancel_deadline_hours == null ? '' : String(ev.cancel_deadline_hours)),
  };
}

const costList = (items) =>
  (items || [])
    .filter((c) => Number(c.amount) > 0)
    .map((c) => ({ category: c.category, amount: Math.round(Number(c.amount)), note: (c.note || '').trim() || null }));
export const costTotal = (items) => costList(items).reduce((s, c) => s + c.amount, 0);

// Form values -> API body (shared by create and edit). A meeting is only what, when,
// where and the fee: members vote whether they come instead of signing up by link.
export function eventPayload(f) {
  if (f.kind === 'meeting') {
    return {
      kind: 'meeting',
      title: f.title.trim(),
      event_date: f.event_date,
      start_time: f.start_time || null,
      end_time: f.end_time || null,
      location: f.location.trim() || null,
      map_url: f.map_url.trim() || null,
      fee_amount: Number(f.fee_amount || 0),
      notice: f.notice.trim() || null,
      status: f.status,
      allow_public_registration: false,
      cancel_deadline_hours: null,
    };
  }
  const deadline = f.deadline_auto ? autoDeadline(f.event_date, f.start_time, f.cancel_deadline_hours) : f.registration_deadline;
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
    registration_deadline: deadline ? new Date(deadline).toISOString() : null,
    cancel_deadline_hours: f.cancel_deadline_hours === '' ? null : Number(f.cancel_deadline_hours),
    notice: f.notice.trim() || null,
    status: f.status,
    allow_public_registration: f.allow_public_registration,
    services: f.services.trim() || null,
    play_format: f.play_format || null,
    map_url: f.map_url.trim() || null,
    cost_items: costList(f.cost_items),
  };
}

// Address of the court: typed address + optional Google Maps link, with a live map so the
// Host sees the right place; players tap the address to get directions.
function LocationField({ f, set, meeting }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(f.location);
  useEffect(() => {
    const id = setTimeout(() => setShown(f.location), 700);
    return () => clearTimeout(id);
  }, [f.location]);
  const embed = mapsEmbed(shown);
  const href = mapsHref(f.location, f.map_url);
  return (
    <>
      <Field label={meeting ? t('meeting.place') : t('events.location')} span={2}>
        <input className="input" placeholder={meeting ? t('meeting.placePh') : t('create.locationPh')} value={f.location} onChange={(e) => set({ location: e.target.value })} />
      </Field>
      <Field label={t('map.linkLabel')} span={2} hint={t('map.linkHint')}>
        <input className="input" inputMode="url" placeholder="https://maps.app.goo.gl/…" value={f.map_url} onChange={(e) => set({ map_url: e.target.value })} />
      </Field>
      {(embed || href) && (
        <div className="col-span-2 md:col-span-4">
          {embed && (
            <iframe title={t('map.preview')} src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="w-full h-48 rounded-lg border border-navy-700 bg-navy-900" />
          )}
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block mt-1 text-xs text-lime-400 hover:underline">🗺 {t('map.check')} →</a>
          )}
        </div>
      )}
    </>
  );
}

// "Chi phí mỗi buổi": what one session costs (court, water…). Each line is booked into
// the ledger as an expense on the session's day.
function CostItems({ items, onChange, sessions }) {
  const { t } = useI18n();
  const setAt = (i, patch) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const total = costTotal(items);
  return (
    <div className="col-span-2 md:col-span-4 rounded-xl border border-orange-400/30 bg-orange-400/5 p-3">
      <p className="text-orange-100 text-sm font-semibold">💸 {t('cost.title')}</p>
      <p className="text-gray-400 text-xs mt-0.5">{t('cost.hint')}</p>
      <div className="flex flex-col gap-2 mt-2">
        {items.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select className="input !w-36 shrink-0" value={c.category} onChange={(e) => setAt(i, { category: e.target.value })} aria-label={t('fin.category')}>
              {COST_CATEGORIES.map((k) => <option key={k} value={k}>{t(`cost.cat_${k}`)}</option>)}
            </select>
            <input className="input no-spin !w-32 shrink-0 text-right tabular-nums" type="number" inputMode="numeric" min="0" step="1000" placeholder="0" value={c.amount} onChange={(e) => setAt(i, { amount: e.target.value })} aria-label={t('fin.amount')} />
            <input className="input !w-auto flex-1 min-w-[10rem]" placeholder={c.category === 'other' ? t('cost.otherPh') : t('cost.notePh')} required={c.category === 'other' && Number(c.amount) > 0} value={c.note} onChange={(e) => setAt(i, { note: e.target.value })} aria-label={t('fin.note')} />
            <button type="button" className="text-red-400 px-2 text-lg leading-none" aria-label={t('common.delete')} onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <button type="button" className="btn-secondary !py-1 text-xs" disabled={items.length >= 10} onClick={() => onChange([...items, { category: items.length ? 'water' : 'court', amount: '', note: '' }])}>＋ {t('cost.add')}</button>
        {total > 0 && (
          <span className="text-orange-200 text-sm tabular-nums">
            {t('cost.perSession', { v: total.toLocaleString('vi-VN') })}
            {sessions > 1 ? ` · ${t('cost.allSessions', { n: sessions, v: (total * sessions).toLocaleString('vi-VN') })}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

// The event form in 4 groups: basic info, rules & finance, notes, status.
// `kinds`: the activity types the Host may pick here (none → the kind is fixed by the page).
// `seriesCount`: on edit, how many other upcoming sessions share this weekly schedule
// (the Host chooses this session only, or all of them). `deadlineDate`: the day the
// automatic deadline is counted from on a weekly schedule (its first session).
export default function EventForm({ initial, onSubmit, submitLabel, cancelHref = '/events', showRepeat = false, disabled = false, warning = null, kinds = null, dateField = null, lockTitle = false, showStatus = false, sessions = null, seriesCount = 0, deadlineDate = null }) {
  const { t, lang } = useI18n();
  const [f, setF] = useState(() => ({ apply_to: seriesCount > 0 ? 'series' : 'one', ...initial }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!f.event_date) return setError(t('create.needDate'));
    if (f.start_time && f.end_time && f.end_time <= f.start_time) return setError(t('create.endAfterStart'));
    if (f.level_min !== '' && f.level_max !== '' && Number(f.level_max) < Number(f.level_min)) return setError(t('create.duprRange'));
    if (f.map_url.trim() && !/^https:\/\/\S+$/i.test(f.map_url.trim())) return setError(t('map.badLink'));
    if (f.cost_items.some((c) => c.category === 'other' && Number(c.amount) > 0 && !c.note.trim())) return setError(t('cost.otherNeedNote'));
    setBusy(true);
    try {
      await onSubmit(f);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const meeting = f.kind === 'meeting';
  const autoAt = autoDeadline(deadlineDate || f.event_date, f.start_time, f.cancel_deadline_hours);
  const fmtLocal = (v) => (v ? new Date(v).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
  const perSessionCost = costTotal(f.cost_items);
  const maxIncome = Number(f.fee_amount) * Number(f.slots || 0);
  const toggleService = (key) => {
    const word = t(`svc.${key}`);
    const parts = f.services.split(',').map((x) => x.trim()).filter(Boolean);
    const has = parts.some((x) => x.toLowerCase() === word.toLowerCase());
    set({ services: (has ? parts.filter((x) => x.toLowerCase() !== word.toLowerCase()) : [...parts, word]).join(', ') });
  };
  return (
      <form onSubmit={submit} className="w-full lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-4 lg:items-start">
        <div className="min-w-0">
        <Section n={1} title={t('create.basic')}>
          {kinds && kinds.length > 1 && (
            <Field label={t('kind.label')} span={4} hint={t(`kind.hint_${f.kind}`) || null}>
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
          <Field label={meeting ? t('meeting.content') : t('events.title')} span={4}>
            <input
              className={`input ${lockTitle ? 'opacity-70 cursor-not-allowed' : ''}`}
              required
              maxLength={120}
              readOnly={lockTitle}
              placeholder={meeting ? t('meeting.contentPh') : t('create.titlePh')}
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
          <LocationField f={f} set={set} meeting={meeting} />
          {meeting && (
            <>
              <Field label={t('meeting.fee')} span={2}>
                <input className="input" type="number" inputMode="numeric" min="0" step="1" value={f.fee_amount} onChange={(e) => set({ fee_amount: e.target.value })} />
              </Field>
              <Field label={t('meeting.details')} span={4}>
                <textarea className="input" rows={3} placeholder={t('meeting.detailsPh')} value={f.notice} onChange={(e) => set({ notice: e.target.value })} />
              </Field>
              <p className="col-span-2 md:col-span-4 rounded-lg border border-sky-400/40 bg-sky-400/5 px-3 py-2 text-sm text-sky-100">🗳 {t('meeting.voteNote')}</p>
            </>
          )}
          {!meeting && (
          <Field label={t('events.courts')}>
            <input className="input" type="number" inputMode="numeric" min="1" max="50" value={f.courts} onChange={(e) => set({ courts: e.target.value })} />
          </Field>
          )}
          {showRepeat && (
            <Field label={t('events.repeatWeeks')} hint={t('events.repeatHint')}>
              <input className="input" type="number" inputMode="numeric" min="1" max="26" value={f.repeat_weeks} onChange={(e) => set({ repeat_weeks: e.target.value })} />
            </Field>
          )}
        </Section>

        {!meeting && (
        <>
        <Section n={2} title={t('create.rules')}>
          <Field label={t('events.slots')}>
            <input className="input" type="number" inputMode="numeric" min="1" max="500" value={f.slots} onChange={(e) => set({ slots: e.target.value })} />
          </Field>
          <Field label={t('create.fee')}>
            <input className="input" type="number" inputMode="numeric" min="0" step="1" value={f.fee_amount} onChange={(e) => set({ fee_amount: e.target.value })} />
          </Field>
          <Field label={t('fmt.label')} span={2} hint={t('fmt.hint')}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-1">
              {PLAY_FORMATS.map((k) => (
                <button key={k} type="button" aria-pressed={(f.play_format || 'open') === k} onClick={() => set({ play_format: k === 'open' ? '' : k })} className={`rounded-lg border px-2 py-2 text-sm ${(f.play_format || 'open') === k ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                  {t(`fmt.${k}`)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('svc.label')} span={4} hint={t('svc.hint')}>
            <input className="input" maxLength={300} placeholder={t('svc.ph')} value={f.services} onChange={(e) => set({ services: e.target.value })} />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {SERVICE_PICKS.map((k) => {
                const on = f.services.toLowerCase().split(',').map((x) => x.trim()).includes(t(`svc.${k}`).toLowerCase());
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => toggleService(k)} className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-lime-400 bg-lime-400/15 text-lime-200' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                    {on ? '✓ ' : '+ '}{t(`svc.${k}`)}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={t('events.levelMin')}>
            <LevelInput value={f.level_min} onChange={(v) => set({ level_min: v })} placeholder="—" />
          </Field>
          <Field label={t('events.levelMax')}>
            <LevelInput value={f.level_max} onChange={(v) => set({ level_max: v })} placeholder="—" />
          </Field>
          <Field label={t('policy.label')} span={2} hint={f.cancel_deadline_hours === '' ? t('policy.noneHint') : t('policy.hint', { h: f.cancel_deadline_hours })}>
            <select className="input" value={f.cancel_deadline_hours} onChange={(e) => set({ cancel_deadline_hours: e.target.value })}>
              {[...CANCEL_PRESETS, ...(CANCEL_PRESETS.includes(f.cancel_deadline_hours) ? [] : [f.cancel_deadline_hours])].map((h) => <option key={h} value={h}>{h === '' ? t('policy.none') : t('policy.hours', { h })}</option>)}
            </select>
          </Field>
          <Field label={t('events.deadline')} span={2}>
            <label className="flex items-center gap-2 text-sm text-gray-200 mt-1">
              <input type="checkbox" checked={f.deadline_auto} onChange={(e) => set({ deadline_auto: e.target.checked, registration_deadline: e.target.checked ? f.registration_deadline : f.registration_deadline || autoAt })} />
              {t('dl.auto')}
            </label>
            {f.deadline_auto ? (
              <p className="mt-1 rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-gray-100">
                {autoAt ? (sessions > 1 ? t('dl.autoEach', { h: f.cancel_deadline_hours || 0, time: autoAt.slice(11, 16) }) : t('dl.autoAt', { at: fmtLocal(autoAt), h: f.cancel_deadline_hours || 0 })) : t('dl.needStart')}
              </p>
            ) : (
              <input className="input mt-1" type="datetime-local" value={f.registration_deadline} onChange={(e) => set({ registration_deadline: e.target.value })} />
            )}
            <p className="text-gray-500 text-xs mt-1">🔓 {t('dl.reopenHint')}</p>
          </Field>
          <CostItems items={f.cost_items} onChange={(cost_items) => set({ cost_items })} sessions={sessions || 1} />
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
        </>
        )}

        {showStatus && (
        <Section n={meeting ? 2 : 4} title={t('common.status')} hint={t('create.statusHint')}>
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

        {seriesCount > 0 && (
          <section className="card mb-4 border-sky-400/40">
            <h2 className="text-white font-semibold">🔁 {t('series.title')}</h2>
            <p className="text-gray-400 text-xs mt-0.5">{t('series.hint')}</p>
            <div className="mt-2 flex flex-col gap-2">
              {[['series', t('series.all', { n: seriesCount + 1 })], ['one', t('series.one')]].map(([v, label]) => (
                <label key={v} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${f.apply_to === v ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300'}`}>
                  <input type="radio" name="apply_to" checked={f.apply_to === v} onChange={() => set({ apply_to: v })} />
                  {label}
                </label>
              ))}
            </div>
          </section>
        )}
        {warning && <p className="card !py-3 mb-3 border-yellow-400/50 text-yellow-200 text-sm">⚠️ {warning}</p>}
        {error && <p className="text-red-400 text-sm mb-3 lg:hidden">{error}</p>}
        <div className="flex gap-3 lg:hidden">
          <button className="btn-primary" disabled={busy || disabled}>{busy ? '…' : submitLabel}</button>
          <Link href={cancelHref} className="btn-secondary">{t('common.cancel')}</Link>
        </div>
        </div>

        <aside className="hidden lg:block sticky top-4">
          <div className="card !p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-navy-700 bg-navy-900/50">
              <p className="text-gray-400 text-[11px] uppercase tracking-wide font-semibold">{t('createx.preview')}</p>
              <p className="text-white font-semibold truncate mt-0.5">
                {KIND_ICON[f.kind] && <span className="mr-1">{KIND_ICON[f.kind]}</span>}
                {f.title || <span className="text-gray-500">{t('createx.untitled')}</span>}
              </p>
            </div>
            <dl className="px-4 py-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-gray-400">📅</dt>
              <dd className="text-gray-100">
                {sessions != null
                  ? t('createx.sessionsN', { n: sessions })
                  : f.event_date
                    ? new Date(`${f.event_date}T00:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })
                    : '—'}
              </dd>
              <dt className="text-gray-400">🕒</dt>
              <dd className="text-gray-100 tabular-nums">{f.start_time || '—'}{f.end_time ? ` – ${f.end_time}` : ''}</dd>
              <dt className="text-gray-400">📍</dt>
              <dd className="text-gray-100 truncate">{f.location || '—'}{f.courts && !meeting ? ` · ${t('createx.courtsN', { n: f.courts })}` : ''}</dd>
              {!meeting && <dt className="text-gray-400">👥</dt>}
              {!meeting && <dd className="text-gray-100">{t('createx.slotsN', { n: f.slots || 0 })}</dd>}
              <dt className="text-gray-400">💰</dt>
              <dd className="text-gray-100 tabular-nums">
                {Number(f.fee_amount) > 0 ? `${Number(f.fee_amount).toLocaleString('vi-VN')}đ / ${t('createx.perPerson')}` : t('createx.free')}
                {f.services.trim() && <span className="block text-gray-400 text-xs">🎁 {f.services}</span>}
              </dd>
              {!meeting && f.play_format && (
                <>
                  <dt className="text-gray-400">🏓</dt>
                  <dd className="text-gray-100">{t(`fmt.${f.play_format}`)}</dd>
                </>
              )}
              {meeting ? (
                <>
                  <dt className="text-gray-400">🗳</dt>
                  <dd className="text-sky-200">{t('meeting.votePreview')}</dd>
                </>
              ) : (
                <>
                  <dt className="text-gray-400">⏳</dt>
                  <dd className="text-gray-100">{f.cancel_deadline_hours === '' ? t('policy.none') : t('policy.hours', { h: f.cancel_deadline_hours })}</dd>
                  <dt className="text-gray-400">📝</dt>
                  <dd className="text-gray-100">{f.deadline_auto ? (autoAt ? (sessions > 1 ? t('dl.previewEach', { time: autoAt.slice(11, 16) }) : fmtLocal(autoAt)) : '—') : fmtLocal(f.registration_deadline)}</dd>
                  <dt className="text-gray-400">🔗</dt>
                  <dd className={f.allow_public_registration ? 'text-lime-300' : 'text-gray-400'}>{f.allow_public_registration ? t('createx.linkOn') : t('createx.linkOff')}</dd>
                </>
              )}
            </dl>
            {!meeting && (maxIncome > 0 || perSessionCost > 0) && (
              <div className="mx-4 mb-3 rounded-lg bg-lime-400/10 border border-lime-400/30 px-3 py-2 text-xs text-lime-100 flex flex-col gap-0.5">
                <span className="text-gray-300 font-semibold">{t('createx.perSessionTitle')}</span>
                {maxIncome > 0 && <span>{t('createx.maxIncome', { v: maxIncome.toLocaleString('vi-VN') })}</span>}
                {perSessionCost > 0 && <span className="text-orange-200">{t('createx.costs', { v: perSessionCost.toLocaleString('vi-VN') })}</span>}
                {maxIncome > 0 && perSessionCost > 0 && <span className="font-semibold">{t('createx.maxProfit', { v: (maxIncome - perSessionCost).toLocaleString('vi-VN') })}</span>}
              </div>
            )}
            <div className="p-4 border-t border-navy-700 flex flex-col gap-2">
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button className="btn-primary w-full" disabled={busy || disabled}>{busy ? '…' : submitLabel}</button>
              <Link href={cancelHref} className="btn-secondary w-full text-center">{t('common.cancel')}</Link>
            </div>
          </div>
        </aside>
      </form>
  );
}
