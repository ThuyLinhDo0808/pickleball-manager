'use client';
import { peekReturn } from '@/lib/returnTo';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import LevelInput from '@/components/LevelInput';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import Hint from '@/components/ui/Hint';
import UiIcon from '@/components/ui/UiIcon';

// Only pickleball is offered for now: no sport step (badminton is hidden everywhere).
const STEPS = ['role', 'info'];
const ROLES = [
  ['player', 'user'],
  ['manager', 'user'],
];

function Choice({ on, onClick, icon, title, body, role = 'checkbox' }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={`w-full text-left rounded-2xl border p-4 flex items-start gap-3 transition ${on ? 'border-lime-400 bg-lime-400/10 ring-1 ring-lime-400' : 'border-navy-600 hover:border-navy-500'}`}
    >
      <UiIcon name={icon} className="w-7 h-7 text-gray-300" />
      <span className="min-w-0 flex-1">
        <span className="block text-white font-bold">{title}</span>
        <span className="block text-gray-400 text-sm mt-0.5">{body}</span>
      </span>
      <span className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center text-[11px] ${on ? 'border-lime-400 bg-lime-400 text-navy-950' : 'border-navy-500'}`} aria-hidden="true">{on ? '✓' : ''}</span>
    </button>
  );
}

// First visit after sign-up: the sports you play, player or club manager, then your
// profile and levels. Managers go on to ask for their club (owner approval).
export default function OnboardingPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const sports = ['pickleball'];
  const [role, setRole] = useState('player');
  const [f, setF] = useState({ full_name: '', phone: '', gender: '', birth_date: '', dupr_level: '', badminton_level: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Start from what is already known (sign-up details, an older player profile).
  useEffect(() => {
    if (!user) return;
    Promise.all([api.get('/api/host/me').catch(() => null), api.get('/api/player/me').catch(() => null)]).then(([me, pm]) => {
      const p = pm?.profile || {};
      if (me?.account_role) setRole(me.account_role);
      setF((x) => ({
        ...x,
        full_name: p.full_name || x.full_name,
        phone: p.phone || x.phone,
        gender: p.gender || me?.gender || x.gender,
        birth_date: p.birth_date || me?.birth_date || x.birth_date,
        dupr_level: p.dupr_level ?? x.dupr_level,
        badminton_level: p.badminton_level ?? x.badminton_level,
      }));
    });
  }, [user]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const canNext = true;

  async function finish(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/player/onboarding', { sports, role, ...f, gender: f.gender || null });
      // Came from a link (club invite, kèo…): back to it; else managers go on to ask for
      // their club / community.
      const next = new URLSearchParams(window.location.search).get('next') || '';
      const safe = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/onboarding') ? next : null;
      router.replace(safe || peekReturn() || (role === 'manager' ? '/club-request?from=onboarding' : '/home'));
    } catch (err) {
      setError(err.payload?.code === 'birth_date_required' ? t('onb.errBirth') : err.message);
      setBusy(false);
    }
  }

  return (
    <PlayerShell back={false}>
      <div className="mx-auto max-w-xl">
        <p className="text-lime-400 text-xs font-bold">{t('onb.kicker')}</p>
        <h1 className="text-white text-2xl font-bold mt-1">{t(`onb.title_${STEPS[step]}`)}</h1>
        <p className="text-gray-400 text-sm mt-1 mb-4">{t(`onb.sub_${STEPS[step]}`)}</p>

        <ol className="flex items-center gap-2 mb-5" aria-label={t('onb.progress')}>
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-lime-400' : 'bg-navy-700'}`} />
              <span className={`block mt-1 text-[11px] ${i === step ? 'text-white font-semibold' : 'text-gray-500'}`}>{i + 1}. {t(`onb.step_${s}`)}</span>
            </li>
          ))}
        </ol>

        {STEPS[step] === 'role' && (
          <div className="flex flex-col gap-3" role="radiogroup" aria-label={t('onb.step_role')}>
            {ROLES.map(([r, icon]) => (
              <Choice key={r} role="radio" on={role === r} onClick={() => setRole(r)} icon={icon} title={t(`onb.role_${r}`)} body={t(`onb.roleHint_${r}`)} />
            ))}
            {role === 'manager' && <p className="rounded-xl border border-amber-300/40 bg-amber-300/5 px-3 py-2 text-amber-100 text-sm">{t('onb.managerNote')}</p>}
            {role === 'player' && <Hint text={t('onb.playerNote')} />}
          </div>
        )}

        {STEPS[step] === 'info' && (
          <form id="onb-info" onSubmit={finish} className="card flex flex-col gap-3">
            <label className="block">
              <span className="text-xs text-gray-300">{t('onb.fullName')} <span className="text-lime-400">*</span></span>
              <input className="input mt-1" required maxLength={120} value={f.full_name} onChange={set('full_name')} />
            </label>
            <label className="block">
              <span className="text-xs text-gray-300">{t('onb.phone')} <span className="text-lime-400">*</span></span>
              <input className="input mt-1" required inputMode="tel" maxLength={30} value={f.phone} onChange={set('phone')} placeholder="0912 345 678" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-300">{t('onb.birthDate')} <span className="text-lime-400">*</span></span>
                <input className="input mt-1" type="date" required max={new Date().toISOString().slice(0, 10)} value={f.birth_date || ''} onChange={set('birth_date')} />
              </label>
              <label className="block">
                <span className="text-xs text-gray-300">{t('onb.gender')}</span>
                <select className="input mt-1" value={f.gender || ''} onChange={set('gender')}>
                  <option value="">—</option>
                  <option value="male">{t('auth.g_male')}</option>
                  <option value="female">{t('auth.g_female')}</option>
                  <option value="other">{t('auth.g_other')}</option>
                </select>
              </label>
            </div>
            <div className="border-t border-navy-700 pt-3">
              <p className="text-white font-semibold text-sm">{t('onb.levels')} <Hint inline text={t('onb.levelsHint')} /></p>
              <div className="grid gap-3 sm:grid-cols-2">
                {sports.includes('pickleball') && (
                  <label className="block">
                    <span className="text-xs text-gray-300">{t('onb.levelPickleball')}</span>
                    <LevelInput sport="pickleball" className="input mt-1" value={f.dupr_level} onChange={set('dupr_level')} placeholder="3.25" />
                  </label>
                )}
              </div>
            </div>
            {error && <p className="text-red-300 text-sm">{error}</p>}
          </form>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          {step > 0 ? (
            <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)} disabled={busy}>← {t('onb.back')}</button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t('onb.next')} →</button>
          ) : (
            <button type="submit" form="onb-info" className="btn-primary" disabled={busy}>
              {busy ? t('common.loading') : role === 'manager' ? t('onb.finishManager') : t('onb.finish')}
            </button>
          )}
        </div>
      </div>
    </PlayerShell>
  );
}
