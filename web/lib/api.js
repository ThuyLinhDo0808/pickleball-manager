'use client';
import { supabase } from './supabaseClient';
import { translate, DEFAULT_LANG } from './i18n/core';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// A club's avatar / cover picture (served by the API; the version busts the cache).
export const clubImage = (clubId, kind, version) => (clubId && version ? `${API_URL}/api/public/discover/clubs/${clubId}/${kind}?v=${version}` : null);

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// The owner viewing the app as one Host (Owner Console → Host → 👁): read-only.
const VIEW_AS_KEY = 'pb_view_as';
export function viewingAs() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(sessionStorage.getItem(VIEW_AS_KEY) || 'null');
  } catch {
    return null;
  }
}
export function startViewAs(host) {
  sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify({ id: host.id, email: host.email }));
  try { localStorage.removeItem('pickleball_club'); } catch {}
}
export function stopViewAs() {
  sessionStorage.removeItem(VIEW_AS_KEY);
  try { localStorage.removeItem('pickleball_club'); } catch {}
}

async function request(path, { method = 'GET', body, isPublic = false } = {}) {
  const as = !isPublic && !path.startsWith('/api/owner') ? viewingAs() : null;
  if (as && method !== 'GET') {
    window.dispatchEvent(new CustomEvent('pb:read-only'));
    const err = new Error('Chế độ xem chỉ đọc — không thay đổi được dữ liệu.');
    err.status = 403;
    err.payload = { code: 'read_only' };
    throw err;
  }
  const send = async () => {
    const headers = { 'Content-Type': 'application/json' };
    if (!isPublic) Object.assign(headers, await authHeader());
    if (as) headers['X-View-As'] = as.id;
    return fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  };

  let res = await send();
  // A stale login (token expired while the phone slept, or the account was removed):
  // refresh once; if the server still rejects it, sign out locally so the page shows
  // "log in" instead of an error.
  if (res.status === 401 && !isPublic) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data?.session) res = await send();
    if (res.status === 401) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  // An action ran into the plan (member limit, locked feature): explain it and offer the
  // plans (components/PlanLimitNotice). Page loads (GET) handle 402 themselves.
  if (res.status === 402 && method !== 'GET' && ['member_limit', 'feature_locked', 'role_seats'].includes(data.code) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pb:plan-limit', { detail: data }));
    // The notice explains it; the form only says so in the app's language (not the API's
    // English sentence).
    let lang = DEFAULT_LANG;
    try {
      lang = window.localStorage.getItem('pickleball_lang') || DEFAULT_LANG;
    } catch {
      /* ignore */
    }
    data.error = `💎 ${translate(lang, 'plan.limitTitle')}`;
  }
  // Two-step sign-in: this session still needs the code (or the account must turn it on
  // first, for the owner console). components/MfaGate asks for it.
  if (res.status === 403 && ['mfa_required', 'mfa_enroll_required'].includes(data.code) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pb:mfa', { detail: { code: data.code, scope: data.scope || null, reset_at: data.reset_at || null } }));
  }
  // Maintenance (Owner Console → Thông báo → Bảo trì): components/MaintenanceGate covers the app.
  if (res.status === 503 && data.code === 'maintenance' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pb:maintenance', { detail: data.maintenance || null }));
  }
  // The app owner suspended this account: the shell shows a notice instead of the app.
  if (res.status === 423 && data.code === 'account_suspended' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pb:suspended', { detail: { reason: data.reason, since: data.since } }));
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  publicGet: (path) => request(path, { isPublic: true }),
  publicPost: (path, body) => request(path, { method: 'POST', body, isPublic: true }),
};
