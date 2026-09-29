'use client';
import { useState } from 'react';
import { useClubs } from '@/context/ClubContext';
import { useI18n } from '@/context/I18nContext';

export default function CreateClubForm({ onCreated, autoFocus = false }) {
  const { t } = useI18n();
  const { createClub } = useClubs();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const club = await createClub({ name: trimmed, description: description.trim() });
      setName('');
      setDescription('');
      onCreated?.(club);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div>
        <label className="text-xs text-gray-400">{t('clubs.name')}</label>
        <input
          className="input"
          required
          maxLength={80}
          autoFocus={autoFocus}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('clubs.description')}</label>
        <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button className="btn-primary w-full sm:w-auto" disabled={busy || !name.trim()}>
          {t('clubs.create')}
        </button>
        {error && <span className="text-red-400 text-sm">{error}</span>}
      </div>
    </form>
  );
}
