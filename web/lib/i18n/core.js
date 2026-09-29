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

// Three-level fallback: current lang -> vi -> en -> raw key
export function translate(lang, key, params) {
  const chain = [lang, DEFAULT_LANG, FALLBACK_LANG];
  for (const l of chain) {
    const dict = DICTS[l];
    if (!dict) continue;
    const val = getPath(dict, key);
    if (typeof val === 'string') return interpolate(val, params);
  }
  return key;
}

export const SUPPORTED_LANGS = Object.keys(DICTS);
export { DEFAULT_LANG };
