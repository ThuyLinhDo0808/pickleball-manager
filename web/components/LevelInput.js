'use client';
import { useI18n } from '@/context/I18nContext';
import { BADMINTON_LEVELS } from '@/lib/levels';

// Level field: a DUPR number (pickleball) or a named step (badminton: Yếu … Giỏi).
// `sport` defaults to the current club's sport.
export default function LevelInput({ value, onChange, sport: sportProp, id, placeholder, className = 'input', required = false }) {
  const { t, sport: clubSport } = useI18n();
  const sport = sportProp || clubSport;
  if (sport === 'badminton') {
    return (
      <select id={id} className={className} required={required} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder || '—'}</option>
        {BADMINTON_LEVELS.map((n) => (
          <option key={n} value={n}>{t(`level.b${n}`)}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      id={id}
      className={className}
      type="number"
      step="0.01"
      min="1"
      max="8"
      inputMode="decimal"
      required={required}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
