'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Warns the Host when the backend is newer than the database (a migration wasn't run):
// names the exact file to paste into the Supabase SQL Editor.
export default function SchemaBanner() {
  const { t } = useI18n();
  const [missing, setMissing] = useState([]);
  useEffect(() => {
    api.publicGet('/health/schema').then((r) => setMissing(r.missing_migrations || [])).catch(() => {});
  }, []);
  if (!missing.length) return null;
  return (
    <div className="mb-4 rounded-xl border-2 border-red-400/70 bg-red-500/10 px-4 py-3 text-sm">
      <p className="text-red-200 font-bold">⚠️ {t('schema.title')}</p>
      <p className="text-gray-200 mt-1">{t('schema.hint')}</p>
      <ul className="mt-1 font-mono text-xs text-red-100">
        {missing.map((m) => <li key={m}>supabase/migrations/{m}</li>)}
      </ul>
    </div>
  );
}
