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

// Managing a community (Social Manager) with the club pages: "CLB" reads "cộng đồng".
// These parts talk about clubs and communities side by side (or about the app, plans,
// the owner console, the player side), so they keep their words.
const KEEP_NS = new Set(['creq', 'owner', 'ownerReq', 'plan', 'disc', 'hub', 'onb', 'handover', 'deleteAccount', 'auth', 'welcome', 'leaderboard', 'workspace', 'player', 'signup', 'survey', 'vote', 'join', 'notice', 'social', 'finX', 'acct', 'upgrade']);
const SWAP = {
  vi: [
    [/Câu lạc bộ/g, 'Cộng đồng'],
    [/câu lạc bộ/g, 'cộng đồng'],
    [/^CLB/, 'Cộng đồng'],
    [/([.!?:]\s+|\n|")CLB/g, (m, a) => `${a}Cộng đồng`],
    [/CLB/g, 'cộng đồng'],
  ],
  en: [
    [/\bClubs\b/g, 'Communities'],
    [/\bclubs\b/g, 'communities'],
    [/\bClub\b/g, 'Community'],
    [/\bclub\b/g, 'community'],
  ],
};
function asCommunity(l, key, str) {
  if (KEEP_NS.has(key.split('.')[0]) || /ộng đồng|ommunit|Club Manager|Social Manager/i.test(str)) return str;
  return (SWAP[l] || []).reduce((s, [re, to]) => s.replace(re, to), str);
}

// Three-level fallback: current lang -> vi -> en -> raw key.
// `sport`: a club of another sport than pickleball first looks in the dictionary's
// per-sport overrides (e.g. vi.sport.badminton['nav.inventory'] = 'Kho cầu').
// `space`: 'community' while a community is managed — first the dictionary's own
// wording (dict.space.community[key]), else "CLB" swapped for "cộng đồng".
export function translate(lang, key, params, sport, space) {
  const chain = [lang, DEFAULT_LANG, FALLBACK_LANG];
  for (const l of chain) {
    const dict = DICTS[l];
    if (!dict) continue;
    const override = sport && sport !== 'pickleball' ? dict.sport?.[sport]?.[key] : undefined;
    const own = space ? dict.space?.[space]?.[key] : undefined;
    let val = typeof own === 'string' ? own : typeof override === 'string' ? override : getPath(dict, key);
    if (typeof val === 'string') {
      if (space === 'community' && typeof own !== 'string') val = asCommunity(l, key, val);
      return interpolate(val, params);
    }
  }
  return key;
}

export const SUPPORTED_LANGS = Object.keys(DICTS);
export { DEFAULT_LANG };
