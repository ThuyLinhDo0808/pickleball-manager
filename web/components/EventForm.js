'use client';
import QuickLevelsModal from '@/components/QuickLevelsModal';
import HostPaymentSettings from '@/components/HostPaymentSettings';
import Modal from '@/components/Modal';
import { rangeOfKeys } from '@/lib/levelRange';
import LevelInput from '@/components/LevelInput';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DatePopover from '@/components/DatePopover';
import { KIND_ICON, STATUS_STYLE } from '@/components/EventCalendar';
import { useI18n } from '@/context/I18nContext';
import { todayYmd, localDate } from '@/lib/dates';
import { mapsEmbed, mapsHref } from '@/lib/maps';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { halfHours, policyText } from '@/lib/cancelPolicy';
import Hint from '@/components/ui/Hint';
import UiIcon from '@/components/ui/UiIcon';

export const GAME_KINDS = ['game', 'training', 'meeting', 'challenge'];
// open = upcoming; completed is also set automatically once the slot is over.
const STATUSES = ['open', 'completed', 'cancelled'];
const CANCEL_PRESETS = ['', '2', '6', '12', '24', '48'];
const HALF_PRESETS = ['', '1', '2', '3', '4', '6', '12', '24'];
// "Tự do" was the same as Mix (nam nữ), so it is gone; a session with neither is Mix.
export const PLAY_FORMATS = ['men', 'women', 'mixed'];
const playFormatOf = (v) => (v === 'men' || v === 'women' ? v : 'mixed');
// What the fee includes: quick picks that fill the "Dịch vụ" line.
const SERVICE_PICKS = ['balls', 'water', 'fruit', 'towel', 'parking'];
// What a session costs the Host (balls are bought in the ball store instead).
export const COST_CATEGORIES = ['court', 'water', 'other'];
// A category is picked once ("Khác" as often as needed); "HLV" is no longer offered but an
// old session that has it keeps showing it.
const freeCategories = (items, i) => {
  const used = new Set(items.filter((_, j) => j !== i).map((c) => c.category));
  const cur = items[i]?.category;
  return [...COST_CATEGORIES.filter((k) => k === 'other' || !used.has(k)), ...(cur && !COST_CATEGORIES.includes(cur) ? [cur] : [])];
};

