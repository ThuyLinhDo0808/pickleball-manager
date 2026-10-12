'use client';
import { useI18n } from '@/context/I18nContext';

// Birth year (required) + optional day / month. A host adding someone quickly
// often only knows the year; the full date can be filled in later (birthdays).
// Value: { year: '2002', month: '' | '1'..'12', day: '' | '1'..'31' }.

export const birthFromMember = (m) => {
  const d = m?.birth_date || '';
  return d
    ? { year: d.slice(0, 4), month: String(Number(d.slice(5, 7))), day: String(Number(d.slice(8, 10))) }
    : { year: m?.birth_year ? String(m.birth_year) : '', month: '', day: '' };
};

const daysIn = (year, month) => new Date(Number(year) || 2000, Number(month), 0).getDate();
const pad = (n) => String(n).padStart(2, '0');

// { birth_year, birth_date } for the API: birth_date only when day + month are set.
export function birthPayload(b) {
  const year = Number(b.year) || null;
  const full = year && b.month && b.day && Number(b.day) <= daysIn(year, b.month);
  return { birth_year: year, birth_date: full ? `${year}-${pad(b.month)}-${pad(b.day)}` : null };
}

export default function BirthInput({ value, onChange, required = true, id = 'birth-year' }) {
  const { t } = useI18n();
  const thisYear = new Date().getFullYear();
  const set = (patch) => {
    const next = { ...value, ...patch };
    // Keep the day valid for the month (31 → 30 / 28 ...).
    if (next.day && next.month && Number(next.day) > daysIn(next.year, next.month)) next.day = '';
    onChange(next);
  };
  const days = daysIn(value.year, value.month || 1);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-xs text-gray-400">
        {t('members.birthYear')}
        {required && <span className="text-lime-400"> *</span>}
      </label>
      <input
        id={id}
        className="input"
        type="number"
        inputMode="numeric"
        min="1900"
        max={thisYear}
        placeholder={String(thisYear - 30)}
        required={required}
        value={value.year}
        onChange={(e) => set({ year: e.target.value.slice(0, 4) })}
      />
      <div className="flex gap-1.5 mt-1.5" aria-label={t('members.birthDayMonth')}>
        <select className="input !py-1.5 text-sm" value={value.day} onChange={(e) => set({ day: e.target.value })} aria-label={t('members.birthDay')}>
          <option value="">{t('members.birthDay')}</option>
          {Array.from({ length: days }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
        </select>
        <select className="input !py-1.5 text-sm" value={value.month} onChange={(e) => set({ month: e.target.value })} aria-label={t('members.birthMonth')}>
          <option value="">{t('members.birthMonth')}</option>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{t('members.monthN', { n: i + 1 })}</option>)}
        </select>
      </div>
      <p className="text-[11px] text-gray-500 mt-1">{t('members.birthDayMonthHint')}</p>
    </div>
  );
}
