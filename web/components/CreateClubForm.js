'use client';
import { useState } from 'react';
import { useClubs } from '@/context/ClubContext';
import { useI18n } from '@/context/I18nContext';

export default function CreateClubForm({ onCreated, autoFocus = false }) {
  const { t } = useI18n();
  const { createClub } = useClubs();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sport, setSport] = useState('pickleball');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const club = await createClub({ name: trimmed, description: description.trim(), sport });
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
        <label className="text-xs text-gray-400">{t('clubs.sport')}</label>
        <div className="grid grid-cols-2 gap-2 mt-1" role="radiogroup">
          {['pickleball', 'badminton'].map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={sport === s}
              onClick={() => setSport(s)}
              className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${sport === s ? 'border-lime-400 bg-lime-400/10 text-white' : 'border-navy-600 text-gray-300 hover:border-navy-500'}`}
            >
              {t(`clubs.sport_${s}`)}
            </button>
          ))}
        </div>
        <p className="text-gray-500 text-xs mt-1">{t('clubs.sportHint')}</p>
      </div>
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
