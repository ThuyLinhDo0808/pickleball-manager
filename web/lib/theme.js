// Colour theme: 'dark' (default, the NexusZone navy), 'light', or 'system' (follow the
// device). Saved on this device; html[data-theme="light"] switches every page
// (app/theme.css). The landing page and sign-in keep their dark look.
export const THEME_KEY = 'pb_theme';
export const THEMES = ['dark', 'light', 'system'];
const DARK_ONLY = (path) => path === '/' || path.startsWith('/sign-in');

export function readTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEMES.includes(v) ? v : 'dark';
  } catch {
    return 'dark';
  }
}

export function resolveTheme(pref, path) {
  if (DARK_ONLY(path || '/x')) return 'dark';
  if (pref === 'system') return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return pref === 'light' ? 'light' : 'dark';
}

export function applyTheme(pref = readTheme(), path = typeof window !== 'undefined' ? window.location.pathname : '/x') {
  const t = resolveTheme(pref, path);
  const el = document.documentElement;
  if (t === 'light') el.setAttribute('data-theme', 'light');
  else el.removeAttribute('data-theme');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f3f5f9' : '#0B1220');
  return t;
}

export function saveTheme(pref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* private mode: this visit only */
  }
  applyTheme(pref);
  window.dispatchEvent(new Event('pb-theme'));
}

// Runs before the page paints (inline in <head>), so a light page never flashes dark.
export const THEME_BOOT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');var path=location.pathname;if(path==='/'||path.indexOf('/sign-in')===0)return;var l=p==='light'||(p==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches);if(l)document.documentElement.setAttribute('data-theme','light');}catch(e){}})();`;
