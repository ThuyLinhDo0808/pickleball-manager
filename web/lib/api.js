'use client';
import { supabase } from './supabaseClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body, isPublic = false } = {}) {
  const send = async () => {
    const headers = { 'Content-Type': 'application/json' };
    if (!isPublic) Object.assign(headers, await authHeader());
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
  if (res.status === 402 && method !== 'GET' && ['member_limit', 'feature_locked'].includes(data.code) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pb:plan-limit', { detail: data }));
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
