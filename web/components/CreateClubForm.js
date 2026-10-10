'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useClubs } from '@/context/ClubContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useI18n } from '@/context/I18nContext';
import { UpgradeModal } from '@/components/PlanModals';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';

// New clubs are asked for and approved by the app owner (/club-request). Only when the
// owner switched approval off can a club be created here straight away.
export default function CreateClubForm(props) {
  const { t } = useI18n();
  const { data, loading } = useLoad(() => api.get('/api/host/club-requests').catch(() => ({ approval: true, items: [] })), []);
  if (loading && !data) return <p className="text-gray-400 text-sm">{t('common.loading')}</p>;
  if (data?.approval !== false) {
    const waiting = (data?.items || []).find((r) => r.status === 'pending');
    return (
      <div className="rounded-xl border border-lime-400/40 bg-lime-400/5 p-4">
        <p className="text-white font-semibold">🏟 {waiting ? t('creq.waitingTitle', { name: waiting.name }) : t('creq.ctaTitle')}</p>
        <p className="text-gray-300 text-sm mt-1">{waiting ? t('creq.waitingBody') : t('creq.ctaBody')}</p>
        <Link href="/club-request" className="btn-primary inline-block mt-3">{waiting ? t('creq.seeRequest') : t('creq.ctaButton')}</Link>
      </div>
    );
  }
  return <DirectCreateForm {...props} />;
}

function DirectCreateForm({ onCreated, autoFocus = false }) {
  const { t } = useI18n();
  const { createClub } = useClubs();
  const { workspace } = useWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sport, setSport] = useState('pickleball');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [limited, setLimited] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const club = await createClub({ name: trimmed, description: description.trim(), sport, kind: workspace === 'xeve' ? 'community' : 'club' });
      setName('');
      setDescription('');
      onCreated?.(club);
    } catch (err) {
      if (err.payload?.code === 'club_limit') {
        setLimited(true);
        setError(t('plan.limitReached'));
      } else setError(err.message);
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
    <UpgradeModal open={limited} onClose={() => setLimited(false)} />
    </form>
  );
}
