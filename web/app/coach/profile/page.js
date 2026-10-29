'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Segmented from '@/components/ui/Segmented';
import Hint from '@/components/ui/Hint';
import LoadingBlock from '@/components/ui/LoadingBlock';
import { useI18n } from '@/context/I18nContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { CoachGate, publicCoachUrl } from '@/components/coach/CoachGate';

const EMPTY = {
  display_name: '',
  sport: 'pickleball',
  slug: '',
  bio: '',
  level_text: '',
  dupr_id: '',
  area: '',
  court_name: '',
  map_url: '',
  price_note: '',
  phone: '',
  public: true,
  status: 'active',
  cancel_hours: 12,
  deduct_mode: 'present_or_noshow',
};
const FIELDS = Object.keys(EMPTY);

// Hồ sơ Coach: opened once (no approval, no plan), then edited here. The same form
// creates and edits; the public page shows everything but the phone and the rules.
export default function CoachProfilePage() {
  const { t } = useI18n();
  const router = useRouter();
  const { coachInfo, reloadCoach, setWorkspace } = useWorkspace();
  const { data: me, loading, error, reload } = useLoad(() => api.get('/api/coach/me').catch((e) => (e.payload?.code === 'no_profile' ? null : Promise.reject(e))), []);
  const creating = !loading && !me && !error;
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (me) setF(Object.fromEntries(FIELDS.map((k) => [k, me[k] ?? EMPTY[k] ?? ''])));
  }, [me]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const body = Object.fromEntries(FIELDS.map((k) => [k, typeof f[k] === 'string' ? f[k].trim() : f[k]]));
    body.cancel_hours = Number(body.cancel_hours);
    if (creating && !body.slug) delete body.slug;
    try {
      if (creating) {
        await api.post('/api/coach/me', body);
        await reloadCoach();
        setWorkspace('coach');
        router.push('/coach');
        return;
      }
      await api.patch('/api/coach/me', body);
      await reloadCoach();
      await reload();
      setMsg({ ok: true, text: t('common.saved') });
    } catch (err) {
      const code = err.payload?.code;
      setMsg({ ok: false, text: t(`coach.err_${code}`) === `coach.err_${code}` ? err.message : t(`coach.err_${code}`) });
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    const url = publicCoachUrl(me.slug);
    try {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t('coach.copyLink'), url);
    }
  }

  const unverified = coachInfo?.enabled && coachInfo?.email_verified === false;
  const label = (k, hint) => (
    <label className="text-xs text-gray-400 flex items-center gap-1">
      {t(`coach.f_${k}`)}
      {hint && <Hint inline text={t(`coach.h_${k}`)} />}
    </label>
  );

  return (
    <AppShell>
      <CoachGate error={error} reload={reload} needProfile={false}>
        <PageHeader
          icon="user"
          title={creating ? t('coach.openProfile') : t('coach.profileTitle')}
          subtitle={creating ? t('coach.openLead') : t('coach.profileLead')}
          hint={<Hint inline text={t('coach.profileHint')} />}
        />
        {loading && !me && <LoadingBlock rows={4} className="card" />}
        {!loading && (
          <form onSubmit={save} className="grid gap-4">
            {unverified && creating && <p className="card border-amber-300/50 text-amber-200 text-sm">{t('coach.verifyFirst')}</p>}

            {!creating && me && (
              <section className="card !py-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-400">{t('coach.yourLink')}</span>
                <span className="text-white break-all flex-1 min-w-0">{publicCoachUrl(me.slug)}</span>
                <div className="flex gap-2 ml-auto">
                  <button type="button" className="btn-secondary text-sm" onClick={copyLink}>{copied ? t('coach.copied') : t('coach.copyLink')}</button>
                  <Link href={`/coach/${me.slug}`} className="btn-secondary text-sm">{t('coach.viewPublic')}</Link>
                </div>
              </section>
            )}

            <section className="card grid gap-3">
              <h2 className="text-white font-semibold">{t('coach.secIntro')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  {label('display_name')}
                  <input className="input" required minLength={2} maxLength={80} value={f.display_name} onChange={set('display_name')} />
                </div>
                <div>
                  {label('sport')}
                  <Segmented items={['pickleball', 'badminton']} value={f.sport} onChange={set('sport')} label={(k) => t(`clubs.sport_${k}`)} full />
                </div>
              </div>
              <div>
                {label('slug', true)}
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-gray-500 whitespace-nowrap">/coach/</span>
                  <input className="input" placeholder={creating ? t('coach.slugAuto') : ''} maxLength={40} value={f.slug} onChange={set('slug')} pattern="[a-z0-9][a-z0-9-]{2,39}" />
                </div>
              </div>
              <div>
                {label('bio')}
                <textarea className="input min-h-[7rem]" maxLength={2000} value={f.bio} onChange={set('bio')} placeholder={t('coach.bioPh')} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  {label('level_text', true)}
                  <input className="input" maxLength={80} value={f.level_text} onChange={set('level_text')} placeholder={t('coach.levelPh')} />
                </div>
                {f.sport === 'pickleball' && (
                  <div>
                    {label('dupr_id')}
                    <input className="input" maxLength={20} value={f.dupr_id} onChange={set('dupr_id')} />
                  </div>
                )}
              </div>
            </section>

            <section className="card grid gap-3">
              <h2 className="text-white font-semibold">{t('coach.secWhere')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  {label('area')}
                  <input className="input" maxLength={120} value={f.area} onChange={set('area')} placeholder={t('coach.areaPh')} />
                </div>
                <div>
                  {label('court_name')}
                  <input className="input" maxLength={160} value={f.court_name} onChange={set('court_name')} />
                </div>
              </div>
              <div>
                {label('map_url', true)}
                <input className="input" type="url" maxLength={500} value={f.map_url} onChange={set('map_url')} placeholder="https://maps.app.goo.gl/…" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  {label('price_note', true)}
                  <input className="input" maxLength={300} value={f.price_note} onChange={set('price_note')} placeholder={t('coach.pricePh')} />
                </div>
                <div>
                  {label('phone', true)}
                  <input className="input" type="tel" maxLength={20} value={f.phone} onChange={set('phone')} />
                </div>
              </div>
            </section>

            <section className="card grid gap-3">
              <h2 className="text-white font-semibold">{t('coach.secRules')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  {label('cancel_hours', true)}
                  <input className="input" type="number" min="0" max="168" step="1" value={f.cancel_hours} onChange={set('cancel_hours')} />
                </div>
                <div>
                  {label('deduct_mode', true)}
                  <select className="input" value={f.deduct_mode} onChange={set('deduct_mode')}>
                    {['present_or_noshow', 'present_only', 'always'].map((k) => <option key={k} value={k}>{t(`coach.deduct_${k}`)}</option>)}
                  </select>
                </div>
              </div>
            </section>

            <section className="card grid gap-3">
              <h2 className="text-white font-semibold">{t('coach.secVisibility')}</h2>
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input type="checkbox" className="mt-1" checked={!!f.public} onChange={set('public')} />
                <span>
                  <span className="text-gray-100 font-medium">{t('coach.f_public')}</span>
                  <span className="block text-gray-400 text-xs">{t('coach.h_public')}</span>
                </span>
              </label>
              {!creating && (
                <div>
                  {label('status', true)}
                  <Segmented items={['active', 'paused']} value={f.status} onChange={set('status')} label={(k) => t(`coach.status_${k}`)} full />
                </div>
              )}
            </section>

            {msg && <p className={`text-sm ${msg.ok ? 'text-lime-300' : 'text-red-300'}`}>{msg.text}</p>}
            <div className="flex justify-end gap-2">
              {!creating && <Link href="/coach" className="btn-secondary">{t('common.cancel')}</Link>}
              <button className="btn-primary" disabled={busy || (creating && unverified)}>{creating ? t('coach.openCta') : t('common.save')}</button>
            </div>
          </form>
        )}
      </CoachGate>
    </AppShell>
  );
}
