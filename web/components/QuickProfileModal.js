'use client';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { ProfileForm } from '@/components/EventSignup';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Missing name / phone / gender on the player profile: filled in a pop-up, then back to what
// the player was doing (the caller retries it in onSaved). Saved on the profile itself.
export function QuickProfileModal({ open, onClose, onSaved, sport = 'pickleball' }) {
  const { t } = useI18n();
  const [me, setMe] = useState(null);
  useEffect(() => {
    if (open) api.get('/api/player/me').then(setMe).catch(() => setMe({}));
  }, [open]);
  return (
    <Modal open={open} title={`${t('quickfix.profileTitle')}`} onClose={onClose}>
      {me ? <ProfileForm profile={me.profile} sport={sport} onSaved={() => { onClose(); onSaved?.(); }} /> : <p className="text-gray-400 text-sm">{t('common.loading')}</p>}
    </Modal>
  );
}

// The player's DUPR ID, from anywhere it is missing (player home, DUPR card).
export function QuickDuprIdModal({ open, onClose, onSaved }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState(null);
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setErr('');
    api.get('/api/player/me').then((r) => { setProfile(r.profile || null); setId(r.profile?.dupr_id || ''); }).catch(() => setProfile(null));
  }, [open]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.put('/api/player/profile', { ...(profile || {}), dupr_id: id || null });
      onClose();
      onSaved?.();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} title={`${t('quickfix.duprIdTitle')}`} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <p className="text-gray-400 text-sm">{t('quick.duprIdNote')}</p>
        <input className="input font-mono uppercase placeholder:normal-case" maxLength={10} placeholder={t('quick.duprIdPh')} value={id} onChange={(e) => setId(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} aria-label="DUPR ID" />
        {!profile?.full_name && <p className="text-amber-200 text-xs">{t('quickfix.profileFirst')}</p>}
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex justify-end">
          <button className="btn-primary max-sm:w-full sm:px-8" disabled={busy || !id || !profile?.full_name}>{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}

// Birth date missing on the profile (asked by clubs for birthdays and age groups).
export function QuickBirthModal({ open, onClose, onSaved }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState(null);
  const [birth, setBirth] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setErr('');
    api.get('/api/player/me').then((r) => { setProfile(r.profile || null); setBirth(r.profile?.birth_date || ''); }).catch(() => setProfile(null));
  }, [open]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.put('/api/player/profile', { ...(profile || {}), birth_date: birth });
      onClose();
      onSaved?.();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} title={`${t('quickfix.birthTitle')}`} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <label className="text-xs text-gray-400" htmlFor="qf-birth">{t('members.birthDate')}</label>
        <input id="qf-birth" className="input" type="date" required value={birth} onChange={(e) => setBirth(e.target.value)} />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex justify-end">
          <button className="btn-primary max-sm:w-full sm:px-8" disabled={busy || !birth}>{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}
