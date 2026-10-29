'use client';
import { useMemo, useState } from 'react';
import Segmented from '@/components/ui/Segmented';
import DateInput from '@/components/ui/DateInput';
import Hint from '@/components/ui/Hint';
import { useI18n } from '@/context/I18nContext';
import { addDays, todayYmd } from '@/lib/dates';
import { WEEKDAYS, expandDates, dmy } from '@/lib/coach';

export const KINDS = ['group', 'private', 'single'];

export function emptyClass(coach) {
  const today = todayYmd();
  return {
    title: '',
    kind: 'group',
    court_name: coach?.court_name || '',
    map_url: coach?.map_url || '',
    start_time: '18:00',
    duration_min: 90,
    weekdays: [],
    date_from: today,
    date_to: addDays(today, 27),
    date: today,
    capacity: 8,
    fee: 0,
    signup_deadline_hours: 2,
    waitlist: true,
    deduct_mode: '',
    note: '',
    status: 'open',
  };
}

// The class form: shared by "Tạo lớp" (schedule fields on) and the class's Cài đặt tab
// (schedule fixed; time / court changes may be pushed to the upcoming sessions).
export default function ClassForm({ value: f, onChange, creating = false, applyUpcoming, setApplyUpcoming }) {
  const { t } = useI18n();
  const set = (k) => (e) => onChange({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });
  const toggleDay = (d) => onChange({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort() });
  const preview = useMemo(() => (creating && f.kind !== 'single' ? expandDates(f.weekdays, f.date_from, f.date_to) : []), [creating, f.kind, f.weekdays, f.date_from, f.date_to]);
  const [showAll, setShowAll] = useState(false);
  const label = (k, hint) => (
    <label className="text-xs text-gray-400 flex items-center gap-1">
      {t(`coach.c_${k}`)}
      {hint && <Hint inline text={t(`coach.ch_${k}`)} />}
    </label>
  );
  return (
    <div className="grid gap-4">
      <section className="card grid gap-3">
        <h2 className="text-white font-semibold">{t('coach.cSecWhat')}</h2>
        <div>
          {label('title')}
          <input className="input" required maxLength={120} value={f.title} onChange={set('title')} placeholder={t('coach.cTitlePh')} />
        </div>
        <div>
          {label('kind', true)}
          {creating ? (
            <Segmented items={KINDS} value={f.kind} onChange={(k) => onChange({ ...f, kind: k, capacity: k === 'private' ? 1 : f.capacity === 1 ? 8 : f.capacity })} label={(k) => t(`coach.kind_${k}`)} full />
          ) : (
            <p className="text-gray-200 text-sm">{t(`coach.kind_${f.kind}`)}</p>
          )}
        </div>
        <div>
          {label('note')}
          <textarea className="input min-h-[5rem]" maxLength={1000} value={f.note} onChange={set('note')} placeholder={t('coach.cNotePh')} />
        </div>
      </section>

      <section className="card grid gap-3">
        <h2 className="text-white font-semibold">{t('coach.cSecWhen')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            {label('start_time')}
            <input className="input" type="time" required value={f.start_time} onChange={set('start_time')} />
          </div>
          <div>
            {label('duration_min')}
            <input className="input" type="number" min="15" max="480" step="15" required value={f.duration_min} onChange={set('duration_min')} />
          </div>
        </div>
        {creating && f.kind === 'single' && (
          <div>
            {label('date')}
            <DateInput value={f.date} onChange={(v) => onChange({ ...f, date: v })} required />
          </div>
        )}
        {creating && f.kind !== 'single' && (
          <>
            <div>
              {label('weekdays')}
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((d) => (
                  <button key={d} type="button" aria-pressed={f.weekdays.includes(d)} onClick={() => toggleDay(d)} className={`min-h-[44px] rounded-lg border text-sm ${f.weekdays.includes(d) ? 'bg-lime-400 text-navy-950 border-lime-400 font-semibold' : 'border-navy-600 text-gray-300 hover:border-gray-400'}`}>
                    {t(`insights.dow_${d}`).replace('Thứ ', 'T').replace('Chủ nhật', 'CN')}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                {label('date_from')}
                <DateInput value={f.date_from} onChange={(v) => onChange({ ...f, date_from: v })} required />
              </div>
              <div>
                {label('date_to')}
                <DateInput value={f.date_to} onChange={(v) => onChange({ ...f, date_to: v })} min={f.date_from} required />
              </div>
            </div>
            <div className={`rounded-lg border px-3 py-2 text-sm ${preview.length ? 'border-lime-400/40 bg-lime-400/5 text-gray-200' : 'border-navy-700 text-gray-400'}`}>
              {preview.length ? (
                <>
                  <span className="font-semibold text-white">{t('coach.cPreview', { n: preview.length })}</span>
                  <span className="block text-xs text-gray-400 mt-1 break-words">
                    {(showAll ? preview : preview.slice(0, 12)).map(dmy).join(' · ')}
                    {preview.length > 12 && !showAll && <button type="button" className="ml-2 text-lime-300 underline" onClick={() => setShowAll(true)}>{t('coach.cPreviewAll')}</button>}
                  </span>
                </>
              ) : (
                t('coach.cPreviewNone')
              )}
            </div>
          </>
        )}
        {!creating && (
          <label className="flex items-start gap-2 text-sm text-gray-200">
            <input type="checkbox" className="mt-1" checked={!!applyUpcoming} onChange={(e) => setApplyUpcoming(e.target.checked)} />
            <span>
              {t('coach.cApplyUpcoming')}
              <span className="block text-gray-400 text-xs">{t('coach.cApplyUpcomingHint')}</span>
            </span>
          </label>
        )}
      </section>

      <section className="card grid gap-3">
        <h2 className="text-white font-semibold">{t('coach.cSecWhere')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            {label('court_name')}
            <input className="input" maxLength={160} value={f.court_name} onChange={set('court_name')} />
          </div>
          <div>
            {label('map_url')}
            <input className="input" type="url" maxLength={500} value={f.map_url} onChange={set('map_url')} placeholder="https://maps.app.goo.gl/…" />
          </div>
        </div>
      </section>

      <section className="card grid gap-3">
        <h2 className="text-white font-semibold">{t('coach.cSecSignup')}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            {label('capacity', true)}
            <input className="input" type="number" min="1" max="100" required value={f.capacity} onChange={set('capacity')} disabled={f.kind === 'private'} />
          </div>
          <div>
            {label('fee', true)}
            <input className="input" type="number" inputMode="numeric" min="0" step="1000" value={f.fee} onChange={set('fee')} />
          </div>
          <div>
            {label('signup_deadline_hours', true)}
            <input className="input" type="number" min="0" max="168" value={f.signup_deadline_hours} onChange={set('signup_deadline_hours')} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-200 min-h-[44px]">
            <input type="checkbox" checked={!!f.waitlist} onChange={set('waitlist')} /> {t('coach.c_waitlist')}
          </label>
          <div>
            {label('deduct_mode', true)}
            <select className="input" value={f.deduct_mode || ''} onChange={set('deduct_mode')}>
              <option value="">{t('coach.cDeductDefault')}</option>
              {['present_or_noshow', 'present_only', 'always'].map((k) => <option key={k} value={k}>{t(`coach.deduct_${k}`)}</option>)}
            </select>
          </div>
        </div>
        {!creating && (
          <div>
            {label('status', true)}
            <Segmented items={['open', 'closed']} value={f.status === 'archived' ? 'closed' : f.status} onChange={set('status')} label={(k) => t(`coach.cstatus_${k}`)} full />
          </div>
        )}
      </section>
    </div>
  );
}

// What the API takes from the form.
export function classBody(f, creating) {
  const body = {
    title: f.title.trim(),
    court_name: f.court_name.trim() || null,
    map_url: f.map_url.trim() || null,
    start_time: f.start_time,
    duration_min: Number(f.duration_min),
    capacity: Number(f.capacity),
    fee: Number(f.fee || 0),
    signup_deadline_hours: Number(f.signup_deadline_hours || 0),
    waitlist: !!f.waitlist,
    deduct_mode: f.deduct_mode || null,
    note: f.note.trim() || null,
  };
  if (creating) {
    body.kind = f.kind;
    if (f.kind === 'single') body.date = f.date;
    else {
      body.weekdays = f.weekdays;
      body.date_from = f.date_from;
      body.date_to = f.date_to;
    }
  } else body.status = f.status;
  return body;
}
