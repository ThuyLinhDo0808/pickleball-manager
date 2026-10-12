'use client';
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { translate, SUPPORTED_LANGS, DEFAULT_LANG } from '@/lib/i18n/core';

const I18nContext = createContext(null);
const STORAGE_KEY = 'pickleball_lang';

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(DEFAULT_LANG);
  // Sport of the club being managed (set by ClubContext); words like "DUPR" or "balls"
  // follow it.
  const [sport, setSport] = useState('pickleball');
  // 'community' while the manager pages run a community (set by AppShell): "CLB" words
  // read "cộng đồng" there.
  const [space, setSpace] = useState(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED_LANGS.includes(saved)) setLang(saved);
    } catch {
      /* localStorage unavailable — stay on default */
    }
  }, []);

  const changeLang = useCallback((next) => {
    if (!SUPPORTED_LANGS.includes(next)) return;
    setLang(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key, params) => translate(lang, key, params, sport, space), [lang, sport, space]);

  const value = useMemo(() => ({ lang, setLang: changeLang, t, langs: SUPPORTED_LANGS, sport, setSport, space, setSpace }), [lang, changeLang, t, sport, space]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

// Part of a page that talks about a community while the rest of the page doesn't (e.g. the
// request form for a new community): "CLB" words inside read "cộng đồng".
export function I18nSpace({ space, children }) {
  const ctx = useI18n();
  const t = useCallback((key, params) => translate(ctx.lang, key, params, ctx.sport, space), [ctx.lang, ctx.sport, space]);
  const value = useMemo(() => ({ ...ctx, t, space }), [ctx, t, space]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
