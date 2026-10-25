'use client';
import DuprCard from '@/components/DuprCard';
import DeleteAccount from '@/components/DeleteAccount';
import EmailChange from '@/components/EmailChange';
import AccountSecurity from '@/components/AccountSecurity';
import MyData from '@/components/MyData';
import FeedbackButton from '@/components/FeedbackButton';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import DateInput from '@/components/ui/DateInput';
import DuprIdGuide from '@/components/DuprIdGuide';
import UiIcon from '@/components/ui/UiIcon';
import { readTheme, saveTheme } from '@/lib/theme';

const empty = { full_name: '', phone: '', dupr_level: '', dupr_id: '', badminton_level: '', gender: '', birth_date: '', avatar: null };

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
  const { user, signOut } = useAuth();
  const router = useRouter();
  const fileRef = useRef(null);
  const [form, setForm] = useState(empty);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dupr, setDupr] = useState(null); // ratings from the clubs' DUPR imports
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (!user) return;
    api.get('/api/host/me').then((m) => setUsername(m?.username || '')).catch(() => {});
    api.get('/api/player/me').then((me) => {
      setEmail(me.email);
      setDupr(me.dupr || null);
      if (me.profile) {
        const p = me.profile;
        setForm({ ...empty, ...p, dupr_level: p.dupr_level ?? '', dupr_id: p.dupr_id || '', badminton_level: p.badminton_level ?? '', birth_date: p.birth_date || '', gender: p.gender || '' });
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
      api.get('/api/player/me').then((me) => setDupr(me.dupr || null)).catch(() => {});
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
  const shownName = form.full_name || (username ? `@${username}` : '');

  return (
    <PlayerShell>
      <div className="mx-auto max-w-4xl flex flex-col gap-4">
        {/* Who: photo, name, sign-in name and email, DUPR at a glance. */}
        <header className="card !p-4 sm:!p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative w-20 h-20 shrink-0">
            {form.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.avatar} alt="" className="w-20 h-20 rounded-full object-cover ring-2 ring-lime-400" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-navy-700 flex items-center justify-center text-lime-400 text-2xl font-bold">{(form.full_name || username || '?').slice(0, 1).toUpperCase()}</div>
            )}
            <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 w-11 h-11 rounded-full bg-lime-400 text-navy-950 flex items-center justify-center border-4 border-navy-800" aria-label={t('player.changePhoto')} title={t('player.changePhoto')}>
              <UiIcon name="camera" className="w-4 h-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-white text-xl sm:text-2xl font-bold break-words">{shownName || t('player.profile')}</h1>
            {username && <p className="text-gray-400 text-sm">@{username}</p>}
            <p className="text-gray-400 text-sm break-all">{email || user?.email}</p>
          </div>
        </header>

        <form onSubmit={save}>
          <Section icon="user" title={t('prof.personal')} hint={t('prof.personalHint')}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={`${t('common.name')} *`} htmlFor="pf-name">
                <input id="pf-name" className="input" required autoComplete="name" value={form.full_name} onChange={set('full_name')} />
              </Field>
              <Field label={`${t('common.phone')} *`} htmlFor="pf-phone">
                <input id="pf-phone" className="input" required type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
              </Field>
              <Field label={`${t('members.birthDate')} *`} htmlFor="pf-birth">
                <DateInput id="pf-birth" required min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={form.birth_date} onChange={(v) => setForm((x) => ({ ...x, birth_date: v }))} />
                {!form.birth_date && form.birth_year && <p className="text-yellow-300 text-sm mt-1">{t('player.needBirthDate')}</p>}
              </Field>
              <Field label={t('members.gender')} htmlFor="pf-gender">
                <select id="pf-gender" className="input" value={form.gender} onChange={set('gender')}>
                  <option value="">—</option>
                  <option value="male">{t('members.male')}</option>
                  <option value="female">{t('members.female')}</option>
                </select>
              </Field>
              {/* No self-rated DUPR here: the DUPR ID brings the real doubles / singles. */}
              <div className="sm:col-span-2 border-t border-navy-700 pt-3">
                <Field label={t('dupr.idLabel')} htmlFor="dupr-id">
                  <input
                    id="dupr-id"
                    className="input font-mono uppercase sm:max-w-xs"
                    maxLength={10}
                    autoCapitalize="characters"
                    autoComplete="off"
                    value={form.dupr_id}
                    onChange={(e) => setForm({ ...form, dupr_id: e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase() })}
                  />
                </Field>
                <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                  {t('dupr.idOptional')} <DuprIdGuide label={t('duprGuide.more')} />
                </p>
                {dupr && (dupr.linked || dupr.dupr_id) && (
                  <div className="mt-3">
                    <DuprCard dupr={dupr} showLink={false} />
                  </div>
                )}
              </div>
            </div>
            {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
            <div className="mt-4 flex items-center justify-end gap-3">
              {saved && <span className="text-good-fg text-sm" role="status">{t('player.saved')}</span>}
              <button className="btn-primary min-w-[7rem]" disabled={busy}>{busy ? t('common.loading') : t('common.save')}</button>
            </div>
          </Section>
        </form>

        <Section icon="eye" title={t('prof.appearance')} hint={t('prof.appearanceHint')}>
          <ThemePicker />
        </Section>

        <Section icon="mail" title={t('prof.account')} hint={t('prof.accountHint')}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-gray-400 text-xs">{t('player.email')}</p>
              <p className="text-white text-sm break-all">{user?.email || email}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <EmailChange />
              <button type="button" className="btn-secondary text-sm" onClick={() => signOut()}>
                <UiIcon name="logout" className="w-4 h-4" />
                {t('nav.signOut')}
              </button>
            </div>
          </div>
        </Section>

        {/* Two-step sign-in, devices, sign out everywhere — for every account (players too). */}
        <Section id="security" icon="shield" title={t('acct.s_security')} hint={t('sec.sectionHint')}>
          <AccountSecurity />
        </Section>

        {/* Download my data (personal data rights) + Terms / Privacy links. */}
        <Section id="my-data" icon="download" title={t('legal.myDataTitle')}>
          <MyData />
        </Section>

        {/* Players reach the Ban quản trị from here (the after-session review rates a session). */}
        <Section id="help" icon="chat" title={t('feedback.helpTitle')} hint={t('feedback.helpHint')}>
          <div className="flex justify-end sm:justify-start">
            <FeedbackButton className="btn-secondary text-sm">{t('feedback.button')}</FeedbackButton>
          </div>
        </Section>

        <Section icon="trash" title={t('deleteAccount.title')} danger>
          <DeleteAccount bare />
        </Section>
      </div>
    </PlayerShell>
  );
}

// A settings block: title + one-line hint on the left (computers), the controls on the right.
function Section({ id, icon, title, hint, danger = false, children }) {
  return (
    <section id={id} className={`card !p-4 sm:!p-6 scroll-mt-20 md:grid md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8 ${danger ? '!border-red-500/40' : ''}`}>
      <div className="mb-4 md:mb-0">
        <h2 className={`flex items-center gap-2 font-semibold text-base ${danger ? 'text-red-300' : 'text-white'}`}>
          <UiIcon name={icon} className={`w-5 h-5 ${danger ? 'text-red-300' : 'text-lime-400'}`} />
          {title}
        </h2>
        {hint && <p className="text-gray-400 text-sm mt-1 leading-relaxed">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}

// Dark (the NexusZone navy) · Light · follow the device. Saved on this device.
function ThemePicker() {
  const { t } = useI18n();
  const [pref, setPref] = useState('dark');
  useEffect(() => setPref(readTheme()), []);
  const pick = (v) => {
    setPref(v);
    saveTheme(v);
  };
  return (
    <div>
      <div role="radiogroup" aria-label={t('prof.appearance')} className="grid grid-cols-3 gap-2">
        {[
          ['dark', 'moon'],
          ['light', 'sun'],
          ['system', 'monitor'],
        ].map(([v, icon]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={pref === v}
            onClick={() => pick(v)}
            className={`min-h-[76px] rounded-xl border px-2 py-3 flex flex-col items-center justify-center gap-1.5 text-sm transition ${pref === v ? 'border-lime-400 bg-lime-400/10 text-white font-semibold' : 'border-navy-700 bg-navy-900 text-gray-300 hover:border-navy-600'}`}
          >
            <ThemeSwatch kind={v} />
            <span className="flex items-center gap-1">
              <UiIcon name={icon} className="w-4 h-4" />
              {t(`prof.theme_${v}`)}
            </span>
          </button>
        ))}
      </div>
      <p className="text-gray-400 text-sm mt-2">{t('prof.themeNote')}</p>
    </div>
  );
}

// A tiny page preview in each theme's own colours (fixed, whatever the current theme).
function ThemeSwatch({ kind }) {
  const page = (bg, card, line, bar) => (
    <span className="block w-12 h-8 rounded-md border overflow-hidden" style={{ background: bg, borderColor: line }} aria-hidden>
      <span className="block h-2" style={{ background: card, borderBottom: `1px solid ${line}` }} />
      <span className="block mx-1 mt-1 h-1 rounded-full" style={{ background: bar, width: '60%' }} />
      <span className="block mx-1 mt-1 h-2 rounded-sm" style={{ background: card }} />
    </span>
  );
  if (kind === 'dark') return page('#0B1220', '#16223b', '#1e2f4d', '#B6F03B');
  if (kind === 'light') return page('#f3f5f9', '#ffffff', '#e2e8f0', '#65a30d');
  return (
    <span className="flex" aria-hidden>
      <span className="overflow-hidden w-6">{page('#0B1220', '#16223b', '#1e2f4d', '#B6F03B')}</span>
      <span className="overflow-hidden w-6 flex justify-end">{page('#f3f5f9', '#ffffff', '#e2e8f0', '#65a30d')}</span>
    </span>
  );
}
