// Pure translation core (no React / no storage) so it is easy to test.
import vi from './vi.js';
import en from './en.js';

export const DICTS = { vi, en };
export const LANGS = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
];
export const DEFAULT_LANG = 'vi'; // Vietnamese is the primary language

let current = DEFAULT_LANG;
const listeners = new Set();

export const getLanguage = () => current;

export function setLanguageInMemory(code) {
  if (!DICTS[code] || code === current) return;
  current = code;
  listeners.forEach((fn) => fn(code));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Lookup order: current language -> Vietnamese -> English -> the key itself.
function find(key) {
  for (const lang of [current, 'vi', 'en']) {
    const v = DICTS[lang]?.[key];
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * t('event.slots', { n: 12 })            -> "12 chỗ"
 * t('members.count', { count: 1 })       -> uses key_one / key_other when present
 * Placeholders look like {name}.
 */
export function t(key, params = {}) {
  let str;
  if (typeof params.count === 'number') {
    str = (params.count === 1 && find(`${key}_one`)) || find(`${key}_other`) || find(key);
  } else {
    str = find(key);
  }
  if (str === undefined) return key;
  return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}
