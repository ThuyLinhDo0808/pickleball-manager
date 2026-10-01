import { vi } from './vi';
import { en } from './en';

const DICTS = { vi, en };
const DEFAULT_LANG = 'vi';
const FALLBACK_LANG = 'en';

function getPath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj);
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, key) => (key in params ? String(params[key]) : m));
}

// Three-level fallback: current lang -> vi -> en -> raw key.
// `sport`: a club of another sport than pickleball first looks in the dictionary's
// per-sport overrides (e.g. vi.sport.badminton['nav.inventory'] = 'Kho cầu').
export function translate(lang, key, params, sport) {
  const chain = [lang, DEFAULT_LANG, FALLBACK_LANG];
  for (const l of chain) {
    const dict = DICTS[l];
    if (!dict) continue;
    const override = sport && sport !== 'pickleball' ? dict.sport?.[sport]?.[key] : undefined;
    const val = typeof override === 'string' ? override : getPath(dict, key);
    if (typeof val === 'string') return interpolate(val, params);
  }
  return key;
}

export const SUPPORTED_LANGS = Object.keys(DICTS);
export { DEFAULT_LANG };
