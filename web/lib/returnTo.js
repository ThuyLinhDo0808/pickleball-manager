// Where to go back to after signing up: a club invite, a kèo link… The ?next= of the sign-in
// page is lost when the account is confirmed from the email (the link opens a new page), so
// it is also kept here for two days and used when a later page has no ?next=.
const KEY = 'pb_return_to';
const TTL = 2 * 86400000;
const SKIP = ['/sign-in', '/onboarding', '/verify-email', '/welcome', '/home', '/reset-password'];

const ok = (path) => typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !SKIP.some((p) => path === p || path.startsWith(`${p}?`) || path.startsWith(`${p}/`));

export function rememberReturn(path) {
  if (!ok(path)) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    /* private mode: ?next= still works */
  }
}

export function peekReturn() {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (v && ok(v.path) && Date.now() - v.at < TTL) return v.path;
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return null;
}

// The page was reached: nothing to go back to any more.
export function clearReturn(path) {
  try {
    const cur = peekReturn();
    if (!path || !cur || cur.split('?')[0] === path) window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
