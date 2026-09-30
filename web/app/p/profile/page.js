'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const empty = { full_name: '', phone: '', dupr_level: '', gender: '', birth_date: '', avatar: null, hide_identity: false };

// Shrink a photo to a 256px square JPEG data URL (~20-40 KB) so it can live in the profile row.
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const side = Math.min(img.width, img.height);
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function PlayerProfile() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const fileRef = useRef(null);
  const [form, setForm] = useState(empty);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get('/api/player/me').then((me) => {
      setEmail(me.email);
      if (me.profile) {
        const p = me.profile;
        setForm({ ...empty, ...p, dupr_level: p.dupr_level ?? '', birth_date: p.birth_date || '', gender: p.gender || '' });
      }
    });
  }, [user?.id]);

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setForm((f) => ({ ...f, avatar: null }));
      const avatar = await resizePhoto(file);
      setForm((f) => ({ ...f, avatar }));
    } catch {
      setError(t('common.error'));
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api.put('/api/player/profile', form);
      setSaved(true);
      // Came here from a join page? Go back to finish joining.
      const next = new URLSearchParams(window.location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) router.push(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <PlayerShell>
      <h1 className="text-white text-2xl font-bold mb-4">{t('player.profile')}</h1>
      <form onSubmit={save} className="card grid grid-cols-2 gap-3">
        <div className="col-span-2 flex items-center gap-4">
          {form.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.avatar} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-lime-400" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-navy-700 flex items-center justify-center text-lime-400 text-2xl font-bold">
              {(form.full_name || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <button type="button" className="btn-secondary text-sm" onClick={() => fileRef.current?.click()}>{t('player.changePhoto')}</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          </div>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-400">{t('player.email')}</label>
          <div className="text-gray-300 text-sm">{email}</div>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-400">{t('common.name')}</label>
          <input className="input" required autoComplete="name" value={form.full_name} onChange={set('full_name')} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-400">{t('common.phone')}</label>
          <input className="input" required type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('common.level')}</label>
          <input className="input" type="number" inputMode="decimal" step="0.01" min="1" max="8" value={form.dupr_level} onChange={set('dupr_level')} />
        </div>
        <div>
          <label className="text-xs text-gray-400">{t('members.birthDate')} *</label>
          <input className="input" required type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={form.birth_date} onChange={set('birth_date')} />
          {!form.birth_date && form.birth_year && <p className="text-yellow-300 text-xs mt-1">{t('player.needBirthDate')}</p>}
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-400">{t('members.gender')}</label>
          <select className="input" value={form.gender} onChange={set('gender')}>
            <option value="">—</option>
            <option value="male">{t('members.male')}</option>
            <option value="female">{t('members.female')}</option>
          </select>
        </div>
        <label className="col-span-2 flex items-start gap-3 rounded-lg border border-navy-600 p-3 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={!!form.hide_identity} onChange={(e) => setForm((f) => ({ ...f, hide_identity: e.target.checked }))} />
          <span>
            <span className="text-white text-sm font-semibold block">🕶 {t('privacy.toggle')}</span>
            <span className="text-gray-400 text-xs">{t('privacy.hint')}</span>
          </span>
        </label>
        {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
        <div className="col-span-2 flex items-center gap-3">
          <button className="btn-primary" disabled={busy}>{t('common.save')}</button>
          {saved && <span className="text-lime-400 text-sm">{t('player.saved')}</span>}
        </div>
      </form>
    </PlayerShell>
  );
}
