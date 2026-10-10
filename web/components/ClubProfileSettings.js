'use client';
import { useState } from 'react';
import { ClubProfileFields, ClubImagesPicker } from '@/components/ClubProfileFields';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { api, clubImage } from '@/lib/api';
import { VIETNAM } from '@/lib/regions';

// The club's public profile (shown in the club search): where and when it plays, size,
// contact, pictures, and whether it is listed at all.
export default function ClubProfileSettings({ club, onDone }) {
  const { t } = useI18n();
  const { updateClub, reload } = useClubs();
  const [form, setForm] = useState({
    country: club.country || VIETNAM,
    province: club.province || '',
    district: club.district || '',
    address: club.address || '',
    schedule: club.schedule || '',
    description: club.description || '',
    contact_email: club.contact_email || '',
    member_count: club.member_count_hint ?? '',
  });
  const [listed, setListed] = useState(club.is_listed !== false);
  // undefined = unchanged; null = removed; data URL = new picture.
  const [avatar, setAvatar] = useState(undefined);
  const [cover, setCover] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const owner = (club.role || 'owner') === 'owner';

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateClub(club.id, { ...form, member_count: form.member_count === '' ? null : Number(form.member_count), is_listed: listed });
      const pics = {};
      if (avatar !== undefined) pics.avatar = avatar;
      if (cover !== undefined) pics.cover = cover;
      if (owner && Object.keys(pics).length) await api.put(`/api/clubs/${club.id}/images`, pics);
      await reload?.();
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const shownAvatar = avatar !== undefined ? avatar : clubImage(club.id, 'avatar', club.avatar_version);
  const shownCover = cover !== undefined ? cover : clubImage(club.id, 'cover', club.cover_version);

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {owner && <ClubImagesPicker avatar={shownAvatar} cover={shownCover} onAvatar={setAvatar} onCover={setCover} name={club.name} />}
      <ClubProfileFields form={form} set={set} />
      <label className="flex items-start gap-3 rounded-xl border border-navy-600 p-3 cursor-pointer">
        <input type="checkbox" className="mt-1" checked={listed} onChange={(e) => setListed(e.target.checked)} />
        <span>
          <span className="block text-white text-sm font-semibold">{t('clubProfile.listed')}</span>
          <span className="block text-gray-400 text-xs">{t('clubProfile.listedHint')}</span>
        </span>
      </label>
      {error && <p className="text-red-300 text-sm">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onDone}>{t('common.cancel')}</button>
        <button className="btn-primary" disabled={busy}>{busy ? t('common.loading') : t('common.save')}</button>
      </div>
    </form>
  );
}
