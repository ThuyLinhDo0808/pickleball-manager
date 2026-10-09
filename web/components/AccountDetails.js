'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { REGIONS, ABROAD } from '@/lib/regions';

// Sign-in name and the details asked at sign-up. Older accounts (signed up with an
// email only) can choose a username here and sign in with it from then on.
export default function AccountDetails() {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.get('/api/host/account'), []);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (data) setF({ username: data.username || '', birth_date: data.birth_date || '', gender: data.gender || '', region: data.region || '' });
  }, [data]);
  if (error) return <p className="text-gray-500 text-sm">{error.message}</p>;
  if (!f) return <p className="text-gray-400 text-sm">{t('common.loading')}</p>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const changed = ['username', 'birth_date', 'gender', 'region'].filter((k) => f[k] && f[k] !== (data[k] || ''));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.patch('/api/host/account', Object.fromEntries(changed.map((k) => [k, k === 'username' ? f[k].trim().toLowerCase() : f[k]])));
      setMsg({ ok: true, text: t('auth.detailsSaved') });
      reload();
    } catch (err) {
      const c = err.payload?.code;
      setMsg({ ok: false, text: ['username_taken', 'bad_username', 'bad_birth_date', 'bad_gender', 'bad_region'].includes(c) ? t(`auth.err_${c}`) : err.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      {!data.username && <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{t('auth.setUsernameHint')}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm text-gray-300">
          {t('auth.username')}
          <input className="input mt-1" autoCapitalize="none" maxLength={30} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} />
          <span className="text-[11px] text-gray-500">{t('auth.usernameRule')}</span>
        </label>
        <label className="text-sm text-gray-300">
          {t('auth.email')}
          <input className="input mt-1 opacity-70" value={data.email || ''} readOnly />
        </label>
        <label className="text-sm text-gray-300">
          {t('auth.birthDate')}
          <input className="input mt-1" type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={f.birth_date} onChange={set('birth_date')} />
        </label>
        <label className="text-sm text-gray-300">
          {t('auth.region')}
          <select className="input mt-1" value={f.region} onChange={set('region')}>
            <option value="" disabled>{t('auth.regionPick')}</option>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value={ABROAD}>{t('auth.abroad')}</option>
            {f.region && ![...REGIONS, ABROAD].includes(f.region) && <option value={f.region}>{f.region}</option>}
          </select>
        </label>
      </div>
      <div className="flex gap-2" role="radiogroup" aria-label={t('auth.gender')}>
        {['male', 'female', 'other'].map((g) => (
          <button key={g} type="button" role="radio" aria-checked={f.gender === g} onClick={() => setF({ ...f, gender: g })} className={`rounded-lg border px-3 py-1.5 text-sm ${f.gender === g ? 'border-lime-400 bg-lime-400 text-navy-950 font-semibold' : 'border-navy-600 text-gray-200'}`}>
            {t(`auth.g_${g}`)}
          </button>
        ))}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-lime-300' : 'text-red-300'}`}>{msg.text}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary text-sm" disabled={busy || !changed.length}>{t('common.save')}</button>
        <button
          type="button"
          className="text-sm text-gray-400 hover:text-lime-300 underline"
          onClick={async () => {
            await api.publicPost('/api/public/auth/forgot', { login: data.email, origin: window.location.origin }).catch(() => {});
            setMsg({ ok: true, text: t('auth.changePasswordSent', { email: data.email }) });
          }}
        >
          {t('auth.changePassword')}
        </button>
      </div>
    </form>
  );
}
