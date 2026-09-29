'use client';
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { translate, SUPPORTED_LANGS, DEFAULT_LANG } from '@/lib/i18n/core';

const I18nContext = createContext(null);
const STORAGE_KEY = 'pickleball_lang';

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(DEFAULT_LANG);

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

  const t = useCallback((key, params) => translate(lang, key, params), [lang]);

  const value = useMemo(() => ({ lang, setLang: changeLang, t, langs: SUPPORTED_LANGS }), [lang, changeLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
