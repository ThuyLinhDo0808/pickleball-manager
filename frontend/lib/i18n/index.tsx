'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { DICTS, getLanguage, setLanguageInMemory, subscribe, t } from './core';

export { t };

const I18nContext = createContext<any>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState(getLanguage());
  const [ready, setReady] = useState(false);

  useEffect(() => subscribe(setLang), []);

  useEffect(() => {
    const saved = localStorage.getItem('app.language');
    if (saved && (DICTS as any)[saved]) {
      setLanguageInMemory(saved);
    }
    setReady(true);
  }, []);

  const setLanguage = (code: string) => {
    setLanguageInMemory(code);
    localStorage.setItem('app.language', code);
  };

  return (
    <I18nContext.Provider value={{ lang, t, setLanguage, ready }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}