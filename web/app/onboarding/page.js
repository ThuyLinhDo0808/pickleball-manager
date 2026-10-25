'use client';
import { peekReturn } from '@/lib/returnTo';
import { useEffect, useState } from 'react';
import { clearDraft, readDraft, useDraft } from '@/lib/draft';
import { useRouter } from 'next/navigation';
import PlayerShell from '@/components/PlayerShell';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import Hint from '@/components/ui/Hint';
import DateInput from '@/components/ui/DateInput';
import DuprIdGuide from '@/components/DuprIdGuide';
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
  // What is typed (and the step reached) is kept on this device until it is sent (lib/draft).
  const draftKey = user?.id ? `pb_onb_draft_${user.id}` : null;
  const [step, setStep] = useDraft(draftKey && `${draftKey}_step`, 0);
  const sports = ['pickleball'];
  const [role, setRole] = useDraft(draftKey && `${draftKey}_role`, 'player');
  const [f, setF] = useDraft(draftKey, { full_name: '', phone: '', gender: '', birth_date: '', dupr_id: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Start from what is already known (sign-up details, an older player profile).
  useEffect(() => {
    if (!user) return;
    Promise.all([api.get('/api/host/me').catch(() => null), api.get('/api/player/me').catch(() => null)]).then(([me, pm]) => {
      const p = pm?.profile || {};
      if (me?.account_role && !readDraft(`${draftKey}_role`)) setRole(me.account_role);
      // What the player already typed here wins over what was known before.
      setF((x) => ({
        ...x,
        full_name: x.full_name || p.full_name || '',
        phone: x.phone || p.phone || '',
        gender: x.gender || p.gender || me?.gender || '',
        birth_date: x.birth_date || p.birth_date || me?.birth_date || '',
        dupr_id: x.dupr_id || p.dupr_id || me?.signup_dupr_id || '',
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
      await api.post('/api/player/onboarding', { sports, role, ...f, gender: f.gender || null, dupr_id: f.dupr_id || null });
      [draftKey, `${draftKey}_step`, `${draftKey}_role`].forEach(clearDraft);
      // Came from a link (club invite, kèo…): back to it; else managers go on to ask for
      // their club / community.
      const next = new URLSearchParams(window.location.search).get('next') || '';
      const safe = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/onboarding') ? next : null;
      router.replace(safe || peekReturn() || (role === 'manager' ? '/club-request?from=onboarding' : '/home'));
    } catch (err) {
      setError(err.payload?.code === 'birth_date_required' ? t('onb.errBirth') : err.payload?.code === 'bad_dupr_id' ? t('onb.errDuprId') : err.message);
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
              <span className="block mt-1 text-sm text-gray-400">{t('onb.fullNameNote')}</span>
            </label>
            <label className="block">
              <span className="text-xs text-gray-300">{t('onb.phone')} <span className="text-lime-400">*</span></span>
              <input className="input mt-1" required inputMode="tel" maxLength={30} value={f.phone} onChange={set('phone')} placeholder="0912 345 678" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-gray-300">{t('onb.birthDate')} <span className="text-lime-400">*</span></span>
                <DateInput className="input mt-1" required min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={f.birth_date || ''} onChange={set('birth_date')} />
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
            {/* DUPR ID (optional): the club links the verified DUPR rating with it. No
                self-rated level here — the rating comes from DUPR. */}
            <label className="block border-t border-navy-700 pt-3">
              <span className="text-xs text-gray-300">{t('onb.duprId')}</span>
              <input className="input mt-1 font-mono uppercase placeholder:normal-case" maxLength={10} autoComplete="off" value={f.dupr_id} onChange={(e) => setF((x) => ({ ...x, dupr_id: e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase() }))} placeholder={t('onb.duprIdPh')} />
            </label>
            <p className="-mt-1 text-sm text-gray-400">
              {t('onb.duprIdNote')} <DuprIdGuide />
            </p>
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
            // Separate keys: reusing one button that turns into "submit" during the click would
            // send the form at once and skip the info step.
            <button key="next" type="button" className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t('onb.next')} →</button>
          ) : (
            <button key="finish" type="submit" form="onb-info" className="btn-primary" disabled={busy}>
              {busy ? t('common.loading') : role === 'manager' ? t('onb.finishManager') : t('onb.finish')}
            </button>
          )}
        </div>
      </div>
    </PlayerShell>
  );
}
