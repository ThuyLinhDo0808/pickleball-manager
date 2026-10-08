'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

const ymd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const mondayOf = (s) => {
  const d = new Date(`${s}T00:00:00`);
  return addDays(s, -((d.getDay() + 6) % 7));
};
const hm = (v) => (v ? String(v).slice(0, 5) : '');

function ShiftForm({ initial, staff, onSave, onCancel, busy, error }) {
  const { t } = useI18n();
  const [f, setF] = useState({
    title: initial?.title || t('roster.defaultTitle'),
    shift_date: initial?.shift_date || ymd(new Date()),
    start_time: hm(initial?.start_time) || '18:00',
    end_time: hm(initial?.end_time) || '21:00',
    notes: initial?.notes || '',
    people: (initial?.people || []).map((p) => p.email),
    repeat_weeks: 1,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (email) => setF({ ...f, people: f.people.includes(email) ? f.people.filter((x) => x !== email) : [...f.people, email] });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="card !p-4 flex flex-col gap-3 mb-4">
      <div className="grid sm:grid-cols-4 gap-3">
        <label className="text-sm text-gray-300 sm:col-span-2">
          {t('roster.title')}
          <input className="input mt-1" required maxLength={80} value={f.title} onChange={set('title')} />
        </label>
        <label className="text-sm text-gray-300">
          {t('roster.date')}
          <input type="date" className="input mt-1" required value={f.shift_date} onChange={set('shift_date')} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-gray-300">
            {t('roster.from')}
            <input type="time" className="input mt-1" value={f.start_time} onChange={set('start_time')} />
          </label>
          <label className="text-sm text-gray-300">
            {t('roster.to')}
            <input type="time" className="input mt-1" value={f.end_time} onChange={set('end_time')} />
          </label>
        </div>
      </div>
      <fieldset>
        <legend className="text-sm text-gray-300 mb-1">{t('roster.people')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {staff.map((s) => (
            <button
              key={s.email}
              type="button"
              aria-pressed={f.people.includes(s.email)}
              onClick={() => toggle(s.email)}
              className={`rounded-full px-3 py-1 text-sm border ${f.people.includes(s.email) ? 'border-lime-400 bg-lime-400 text-navy-950 font-semibold' : 'border-navy-600 text-gray-300'}`}
            >
              {s.full_name || s.email}
              <span className="opacity-70 text-xs"> · {t(`clubLog.role_${s.role}`) === `clubLog.role_${s.role}` ? s.role : t(`clubLog.role_${s.role}`)}</span>
            </button>
          ))}
        </div>
        {staff.length <= 1 && <p className="text-gray-500 text-xs mt-1">{t('roster.noStaff')}</p>}
      </fieldset>
      <div className="grid sm:grid-cols-[1fr_200px] gap-3">
        <label className="text-sm text-gray-300">
          {t('roster.notes')}
          <input className="input mt-1" maxLength={300} value={f.notes} onChange={set('notes')} placeholder={t('roster.notesPh')} />
        </label>
        {!initial && (
          <label className="text-sm text-gray-300">
            {t('roster.repeat')}
            <select className="input mt-1" value={f.repeat_weeks} onChange={set('repeat_weeks')}>
              {[1, 2, 4, 8, 12].map((n) => <option key={n} value={n}>{n === 1 ? t('roster.once') : t('roster.weeksN', { n })}</option>)}
            </select>
          </label>
        )}
      </div>
      {error && <p className="text-red-300 text-sm">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" className="btn-primary text-sm" disabled={busy}>{t('common.save')}</button>
      </div>
    </form>
  );
}

// Duty roster (Pro): shifts and who is on each. The owner / co-admins plan it; all the
// club's staff see it, with their own shifts highlighted.
export default function RosterPage() {
  const { t, lang } = useI18n();
  const { club } = useDefaultClub();
  const [start, setStart] = useState(() => mondayOf(ymd(new Date())));
  const [mine, setMine] = useState(false);
  const [editing, setEditing] = useState(null); // 'new' | shift
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = addDays(start, 27);
  const { data, error, reload } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/roster?from=${start}&to=${end}`) : Promise.resolve(null)), [club?.id, start]);

  const save = async (f) => {
    setBusy(true);
    setErr('');
    const body = { ...f, start_time: f.start_time || null, end_time: f.end_time || null, repeat_weeks: Number(f.repeat_weeks) };
    try {
      if (editing === 'new') await api.post(`/api/clubs/${club.id}/roster`, body);
      else await api.patch(`/api/clubs/${club.id}/roster/${editing.id}`, { title: body.title, shift_date: body.shift_date, start_time: body.start_time, end_time: body.end_time, notes: body.notes, people: body.people });
      setEditing(null);
      reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (s) => {
    if (!window.confirm(t('roster.deleteAsk', { title: s.title }))) return;
    await api.del(`/api/clubs/${club.id}/roster/${s.id}`).catch(() => {});
    reload();
  };

  const days = Array.from({ length: 28 }, (_, i) => addDays(start, i));
  const shifts = (data?.shifts || []).filter((s) => !mine || s.people.some((p) => p.email === data.me));
  const today = ymd(new Date());
  const dayName = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const myCount = (data?.shifts || []).filter((s) => s.people.some((p) => p.email === data?.me)).length;

  return (
    <AppShell>
      <PageHeader
        icon="🗓"
        title={t('nav.roster')}
        subtitle={club?.name}
        actions={data?.can_manage && editing !== 'new' ? <button type="button" className="btn-primary text-sm" onClick={() => { setErr(''); setEditing('new'); }}>＋ {t('roster.add')}</button> : null}
      />
      {editing && data && <ShiftForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} staff={data.staff} onSave={save} onCancel={() => setEditing(null)} busy={busy} error={err} />}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" className="btn-secondary !py-1 text-sm" onClick={() => setStart(addDays(start, -28))} aria-label={t('roster.prev')}>←</button>
        <span className="text-gray-200 text-sm tabular-nums">{dayName(start)} – {dayName(end)}</span>
        <button type="button" className="btn-secondary !py-1 text-sm" onClick={() => setStart(addDays(start, 28))} aria-label={t('roster.next')}>→</button>
        <button type="button" className="btn-secondary !py-1 text-sm" onClick={() => setStart(mondayOf(today))}>{t('roster.thisWeek')}</button>
        <label className="ml-auto flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t('roster.mineOnly', { n: myCount })}
        </label>
      </div>
      {error && <p className="card text-red-300 text-sm">{error.message}</p>}
      {!data && !error && <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
      {data && shifts.length === 0 && <p className="card text-gray-500 text-sm">{t(mine ? 'roster.noneMine' : 'roster.none')}</p>}
      {data && shifts.length > 0 && (
        <div className="flex flex-col gap-2">
          {days.filter((d) => shifts.some((s) => s.shift_date === d)).map((d) => (
            <section key={d} className={`card !p-3 ${d === today ? 'border-lime-400/60' : ''}`}>
              <h2 className={`text-sm font-semibold mb-2 ${d === today ? 'text-lime-300' : 'text-gray-300'}`}>{dayName(d)}{d === today ? ` · ${t('roster.today')}` : ''}</h2>
              <ul className="flex flex-col gap-2">
                {shifts.filter((s) => s.shift_date === d).map((s) => {
                  const onIt = s.people.some((p) => p.email === data.me);
                  return (
                    <li key={s.id} className={`rounded-lg border px-3 py-2 ${onIt ? 'border-lime-400/60 bg-lime-400/5' : 'border-navy-600'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-white font-semibold text-sm">
                          {s.title}
                          {(s.start_time || s.end_time) && <span className="text-gray-400 font-normal tabular-nums"> · {hm(s.start_time)}–{hm(s.end_time)}</span>}
                          {onIt && <span className="ml-2 rounded-full bg-lime-400 text-navy-950 px-2 py-0.5 text-[10px] font-bold">{t('roster.you')}</span>}
                        </span>
                        {data.can_manage && (
                          <span className="flex gap-1">
                            <button type="button" className="text-gray-400 hover:text-white text-xs px-1" onClick={() => { setErr(''); setEditing(s); }}>✎ {t('common.edit')}</button>
                            <button type="button" className="text-gray-400 hover:text-red-300 text-xs px-1" onClick={() => remove(s)}>✕</button>
                          </span>
                        )}
                      </div>
                      <div className="text-gray-300 text-xs mt-1">
                        👥 {s.people.length ? s.people.map((p) => p.full_name || p.email).join(', ') : <span className="text-amber-200">{t('roster.nobody')}</span>}
                      </div>
                      {s.notes && <div className="text-gray-500 text-xs mt-0.5">📝 {s.notes}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
