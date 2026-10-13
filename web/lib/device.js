'use client';
// A random id this browser keeps, sent with the password sign-in so the server can tell a
// new device (and email the account about it). Not a fingerprint: clearing site data
// makes a new one.
const KEY = 'pb_device';
export function deviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id || '')) {
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}
