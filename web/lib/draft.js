// What a player typed but has not sent yet, kept on this device for two days: a reload, a
// closed tab or a trip to another page never loses it. Cleared once it is sent. Private mode
// (no storage): nothing is kept and the form still works.
import { useEffect, useRef, useState } from 'react';

const TTL = 2 * 86400000;

export function readDraft(key) {
  if (!key) return null;
  try {
    const v = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (v && Date.now() - v.at < TTL) return v.data;
    window.localStorage.removeItem(key);
  } catch {
    /* nothing kept */
  }
  return null;
}

export function writeDraft(key, data) {
  if (!key) return;
  try {
    if (data == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* full or private mode: the form still works */
  }
}

export const clearDraft = (key) => writeDraft(key, null);

// useState that is saved under `key` on every change and comes back on the next visit.
// `key` null = not saved (e.g. not signed in yet).
export function useDraft(key, initial) {
  const [value, setValue] = useState(initial);
  const loaded = useRef(null);
  useEffect(() => {
    if (!key || loaded.current === key) return;
    loaded.current = key;
    const kept = readDraft(key);
    if (kept != null) setValue((v) => (typeof v === 'object' && v && !Array.isArray(v) ? { ...v, ...kept } : kept));
  }, [key]);
  useEffect(() => {
    if (key && loaded.current === key) writeDraft(key, value);
  }, [key, value]);
  return [value, setValue];
}
