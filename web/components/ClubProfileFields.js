'use client';
import { useRef, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { COUNTRIES, PROVINCES, VIETNAM } from '@/lib/regions';
import { resizeImage } from '@/lib/image';

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-300">
        {label}
        {required && <span className="text-lime-400"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block text-gray-500 text-[11px] mt-1">{hint}</span>}
    </label>
  );
}

// Where and when the club plays, how big it is and who to contact: shared by the club
// request and the club's own profile settings. `form` holds the values, `set(key, v)`.
export function ClubProfileFields({ form, set, withName = false, sports = null }) {
  const { t } = useI18n();
  const vn = (form.country || VIETNAM) === VIETNAM;
  const other = !COUNTRIES.includes(form.country || VIETNAM);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {withName && (
        <div className="sm:col-span-2">
          <Field label={t('creq.name')} required>
            <input className="input" required minLength={2} maxLength={80} value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder={t('creq.namePh')} />
          </Field>
        </div>
      )}
      {sports && (
        <div className="sm:col-span-2">
          <span className="text-xs font-medium text-gray-300">{t('creq.sport')}<span className="text-lime-400"> *</span></span>
          <div className="mt-1 flex gap-2" role="radiogroup" aria-label={t('creq.sport')}>
            {sports.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={form.sport === s}
                onClick={() => set('sport', s)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm ${form.sport === s ? 'border-lime-400 bg-lime-400/10 text-white font-semibold' : 'border-navy-600 text-gray-300'}`}
              >
                {s === 'badminton' ? '🏸' : '🏓'} {t(`onb.sport_${s}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      <Field label={t('creq.memberCount')} required hint={t('creq.memberCountHint')}>
        <input className="input" type="number" min={1} max={100000} inputMode="numeric" required value={form.member_count ?? ''} onChange={(e) => set('member_count', e.target.value)} />
      </Field>
      <Field label={t('creq.contactEmail')} required hint={t('creq.contactEmailHint')}>
        <input className="input" type="email" required maxLength={200} value={form.contact_email || ''} onChange={(e) => set('contact_email', e.target.value)} />
      </Field>
      <Field label={t('creq.country')} required>
        <select
          className="input"
          value={other ? '__other' : form.country || VIETNAM}
          onChange={(e) => {
            const v = e.target.value;
            set('country', v === '__other' ? '' : v);
            if (v !== VIETNAM) set('province', '');
          }}
        >
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="__other">{t('creq.countryOther')}</option>
        </select>
        {other && <input className="input mt-2" required maxLength={60} placeholder={t('creq.countryPh')} value={form.country || ''} onChange={(e) => set('country', e.target.value)} />}
      </Field>
      <Field label={t('creq.province')} required>
        {vn ? (
          <select className="input" required value={form.province || ''} onChange={(e) => set('province', e.target.value)}>
            <option value="">{t('creq.pick')}</option>
            {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <input className="input" required maxLength={80} value={form.province || ''} onChange={(e) => set('province', e.target.value)} placeholder={t('creq.provincePh')} />
        )}
      </Field>
      <Field label={t('creq.district')} hint={t('creq.districtHint')}>
        <input className="input" maxLength={80} value={form.district || ''} onChange={(e) => set('district', e.target.value)} placeholder={t('creq.districtPh')} />
      </Field>
      <Field label={t('creq.address')} required>
        <input className="input" required minLength={2} maxLength={200} value={form.address || ''} onChange={(e) => set('address', e.target.value)} placeholder={t('creq.addressPh')} />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t('creq.schedule')} hint={t('creq.scheduleHint')}>
          <input className="input" maxLength={300} value={form.schedule || ''} onChange={(e) => set('schedule', e.target.value)} placeholder={t('creq.schedulePh')} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label={t('creq.description')}>
          <textarea className="input" rows={3} maxLength={1000} value={form.description || ''} onChange={(e) => set('description', e.target.value)} placeholder={t('creq.descriptionPh')} />
        </Field>
      </div>
    </div>
  );
}

// Optional avatar (square) and cover (wide) pictures, shrunk in the browser first.
export function ClubImagesPicker({ avatar, cover, onAvatar, onCover, name = '' }) {
  const { t } = useI18n();
  const aRef = useRef(null);
  const cRef = useRef(null);
  const [err, setErr] = useState('');
  async function pick(file, kind) {
    if (!file) return;
    setErr('');
    try {
      const url = kind === 'avatar' ? await resizeImage(file, 400, 150000) : await resizeImage(file, 1400, 450000);
      (kind === 'avatar' ? onAvatar : onCover)(url);
    } catch {
      setErr(t('creq.imageErr'));
    }
  }
  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-navy-600 bg-navy-900 aspect-[3/1]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-navy-800 via-navy-900 to-lime-900/30" />
        )}
        <div className="absolute bottom-2 left-3 flex items-end gap-3">
          <span className="h-16 w-16 rounded-2xl border-2 border-navy-950 bg-navy-700 overflow-hidden flex items-center justify-center text-lime-300 text-xl font-black">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              (name || '?').slice(0, 2).toUpperCase()
            )}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <button type="button" className="btn-secondary !py-1.5 text-sm" onClick={() => aRef.current?.click()}>🖼 {avatar ? t('creq.avatarChange') : t('creq.avatarAdd')}</button>
        {avatar && <button type="button" className="text-gray-400 hover:text-white underline text-xs" onClick={() => onAvatar(null)}>{t('creq.remove')}</button>}
        <button type="button" className="btn-secondary !py-1.5 text-sm" onClick={() => cRef.current?.click()}>🌄 {cover ? t('creq.coverChange') : t('creq.coverAdd')}</button>
        {cover && <button type="button" className="text-gray-400 hover:text-white underline text-xs" onClick={() => onCover(null)}>{t('creq.remove')}</button>}
      </div>
      <input ref={aRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0], 'avatar'); e.target.value = ''; }} />
      <input ref={cRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0], 'cover'); e.target.value = ''; }} />
      <p className="text-gray-500 text-[11px] mt-1">{t('creq.imagesHint')}</p>
      {err && <p className="text-red-300 text-xs mt-1">{err}</p>}
    </div>
  );
}
