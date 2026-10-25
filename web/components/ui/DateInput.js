'use client';
import { useEffect, useState } from 'react';

// A date typed as ngày/tháng/năm (dd/mm/yyyy), whatever the browser's language — the
// built-in date box follows the browser and often shows tháng/ngày/năm. `value` and
// onChange use yyyy-mm-dd ('' while the date is not complete or not valid).
const toText = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function toIso(text, min, max) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return '';
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return '';
  if ((min && iso < min) || (max && iso > max)) return '';
  return iso;
}

// 1 → "1", 0108 → "01/08", 01081990 → "01/08/1990"
function mask(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
}

export default function DateInput({ value, onChange, min, max, required, className = 'input', id, ...rest }) {
  const [text, setText] = useState(toText(value));
  // Follow a value set from outside (prefill), but not while the typed text means the same.
  useEffect(() => {
    if (toIso(text, min, max) !== (value || '')) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bad = text.length === 10 && !toIso(text, min, max);
  return (
    <input
      id={id}
      className={`${className} tabular-nums ${bad ? '!border-red-400' : ''}`}
      inputMode="numeric"
      autoComplete="bday"
      placeholder="dd/mm/yyyy"
      maxLength={10}
      required={required}
      pattern="\d{2}/\d{2}/\d{4}"
      aria-invalid={bad || undefined}
      {...rest}
      value={text}
      onChange={(e) => {
        const next = mask(e.target.value);
        setText(next);
        onChange?.(toIso(next, min, max));
      }}
    />
  );
}