export const blankEvent = (date = todayYmd(), kind = 'game') => ({
  kind,
  title: '',
  event_date: date,
  start_time: '00:00',
  end_time: '',
  location: '',
  courts: 1,
  court_labels: '',
  // Several time groups (VD 17h–20h 120k, 18h–20h 100k): each its own hours, fee, places, courts.
  groups_on: false,
  groups: [],
  slots: 16,
  level_min: '',
  level_max: '',
  level_min_f: '',
  level_max_f: '',
  fee_amount: 0,
  registration_deadline: '',
  cancel_deadline_hours: '12',
  cancel_half_hours: '6',
  no_refund: false,
  notice: '',
  status: 'open',
  allow_public_registration: true,
  allow_pay_later: true,
  // Riêng tư — thành viên trước: members sign up first; opens to everyone at public_from.
  members_only: false,
  public_from: '',
  repeat_weeks: 1,
  services: '',
  play_format: 'mixed',
  map_url: '',
  cost_items: [],
  deadline_auto: true,
  deadline_mode: 'auto', // auto-close: 'none' | 'auto' (from the cancel deadline) | 'time'
  level_keys: [],
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

// A titled part of the form (no step numbers: the order is shown by position). `n` is kept
// for old callers. `more`: an optional part, folded away until the Host opens it — the form shows only what
// every kèo needs. Explanations sit behind a small "i" (pop-up), not as text under the fields.
function Section({ n, title, hint, more = false, children }) {
  const head = (
    <h2 className="text-white font-semibold flex items-center gap-2">
      <span className="flex-1">{title}</span>
      {hint && <Hint inline text={hint} />}
      {more && <UiIcon name="chevronDown" className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" />}
    </h2>
  );
  const body = <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">{children}</div>;
  if (!more) return <section className="card mb-4">{head}{body}</section>;
  return (
    <details className="card mb-4 group">
      <summary className="cursor-pointer list-none min-h-[44px] flex items-center [&::-webkit-details-marker]:hidden [&>h2]:flex-1">{head}</summary>
      {body}
    </details>
  );
}

// "Số lượng sân": 2 courts or more -> one card per court (Sân 1, Sân 2…); the Host fills in each
// court's number, players (max), start, end and fee per slot. The player picks a court when
// signing up. Cards already filled keep their values when the count changes.
export const groupsForCount = (n, existing = []) =>
  Array.from({ length: n }, (_, i) => existing[i] || { id: `s${i + 1}${Date.now().toString(36).slice(-4)}`, start_time: '', end_time: '', fee_amount: '', slots: '', courts: String(i + 1), play_format: 'mixed' });

function CourtCards({ f, set }) {
  const { t } = useI18n();
  const groups = f.groups || [];
  const put = (i, patch) => set({ groups: groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  return (
    <div className="col-span-2 md:col-span-4 grid gap-3 md:grid-cols-2">
      {groups.map((g, i) => (
        <section key={g.id} className="rounded-xl border border-navy-600 bg-navy-900/40 p-3" aria-label={t('egroups.courtN', { n: i + 1 })}>
          <p className="text-lime-300 font-semibold text-sm mb-2">{t('egroups.courtN', { n: i + 1 })}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 text-[11px] text-gray-400">{t('egroups.courtNo')}
              <input className="input" maxLength={20} required value={g.courts} onChange={(e) => put(i, { courts: e.target.value })} />
            </label>
            <label className="min-w-0 text-[11px] text-gray-400">{t('egroups.slotsMax')}
              <input className="input" type="number" inputMode="numeric" min="1" max="500" required value={g.slots} onChange={(e) => put(i, { slots: e.target.value })} />
            </label>
            <label className="min-w-0 text-[11px] text-gray-400">{t('create.start')}
              <input className="input" type="time" required value={g.start_time} onChange={(e) => put(i, { start_time: e.target.value })} />
            </label>
            <label className="min-w-0 text-[11px] text-gray-400">{t('create.end')}
              <input className="input" type="time" required value={g.end_time} onChange={(e) => put(i, { end_time: e.target.value })} />
            </label>
            <label className="min-w-0 text-[11px] text-gray-400 col-span-2">{t('egroups.feeSlot')}
              <input className="input" type="number" inputMode="numeric" min="0" step="1000" required value={g.fee_amount} onChange={(e) => put(i, { fee_amount: e.target.value })} />
            </label>
            {/* What this court plays: full men, full women or mixed (shown to players). */}
            <div className="min-w-0 col-span-2 text-[11px] text-gray-400" role="radiogroup" aria-label={t('fmt.label')}>
              {t('fmt.label')}
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {PLAY_FORMATS.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={(g.play_format || 'mixed') === k} onClick={() => put(i, { play_format: k })} className={`rounded-lg border px-2 py-1.5 text-sm ${(g.play_format || 'mixed') === k ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                    {t(`fmt.${k}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}
      <p className="md:col-span-2 text-xs text-gray-400">{t('egroups.totalSlots', { n: groups.reduce((x, g) => x + (Number(g.slots) || 0), 0) })}</p>
    </div>
  );
}

function LevelRange({ label, hint = null, min, max, onMin, onMax }) {
  const { t } = useI18n();
  return (
    <fieldset className="col-span-2 min-w-0 rounded-xl border border-navy-600 px-3 pt-1 pb-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm text-gray-300">{label}{hint && <Hint inline text={hint} />}</legend>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><LevelInput value={min ?? ''} onChange={onMin} placeholder="—" aria-label={`${label} ${t('events.rangeFrom')}`} /></div>
        <span className="shrink-0 text-sm text-gray-400">{t('events.rangeTo')}</span>
        <div className="min-w-0 flex-1"><LevelInput value={max ?? ''} onChange={onMax} placeholder="—" aria-label={`${label} ${t('events.rangeTo')}`} /></div>
      </div>
    </fieldset>
  );
}

function Field({ label, hint, span = 1, children }) {
  const cls = `min-w-0 ${{ 1: 'col-span-1', 2: 'col-span-2', 4: 'col-span-2 md:col-span-4' }[span]}`;
  return (
    <div className={cls}>
      <div className="flex items-center gap-1.5">
        <label className="text-sm text-gray-300">{label}</label>
        {hint && <Hint inline text={hint} />}
      </div>
      {children}
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
  const out = {
    ...blankEvent(ev.event_date, ev.kind || 'game'),
    title: ev.title || '',
    start_time: ev.start_time ? ev.start_time.slice(0, 5) : '',
    end_time: ev.end_time ? ev.end_time.slice(0, 5) : '',
    location: ev.location || '',
    courts: Array.isArray(ev.groups) && ev.groups.length > 1 ? ev.groups.length : ev.courts ?? 1,
    court_labels: ev.court_labels || '',
    groups_on: Array.isArray(ev.groups) && ev.groups.length > 1,
    groups: (ev.groups || []).map((g) => ({ id: g.id, start_time: g.start_time, end_time: g.end_time, fee_amount: String(g.fee_amount ?? 0), slots: String(g.slots ?? ''), courts: g.courts || '', play_format: g.play_format || 'mixed' })),
    slots: ev.slots ?? 16,
    level_min: ev.level_min ?? '',
    level_max: ev.level_max ?? '',
    level_min_f: ev.level_min_f ?? '',
    level_max_f: ev.level_max_f ?? '',
    fee_amount: ev.fee_amount ?? 0,
    registration_deadline: toLocalInput(ev.registration_deadline),
    cancel_deadline_hours: ev.cancel_deadline_hours == null ? '' : String(ev.cancel_deadline_hours),
    cancel_half_hours: ev.cancel_half_hours == null ? '' : String(ev.cancel_half_hours),
    no_refund: !!ev.no_refund,
    notice: ev.notice || '',
    status: ['draft', 'closed'].includes(ev.status) ? 'open' : ev.status,
    allow_public_registration: !!ev.allow_public_registration,
    allow_pay_later: ev.allow_pay_later !== false,
    members_only: !!ev.members_only,
    public_from: ev.public_from ? toLocalInput(ev.public_from) : '',
    services: ev.services || '',
    level_keys: ev.level_keys || [],
    play_format: playFormatOf(ev.play_format),
    map_url: ev.map_url || '',
    cost_items: (ev.cost_items || []).map((c) => ({ category: c.category, amount: String(c.amount), note: c.note || '' })),
    // Auto when the saved deadline is exactly "start minus the cancel deadline".
    deadline_auto:
      !!ev.registration_deadline &&
      toLocalInput(ev.registration_deadline) === autoDeadline(ev.event_date, ev.start_time, ev.cancel_deadline_hours == null ? '' : String(ev.cancel_deadline_hours)),
  };
  out.deadline_mode = out.deadline_auto ? 'auto' : out.registration_deadline ? 'time' : 'none';
  return out;
}

const groupList = (items) =>
  (items || [])
    .filter((g) => g.start_time && g.end_time)
    .map((g) => ({ id: g.id, start_time: g.start_time, end_time: g.end_time, fee_amount: Math.round(Number(g.fee_amount || 0)), slots: Math.round(Number(g.slots || 0)), courts: (g.courts || '').trim() || null, play_format: PLAY_FORMATS.includes(g.play_format) ? g.play_format : 'mixed' }));

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
      cancel_half_hours: null,
    };
  }
  // "Đang nhận / Đã đóng" is allow_public_registration; the auto-close time is separate.
  const mode = f.deadline_mode || (f.deadline_auto ? 'auto' : f.registration_deadline ? 'time' : 'none');
  // Time groups: the kèo starts with the earliest group, ends with the latest, has all their places.
  const groups = f.groups_on ? groupList(f.groups) : null;
  if (groups) {
    f = { ...f, start_time: groups.map((g) => g.start_time).sort()[0] || f.start_time, end_time: groups.map((g) => g.end_time).sort().reverse()[0] || f.end_time, slots: groups.reduce((n, g) => n + g.slots, 0), fee_amount: Math.min(...groups.map((g) => g.fee_amount)),
      // Each court says what it plays; the kèo itself: that one if every court agrees, else mixed.
      play_format: new Set(groups.map((g) => g.play_format)).size === 1 ? groups[0].play_format : 'mixed' };
  }
  const deadline = mode === 'auto' ? autoDeadline(f.event_date, f.start_time, f.cancel_deadline_hours) : mode === 'time' ? f.registration_deadline : '';
  return {
    groups: groups && groups.length > 1 ? groups : [],
    // Court numbers come from the court cards (server-side); one court: none.
    court_labels: null,
    kind: f.kind,
    title: f.title.trim(),
    event_date: f.event_date,
    start_time: f.start_time || null,
    end_time: f.end_time || null,
    location: f.location.trim() || null,
    courts: Math.max(1, Math.min(12, parseInt(f.courts, 10) || 1)),
    slots: Number(f.slots),
    level_min: f.level_min === '' ? null : Number(f.level_min),
    level_max: f.level_max === '' ? null : Number(f.level_max),
    // A women's range only for a mixed kèo (Full nữ uses the one range above).
    level_min_f: playFormatOf(f.play_format) !== 'mixed' || f.level_min_f === '' || f.level_min_f == null ? null : Number(f.level_min_f),
    level_max_f: playFormatOf(f.play_format) !== 'mixed' || f.level_max_f === '' || f.level_max_f == null ? null : Number(f.level_max_f),
    fee_amount: Number(f.fee_amount || 0),
    registration_deadline: deadline ? new Date(deadline).toISOString() : null,
    cancel_deadline_hours: f.no_refund || f.cancel_deadline_hours === '' ? null : Number(f.cancel_deadline_hours),
    cancel_half_hours: f.no_refund ? null : halfHours(f.cancel_deadline_hours, f.cancel_half_hours),
    no_refund: !!f.no_refund,
    notice: f.notice.trim() || null,
    status: f.status,
    allow_public_registration: f.allow_public_registration,
    allow_pay_later: f.allow_pay_later,
    members_only: !!f.members_only,
    public_from: f.members_only && f.public_from ? new Date(f.public_from).toISOString() : null,
    services: f.services.trim() || null,
    play_format: f.kind === 'meeting' ? null : playFormatOf(f.play_format),
    map_url: f.map_url.trim() || null,
    cost_items: costList(f.cost_items),
    ...(Array.isArray(f.level_keys) ? { level_keys: f.level_keys } : {}),
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
      <Field label={t('map.linkLabel')} span={2}>
        <input className="input" inputMode="url" placeholder="https://maps.app.goo.gl/…" value={f.map_url} onChange={(e) => set({ map_url: e.target.value })} />
      </Field>
      {(embed || href) && (
        <div className="col-span-2 md:col-span-4">
          {embed && (
            <iframe title={t('map.preview')} src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="w-full h-48 rounded-lg border border-navy-700 bg-navy-900" />
          )}
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block mt-1 text-xs text-lime-400 hover:underline">{t('map.check')} →</a>
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
      <p className="text-orange-100 text-sm font-semibold">{t('cost.title')} <Hint inline text={t('cost.hint')} /></p>
      {items.length > 0 && (
        <div className="hidden sm:flex gap-2 mt-2 text-[11px] text-gray-400">
          <span className="w-36 shrink-0">{t('cost.colWhat')}</span>
          <span className="w-36 shrink-0 text-right">{t('cost.colAmount')}</span>
          <span>{t('cost.colNote')}</span>
        </div>
      )}
      <div className="flex flex-col gap-2 mt-1">
        {items.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select className="input !w-36 shrink-0" value={c.category} onChange={(e) => setAt(i, { category: e.target.value })} aria-label={t('fin.category')}>
              {freeCategories(items, i).map((k) => <option key={k} value={k}>{t(`cost.cat_${k}`)}</option>)}
            </select>
            <label className="relative shrink-0">
              <input className="input no-spin !w-36 text-right tabular-nums !pr-7" type="number" inputMode="numeric" min="0" step="1000" placeholder={t('cost.amountPh', { what: t(`cost.cat_${c.category}`).toLowerCase() })} value={c.amount} onChange={(e) => setAt(i, { amount: e.target.value })} aria-label={`${t('cost.colAmount')} — ${t(`cost.cat_${c.category}`)}`} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">đ</span>
            </label>
            <input className="input !w-auto flex-1 min-w-[10rem]" placeholder={c.category === 'other' ? t('cost.otherPh') : t('cost.notePh')} required={c.category === 'other' && Number(c.amount) > 0} value={c.note} onChange={(e) => setAt(i, { note: e.target.value })} aria-label={t('fin.note')} />
            <button type="button" className="text-red-400 px-2 text-lg leading-none" aria-label={t('common.delete')} onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <button type="button" className="btn-secondary !py-1 text-xs" disabled={items.length >= 10} onClick={() => onChange([...items, { category: freeCategories([...items, { category: null }], items.length)[0] || 'other', amount: '', note: '' }])}>＋ {t('cost.add')}</button>
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
// `community` + `clubId`: a Social Manager community — the kèo can be for some of the
// levels (trình độ) set in the community's control panel.
export default function EventForm({ initial, onSubmit, submitLabel, cancelHref = '/events', showRepeat = false, disabled = false, warning = null, kinds = null, dateField = null, lockTitle = false, showStatus = false, sessions = null, seriesCount = 0, deadlineDate = null, community = false, clubId = null, prefillFromClub = true }) {
  const { t, lang } = useI18n();
  const [f, setF] = useState(() => ({ apply_to: seriesCount > 0 ? 'series' : 'one', ...initial }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false); // "✓ Đã lưu" after a successful save
  const set = (patch) => {
    setSaved(false);
    setF((prev) => ({ ...prev, ...patch }));
  };

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!f.event_date) return setError(t('create.needDate'));
    if (f.start_time && f.end_time && f.end_time <= f.start_time) return setError(t('create.endAfterStart'));
    if (f.level_min !== '' && f.level_max !== '' && Number(f.level_max) < Number(f.level_min)) return setError(t('create.duprRange'));
    if (f.level_min_f !== '' && f.level_max_f !== '' && f.level_min_f != null && f.level_max_f != null && Number(f.level_max_f) < Number(f.level_min_f)) return setError(t('create.duprRange'));
    if (f.map_url.trim() && !/^https:\/\/\S+$/i.test(f.map_url.trim())) return setError(t('map.badLink'));
    if (f.cost_items.some((c) => c.category === 'other' && Number(c.amount) > 0 && !c.note.trim())) return setError(t('cost.otherNeedNote'));
    setBusy(true);
    setSaved(false);
    try {
      // A new kèo always takes sign-ups and closes by itself at the cancel deadline
      // (changed later on the kèo page / edit form).
      await onSubmit(showStatus ? f : { ...f, allow_public_registration: true, deadline_mode: 'auto', deadline_auto: true });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const meeting = f.kind === 'meeting';
  const { data: cs, reload: reloadCs } = useLoad(() => (community && clubId ? api.get(`/api/clubs/${clubId}/community-settings`).catch(() => null) : Promise.resolve(null)), [community, clubId]);
  const levelItems = cs?.ready && cs.settings?.levels?.mode !== 'none' ? cs.settings.levels.items : [];
  // A new kèo starts with the community's refund rule (control panel); still editable here.
  const refundRule = prefillFromClub && cs?.ready ? cs.settings?.refund : null;
  useEffect(() => {
    if (!refundRule) return;
    setF((x) => ({
      ...x,
      no_refund: refundRule.mode === 'none',
      cancel_deadline_hours: refundRule.mode === 'tiers' ? String(refundRule.full) : '',
      cancel_half_hours: refundRule.mode === 'tiers' && refundRule.half != null ? String(refundRule.half) : '',
    }));
  }, [refundRule?.mode, refundRule?.full, refundRule?.half]); // eslint-disable-line react-hooks/exhaustive-deps
  // Picking levels fills the DUPR limits from their ranges (control panel); still editable.
  const pickLevel = (key) => {
    const keys = (f.level_keys || []).includes(key) ? f.level_keys.filter((k) => k !== key) : [...(f.level_keys || []), key];
    const r = keys.length ? rangeOfKeys(cs.settings.levels, keys) : null;
    const wasAuto = !(f.level_keys || []).length || !!rangeOfKeys(cs.settings.levels, f.level_keys || []);
    const patch = { level_keys: keys };
    if (r) Object.assign(patch, { level_min: r.min ?? '', level_max: r.max ?? '' });
    else if (!keys.length && wasAuto) Object.assign(patch, { level_min: '', level_max: '' });
    // Levels split by gender: the women's range too.
    if (cs.settings.levels.by_gender) {
      const rf = keys.length ? rangeOfKeys(cs.settings.levels, keys, true) : null;
      if (rf) Object.assign(patch, { level_min_f: rf.min ?? '', level_max_f: rf.max ?? '' });
      else if (!keys.length && wasAuto) Object.assign(patch, { level_min_f: '', level_max_f: '' });
    }
    set(patch);
  };
  // Women's own DUPR range: on when the community splits levels by gender, when the kèo
  // already has one, or when the Host asks for it.
  const levelRangeAuto = !!(f.level_keys || []).length && !!levelItems.length && !!rangeOfKeys(cs.settings.levels, f.level_keys);
  const autoAt = autoDeadline(deadlineDate || f.event_date, f.start_time, f.cancel_deadline_hours);
  const fmtLocal = (v) => (v ? localDate(new Date(v), lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }, true) : '—');
  const perSessionCost = costTotal(f.cost_items);
  const maxIncome = Number(f.fee_amount) * Number(f.slots || 0);
  // Where players pay: the club's account, else the host's. Neither set -> players
  // cannot pay a fee, so say so before the kèo is opened.
  const { data: payTo, reload: reloadPayTo } = useLoad(
    () => Promise.all([
      clubId ? api.get(`/api/clubs/${clubId}`).catch(() => null) : null,
      api.get('/api/host/payment-settings').catch(() => null),
    ]).then(([c, h]) => ({ ok: !!(c?.bank_account || h?.bank_account) })),
    [clubId]
  );
  const feeNow = f.groups_on ? Math.max(0, ...(f.groups || []).map((g) => Number(g.fee_amount) || 0)) : Number(f.fee_amount);
  const noPayout = feeNow > 0 && payTo && !payTo.ok;
  // Missing payout account: filled in a pop-up, then back to this form (nothing lost).
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);
  // A new kèo starts at the club's courts: address and Google Maps link from Hồ sơ CLB.
  useEffect(() => {
    if (!clubId || !prefillFromClub) return;
    let alive = true;
    api.get(`/api/clubs/${clubId}`).then((c) => {
      if (!alive || !c) return;
      setF((x) => (x.location || x.map_url ? x : { ...x, location: c.address || '', map_url: c.map_url || '' }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [clubId, prefillFromClub]);
  const toggleService = (key) => {
    const word = t(`svc.${key}`);
    const parts = f.services.split(',').map((x) => x.trim()).filter(Boolean);
    const has = parts.some((x) => x.toLowerCase() === word.toLowerCase());
    set({ services: (has ? parts.filter((x) => x.toLowerCase() !== word.toLowerCase()) : [...parts, word]).join(', ') });
  };
  return (
    <>
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
                    <UiIcon name={KIND_ICON[k]} className="inline-block w-4 h-4 mr-1 -mt-0.5" />
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
              placeholder={meeting ? t('meeting.contentPh') : undefined}
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
          {!f.groups_on && (
            <>
              <Field label={t('create.start')}>
                <input className="input" type="time" value={f.start_time} onChange={(e) => set({ start_time: e.target.value })} />
              </Field>
              <Field label={t('create.end')}>
                <input className="input" type="time" value={f.end_time} onChange={(e) => set({ end_time: e.target.value })} />
              </Field>
            </>
          )}
          <LocationField f={f} set={set} meeting={meeting} />
          {community && !meeting && cs?.ready && (
            <Field label={t('cpanel.forLevels')} span={2} hint={levelItems.length ? t('cpanel.forLevelsHint') : null}>
              {levelItems.length ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('cpanel.forLevels')}>
                  {levelItems.map((it) => {
                    const on = (f.level_keys || []).includes(it.key);
                    return (
                      <button key={it.key} type="button" aria-pressed={on} onClick={() => pickLevel(it.key)} className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-lime-400 bg-lime-400/15 text-lime-200' : 'border-navy-600 text-gray-300'}`}>
                        {it.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400">{t('quickfix.noLevels')} <button type="button" className="text-lime-400 underline" onClick={() => setLevelsOpen(true)}>{t('quickfix.levelsAdd')}</button></p>
              )}
            </Field>
          )}
          {meeting && (
            <>
              <Field label={t('meeting.fee')} span={2}>
                <input className="input" type="number" inputMode="numeric" min="0" step="1" value={f.fee_amount} onChange={(e) => set({ fee_amount: e.target.value })} />
              </Field>
              <Field label={t('meeting.details')} span={4}>
                <textarea className="input" rows={3} placeholder={t('meeting.detailsPh')} value={f.notice} onChange={(e) => set({ notice: e.target.value })} />
              </Field>
              <p className="col-span-2 md:col-span-4 rounded-lg border border-sky-400/40 bg-sky-400/5 px-3 py-2 text-sm text-sky-100">{t('meeting.voteNote')}</p>
            </>
          )}
          {!meeting && (
            <Field label={t('egroups.courtCount')} hint={t('egroups.courtCountHint')}>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min="1"
                max="12"
                aria-label={t('egroups.courtCount')}
                value={f.courts}
                onChange={(e) => {
                  const n = Math.min(Math.max(parseInt(e.target.value, 10) || 0, 0), 12);
                  set(n >= 2 ? { courts: e.target.value, groups_on: true, groups: groupsForCount(n, f.groups) } : { courts: e.target.value, groups_on: false });
                }}
              />
            </Field>
          )}
          {!meeting && !f.groups_on && (
          <>
          <Field label={t('events.slots')}>
            <input className="input" type="number" inputMode="numeric" min="1" max="500" value={f.slots} onChange={(e) => set({ slots: e.target.value })} />
          </Field>
          <Field label={t('create.fee')}>
            <input className="input" type="number" inputMode="numeric" min="0" step="1" value={f.fee_amount} onChange={(e) => set({ fee_amount: e.target.value })} />
          </Field>
          </>
          )}
          {!meeting && f.groups_on && <CourtCards f={f} set={set} />}
          {!meeting && noPayout && (
            <p className="col-span-2 md:col-span-4 -mt-1 text-[11px] text-amber-300">
              {t('create.noPayout')} <button type="button" className="underline text-lime-300" onClick={() => setPayoutOpen(true)}>{t('quickfix.add')}</button>
            </p>
          )}
          {showRepeat && (
            <Field label={t('events.repeatWeeks')} hint={t('events.repeatHint')}>
              <input className="input" type="number" inputMode="numeric" min="1" max="26" value={f.repeat_weeks} onChange={(e) => set({ repeat_weeks: e.target.value })} />
            </Field>
          )}
        </Section>

        {!meeting && (
        <>
        <Section n={2} title={t('create.rules')} more>
          {!f.groups_on && (
          <Field label={t('fmt.label')} span={2} hint={t('fmt.hint')}>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {PLAY_FORMATS.map((k) => (
                <button key={k} type="button" aria-pressed={playFormatOf(f.play_format) === k} onClick={() => set({ play_format: k })} className={`rounded-lg border px-2 py-2 text-sm ${playFormatOf(f.play_format) === k ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                  {t(`fmt.${k}`)}
                </button>
              ))}
            </div>
          </Field>
          )}
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
          {/* The DUPR condition follows the play format: Full nam -> DUPR Nam only, Full nữ ->
              DUPR Nữ only, Mix -> both. Each is one box: [từ] đến [đến]. */}
          <LevelRange label={playFormatOf(f.play_format) === 'women' ? t('events.levelWomen') : t('events.levelMen')} hint={levelRangeAuto ? t('cpanel.rangeAutoHint') : null} min={f.level_min} max={f.level_max} onMin={(v) => set({ level_min: v })} onMax={(v) => set({ level_max: v })} />
          {playFormatOf(f.play_format) === 'mixed' && (
            <LevelRange label={t('events.levelWomen')} min={f.level_min_f} max={f.level_max_f} onMin={(v) => set({ level_min_f: v })} onMax={(v) => set({ level_max_f: v })} />
          )}
          <Field span={2} label={t('policy.refundLabel')} hint={f.no_refund ? t('policy.noRefundHint') : f.cancel_deadline_hours === '' ? t('policy.noneHint') : null}>
            <select
              className="input"
              value={f.no_refund ? 'no' : f.cancel_deadline_hours}
              onChange={(e) => (e.target.value === 'no' ? set({ no_refund: true, cancel_deadline_hours: '' }) : set({ no_refund: false, cancel_deadline_hours: e.target.value }))}
            >
              <option value="no">{t('policy.noRefund')}</option>
              {[...CANCEL_PRESETS, ...(CANCEL_PRESETS.includes(f.cancel_deadline_hours) ? [] : [f.cancel_deadline_hours])].map((h) => <option key={h} value={h}>{h === '' ? t('policy.none') : t('policy.fullBefore', { h })}</option>)}
            </select>
          </Field>
          {f.cancel_deadline_hours !== '' && (
            <Field span={2} label={t('policy.halfLabel')}>
              <select className="input" value={halfHours(f.cancel_deadline_hours, f.cancel_half_hours) ?? ''} onChange={(e) => set({ cancel_half_hours: e.target.value })}>
                {HALF_PRESETS.filter((h) => h === '' || Number(h) < Number(f.cancel_deadline_hours)).map((h) => <option key={h} value={h}>{h === '' ? t('policy.noHalf') : t('policy.hoursShort', { h })}</option>)}
              </select>
            </Field>
          )}
          {!f.no_refund && f.cancel_deadline_hours !== '' && <p className="col-span-2 md:col-span-4 -mt-2 text-xs text-gray-400">{policyText(t, f.cancel_deadline_hours, f.cancel_half_hours)}. {t('policy.memberNote')}</p>}
          {/* Sign-ups: one state (taking sign-ups / closed) and, apart from it, an optional
              time at which they close by themselves. */}
          {/* Create: always taking sign-ups, closing at the cancel deadline (one line). Edit: both choices. */}
          {showStatus && (
            <>
          <Field label={t('reg.label')} span={4} hint={t('reg.hint')}>
            <div className="grid grid-cols-2 gap-1.5 mt-1 max-w-md" role="radiogroup" aria-label={t('reg.label')}>
              {[[true, `${t('reg.open')}`], [false, `${t('reg.closed')}`]].map(([v, label]) => (
                <button key={String(v)} type="button" role="radio" aria-checked={f.allow_public_registration === v} onClick={() => set({ allow_public_registration: v })} className={`rounded-lg border px-3 py-2 text-sm ${f.allow_public_registration === v ? 'border-lime-400 bg-lime-400/10 text-white font-semibold' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('reg.autoClose')} span={4}>
            <div className="grid grid-cols-3 gap-1.5 mt-1 max-w-md" role="radiogroup" aria-label={t('reg.autoClose')}>
              {['none', 'auto', 'time'].map((m) => {
                const on = (f.deadline_mode || (f.deadline_auto ? 'auto' : 'none')) === m;
                return (
                  <button key={m} type="button" role="radio" aria-checked={on} onClick={() => set({ deadline_mode: m, deadline_auto: m === 'auto', registration_deadline: m === 'time' ? f.registration_deadline || autoAt : f.registration_deadline })} className={`rounded-lg border px-2 py-2 text-sm ${on ? 'border-lime-400 bg-lime-400/10 text-white font-semibold' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                    {t(`reg.mode_${m}`)}
                  </button>
                );
              })}
            </div>
            {(f.deadline_mode || (f.deadline_auto ? 'auto' : 'none')) === 'auto' && (
              <p className="mt-1.5 rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-gray-100">
                {autoAt ? (sessions > 1 ? t('dl.autoEach', { h: f.cancel_deadline_hours || 0, time: autoAt.slice(11, 16) }) : t('dl.autoAt', { at: fmtLocal(autoAt), h: f.cancel_deadline_hours || 0 })) : t('dl.needStart')}
              </p>
            )}
            {f.deadline_mode === 'time' && (
              <input className="input mt-1.5 max-w-md" type="datetime-local" value={f.registration_deadline} onChange={(e) => set({ registration_deadline: e.target.value })} aria-label={t('reg.autoClose')} />
            )}
          </Field>
            </>
          )}
          {!showStatus && (
            <p className="col-span-2 md:col-span-4 rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-gray-100">
              {t('reg.open')} · {autoAt ? (sessions > 1 ? t('dl.autoEach', { h: f.cancel_deadline_hours || 0, time: autoAt.slice(11, 16) }) : t('dl.autoAt', { at: fmtLocal(autoAt), h: f.cancel_deadline_hours || 0 })) : t('dl.needStart')}
            </p>
          )}
          {/* Who can sign up: everyone, or the club's members first (opens to everyone later). */}
          <Field label={t('mfirst.label')} span={4} hint={t('mfirst.hint')}>
            <div className="grid grid-cols-2 gap-1.5 mt-1" role="radiogroup" aria-label={t('mfirst.label')}>
              {[false, true].map((v) => (
                <button key={String(v)} type="button" role="radio" aria-checked={!!f.members_only === v} onClick={() => set({ members_only: v })} className={`rounded-lg border px-2 py-2 text-sm ${!!f.members_only === v ? 'border-lime-400 bg-lime-400/10 text-white font-semibold' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}>
                  {v ? `${t('mfirst.private')}` : `${t('mfirst.public')}`}
                </button>
              ))}
            </div>
            {f.members_only && (
              <label className="block mt-2 text-xs text-gray-400">
                {t('mfirst.openAt')}
                <input type="datetime-local" className="input mt-1" value={f.public_from || ''} onChange={(e) => set({ public_from: e.target.value })} />
                <span className="block mt-1 text-gray-500">{sessions > 1 ? t('mfirst.openAtEach') : t('mfirst.openAtHint')}</span>
              </label>
            )}
          </Field>
          <CostItems items={f.cost_items} onChange={(cost_items) => set({ cost_items })} sessions={sessions || 1} />
        </Section>

        <Section n={3} title={t('create.notes')} more>
          <Field label={t('events.notice')} span={4}>
            <textarea className="input" rows={3} placeholder={t('events.noticeHint')} value={f.notice} onChange={(e) => set({ notice: e.target.value })} />
          </Field>
          {Number(f.fee_amount) > 0 && (
            <label className="col-span-2 md:col-span-4 flex items-start gap-2 text-sm text-gray-200">
              <input type="checkbox" className="mt-1" checked={f.allow_pay_later} onChange={(e) => set({ allow_pay_later: e.target.checked })} />
              <span>{t('payLater.allow')} <Hint inline text={t('payLater.allowHint')} /></span>
            </label>
          )}
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
            <h2 className="text-white font-semibold">{t('series.title')} <Hint inline text={t('series.hint')} /></h2>
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
        {warning && <p className="card !py-3 mb-3 border-yellow-400/50 text-yellow-200 text-sm">{warning}</p>}
        {error && <p className="text-red-400 text-sm mb-3 lg:hidden">{error}</p>}
        {saved && <p className="text-lime-300 text-sm mb-3 lg:hidden" role="status">✓ {t('common.savedLong')}</p>}
        {/* Phone: cancel on the left, the main action on the right, pinned above the tab bar. */}
        <div className="flex gap-3 lg:hidden sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 px-4 py-3 bg-navy-950 border-t border-navy-700">
          <Link href={cancelHref} className="btn-secondary">{t('common.cancel')}</Link>
          <button className="btn-primary flex-1" disabled={busy || disabled}>{busy ? '…' : saved ? `✓ ${t('common.saved')}` : submitLabel}</button>
        </div>
        </div>

        <aside className="hidden lg:block sticky top-4">
          <div className="card !p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-navy-700 bg-navy-900/50">
              <p className="text-gray-400 text-xs">{t('createx.preview')}</p>
              <p className="text-white font-semibold break-words mt-0.5">
                {KIND_ICON[f.kind] && <UiIcon name={KIND_ICON[f.kind]} className="inline-block w-4 h-4 mr-1 -mt-0.5" />}
                {f.title || <span className="text-gray-500">{t('createx.untitled')}</span>}
              </p>
            </div>
            <dl className="px-4 py-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-gray-400"><UiIcon name="calendar" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></dt>
              <dd className="text-gray-100">
                {sessions != null
                  ? t('createx.sessionsN', { n: sessions })
                  : f.event_date
                    ? localDate(new Date(`${f.event_date}T00:00:00`), lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })
                    : '—'}
              </dd>
              <dt className="text-gray-400"><UiIcon name="clock" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></dt>
              <dd className="text-gray-100 tabular-nums">
                {f.groups_on && !meeting
                  ? (f.groups || []).map((g) => (
                      <span key={g.id} className="block">{g.start_time || '—'}–{g.end_time || '—'} · {g.fee_amount === '' ? '—' : Number(g.fee_amount) > 0 ? `${Number(g.fee_amount).toLocaleString('vi-VN')}đ` : t('createx.free')} · {g.slots === '' ? '—' : t('createx.slotsN', { n: g.slots })}{g.courts ? ` · ${t('egroups.courtsShort', { list: g.courts })}` : ''} · {t(`fmt.${g.play_format || 'mixed'}`)}</span>
                    ))
                  : `${f.start_time || '—'}${f.end_time ? ` – ${f.end_time}` : ''}`}
              </dd>
              <dt className="text-gray-400"><UiIcon name="pin" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></dt>
              <dd className="text-gray-100 break-words">{f.location || '—'}{!meeting && !f.groups_on && Number(f.courts) > 0 ? ` · ${t('createx.courtsN', { n: f.courts })}` : ''}</dd>
              {!meeting && !f.groups_on && <dt className="text-gray-400"><UiIcon name="users" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></dt>}
              {!meeting && !f.groups_on && <dd className="text-gray-100">{t('createx.slotsN', { n: f.slots || 0 })}</dd>}
              <dt className="text-gray-400"><UiIcon name="money" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></dt>
              <dd className="text-gray-100 tabular-nums">
                {f.groups_on && !meeting ? t('egroups.perGroup') : Number(f.fee_amount) > 0 ? `${Number(f.fee_amount).toLocaleString('vi-VN')}đ / ${t('createx.perPerson')}` : t('createx.free')}
                {f.services.trim() && <span className="block text-gray-400 text-xs">{f.services}</span>}
              </dd>
              {!meeting && (
                <>
                  <dt className="text-gray-400"><UiIcon name="paddle" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></dt>
                  <dd className="text-gray-100">{t(`fmt.${playFormatOf(f.play_format)}`)}</dd>
                </>
              )}
              {meeting ? (
                <>
                  <dt className="text-gray-400"><UiIcon name="list" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></dt>
                  <dd className="text-sky-200">{t('meeting.votePreview')}</dd>
                </>
              ) : (
                <>
                  <dt className="text-gray-400"><UiIcon name="hourglass" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></dt>
                  <dd className="text-gray-100">{f.no_refund ? t('policy.noRefund') : f.cancel_deadline_hours === '' ? t('policy.none') : policyText(t, f.cancel_deadline_hours, f.cancel_half_hours)}</dd>
                  <dt className="text-gray-400"><UiIcon name="edit" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></dt>
                  <dd className="text-gray-100">{f.deadline_mode === 'none' || (!f.deadline_mode && !f.deadline_auto && !f.registration_deadline) ? t('reg.mode_none') : f.deadline_auto ? (autoAt ? (sessions > 1 ? t('dl.previewEach', { time: autoAt.slice(11, 16) }) : fmtLocal(autoAt)) : '—') : fmtLocal(f.registration_deadline)}</dd>
                  <dt className="text-gray-400"><UiIcon name="link" className="inline-block w-[1em] h-[1em] align-[-0.125em]" /></dt>
                  <dd className={f.allow_public_registration ? 'text-lime-300' : 'text-gray-400'}>{f.allow_public_registration ? t('reg.open') : t('reg.closed')}</dd>
                  <dt className="text-gray-400"></dt>
                  <dd className={f.members_only ? 'text-gray-200' : 'text-gray-100'}>{f.members_only ? (f.public_from ? t('mfirst.previewUntil', { at: fmtLocal(f.public_from) }) : t('mfirst.private')) : t('mfirst.public')}</dd>
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
              {saved && <p className="text-lime-300 text-sm" role="status">✓ {t('common.savedLong')}</p>}
              <div className="flex gap-2">
                <Link href={cancelHref} className="btn-secondary">{t('common.cancel')}</Link>
                <button className="btn-primary flex-1" disabled={busy || disabled}>{busy ? '…' : saved ? `✓ ${t('common.saved')}` : submitLabel}</button>
              </div>
            </div>
          </div>
        </aside>
    </form>
      {/* Outside the event form: the pop-up's own form must not submit this one. */}
      <Modal open={payoutOpen} title={`${t('paySet.title')}`} onClose={() => setPayoutOpen(false)}>
        <p className="text-gray-400 text-sm mb-3">{t('quickfix.payoutHint')}</p>
        <HostPaymentSettings bare onSaved={() => { reloadPayTo(); setPayoutOpen(false); }} />
      </Modal>
      <QuickLevelsModal open={levelsOpen} clubId={clubId} settings={cs?.settings} sport={cs?.sport || 'pickleball'} onClose={() => setLevelsOpen(false)} onSaved={() => reloadCs()} />
    </>
  );
}
