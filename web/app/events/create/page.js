'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import DatePopover from '@/components/DatePopover';
import { STATUS_STYLE } from '@/components/EventCalendar';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { api } from '@/lib/api';
import { todayYmd } from '@/lib/dates';

const STATUSES = ['draft', 'open', 'closed', 'completed', 'cancelled'];
const CANCEL_PRESETS = ['', '2', '6', '12', '24', '48'];

const blank = (date) => ({
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
  const cls = { 1: 'col-span-1', 2: 'col-span-2', 4: 'col-span-2 md:col-span-4' }[span];
  return (
    <div className={cls}>
      <label className="text-xs text-gray-400">{label}</label>
      {children}
      {hint && <p className="text-gray-500 text-xs mt-1">{hint}</p>}
    </div>
  );
}

export default function CreateEventPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { club } = useDefaultClub();
  const isClub = workspace === 'club';
  const [f, setF] = useState(() => blank(todayYmd()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

  // /events/create?date=YYYY-MM-DD (from the calendar's day view)
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('date');
    if (/^\d{4}-\d{2}-\d{2}$/.test(d || '')) set({ event_date: d });
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!f.event_date) return setError(t('create.needDate'));
    if (f.start_time && f.end_time && f.end_time <= f.start_time) return setError(t('create.endAfterStart'));
    if (f.level_min !== '' && f.level_max !== '' && Number(f.level_max) < Number(f.level_min)) return setError(t('create.duprRange'));
    setBusy(true);
    try {
      const created = await api.post('/api/events', {
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
        club_id: isClub ? club?.id || null : null,
        repeat_weeks: isClub ? Number(f.repeat_weeks || 1) : 1,
      });
      // One event: open it so the Host can share the link. Several: back to the calendar.
      router.push(created.created_count > 1 ? '/events' : `/events/${created.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-white text-2xl font-bold">{t('create.title')}</h1>
        <Link href="/events" className="text-gray-400 text-sm hover:text-white">← {isClub ? t('nav.schedule') : t('nav.kevents')}</Link>
      </div>
      {isClub && club && <p className="text-gray-400 text-sm -mt-2 mb-4">{t('create.forClub', { name: club.name })}</p>}

      <form onSubmit={submit} className="max-w-4xl">
        <Section n={1} title={t('create.basic')}>
          <Field label={t('events.title')} span={4}>
            <input className="input" required maxLength={120} placeholder={t('create.titlePh')} value={f.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label={t('events.date')} span={2}>
            <DatePopover value={f.event_date} onChange={(d) => set({ event_date: d })} />
          </Field>
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
          {isClub && (
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
              {CANCEL_PRESETS.map((h) => <option key={h} value={h}>{h === '' ? t('policy.none') : t('policy.hours', { h })}</option>)}
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

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <div className="flex gap-3">
          <button className="btn-primary" disabled={busy || (isClub && !club)}>{busy ? '…' : t('create.submit')}</button>
          <Link href="/events" className="btn-secondary">{t('common.cancel')}</Link>
        </div>
      </form>
    </AppShell>
  );
}
