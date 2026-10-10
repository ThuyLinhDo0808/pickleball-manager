'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PlayerShell from '@/components/PlayerShell';
import { ClubProfileFields, ClubImagesPicker } from '@/components/ClubProfileFields';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd } from '@/lib/format';
import { HIGHLIGHTS, suggestTier } from '@/lib/planFeatures';
import { VIETNAM } from '@/lib/regions';
import { PlanPaymentBox } from '@/components/PlanModals';

const PAID = ['basic', 'standard', 'advanced', 'pro'];
const FALLBACK_LIMITS = { basic: { clubs: 3, fixed: 16, guest: 20 }, standard: { clubs: 5, fixed: 50, guest: 100 }, advanced: { clubs: 10, fixed: 100, guest: 200 }, pro: { clubs: 20, fixed: null, guest: null } };
const FALLBACK_PRICES = { basic: 99000, standard: 199000, advanced: 349000, pro: 599000 };
const STEPS = ['club', 'plan', 'review'];
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '');
const STATUS_TONE = {
  pending: 'border-amber-300/50 bg-amber-300/5 text-amber-100',
  approved: 'border-lime-400/50 bg-lime-400/5 text-lime-200',
  rejected: 'border-red-400/50 bg-red-500/5 text-red-200',
  cancelled: 'border-navy-600 text-gray-400',
};

// One past / waiting request.
function RequestCard({ r, onCancel, onRenew, busy }) {
  const { t } = useI18n();
  const pay = r.payment;
  return (
    <div className={`rounded-2xl border p-4 ${STATUS_TONE[r.status]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-white font-bold">{r.sport === 'badminton' ? '🏸' : '🏓'} {r.name}{r.kind === 'community' && <span className="ml-2 text-[11px] rounded-full border border-amber-300/60 text-amber-200 px-2 py-0.5 align-middle">🎟 {t('creq.kind_community')}</span>}</p>
          <p className="text-gray-400 text-xs">{[r.district, r.province, r.country].filter(Boolean).join(', ')} · {t('creq.sentOn', { date: fmtDate(r.created_at) })}</p>
        </div>
        <span className="rounded-full border border-current px-2 py-0.5 text-[11px] font-bold uppercase">{t(`creq.status_${r.status}`)}</span>
      </div>
      <p className="text-sm mt-2">{t(`creq.statusHint_${r.status}`, { tier: String(r.plan_tier || '').toUpperCase() })}</p>
      {r.owner_note && <p className="text-sm mt-1 text-gray-200">💬 {t('creq.ownerNote')}: {r.owner_note}</p>}
      {/* The plan is paid with the request: transfer details until the money arrives. */}
      {r.status === 'pending' && pay?.status === 'pending' && (
        <div className="mt-3"><PlanPaymentBox payment={pay} /></div>
      )}
      {r.status === 'pending' && pay?.status === 'paid' && <p className="mt-2 text-lime-300 text-sm">✓ {t('creq.paid')}</p>}
      {r.status === 'pending' && !pay && r.payment_id === null && <p className="mt-2 text-gray-300 text-sm">ℹ️ {t('creq.planCovers', { tier: String(r.plan_tier || '').toUpperCase() })}</p>}
      {r.status === 'pending' && pay?.status === 'cancelled' && (
        <p className="mt-2 text-red-300 text-sm">
          ⚠️ {t('creq.payCancelled')}{' '}
          <button type="button" className="underline" disabled={busy} onClick={() => onRenew(r.id)}>{t('creq.payRenew')}</button>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {r.status === 'pending' && (
          <button type="button" className="btn-secondary !py-1.5 text-sm" disabled={busy} onClick={() => window.confirm(t('creq.cancelConfirm')) && onCancel(r.id)}>{t('creq.cancel')}</button>
        )}
        {r.status === 'approved' && <Link href="/home" className="btn-primary !py-1.5 text-sm">{t('creq.openClub')}</Link>}
      </div>
    </div>
  );
}

// Ask for a new club: its profile and pictures, then a plan (suggested from its size),
// then send it. The app owner checks it; the club is created once approved.
// Club or community: what the Host is about to open. Same steps after this choice.
function KindChooser({ onPick }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        ['club', '🏟', 'border-lime-400/50 hover:border-lime-400'],
        ['community', '🎟', 'border-amber-300/50 hover:border-amber-300'],
      ].map(([k, icon, tone]) => (
        <button key={k} type="button" onClick={() => onPick(k)} className={`card text-left border-2 ${tone} transition`}>
          <span className="text-3xl" aria-hidden="true">{icon}</span>
          <span className="block text-white text-lg font-bold mt-2">{t(`creq.pick_${k}`)}</span>
          <span className="block text-gray-300 text-sm mt-1">{t(`creq.pickHint_${k}`)}</span>
          <span className="block text-lime-300 text-sm font-semibold mt-3">{t('creq.pickCta')} →</span>
        </button>
      ))}
    </div>
  );
}

export default function ClubRequestPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { plan } = useWorkspace();
  const { data, loading, error, reload } = useLoad(() => (user ? api.get('/api/host/club-requests') : Promise.resolve(null)), [user?.id]);
  const { data: me } = useLoad(() => (user ? api.get('/api/host/me').catch(() => null) : Promise.resolve(null)), [user?.id]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '', sport: 'pickleball', country: VIETNAM, province: '', district: '', address: '', schedule: '', description: '', contact_email: '', member_count: '', plan_tier: '', plan_months: 1 });
  const [avatar, setAvatar] = useState(null);
  const [cover, setCover] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(null);
  const [fromOnboarding, setFromOnboarding] = useState(false);
  // First choice: a club (Club Manager) or a community (Social Manager, "cộng đồng xé vé").
  const [kind, setKind] = useState(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setFromOnboarding(q.get('from') === 'onboarding');
    if (['club', 'community'].includes(q.get('kind'))) setKind(q.get('kind'));
  }, []);
  useEffect(() => {
    if (user?.email) setForm((f) => ({ ...f, contact_email: f.contact_email || user.email }));
  }, [user?.email]);
  const sports = me?.sports?.length ? me.sports : ['pickleball', 'badminton'];
  useEffect(() => {
    if (me?.sports?.length) setForm((f) => (me.sports.includes(f.sport) ? f : { ...f, sport: me.sports[0] }));
  }, [me?.sports?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const limits = plan?.catalog?.limits || FALLBACK_LIMITS;
  const prices = plan?.prices || FALLBACK_PRICES;
  const months = plan?.month_choices || [1, 3, 6, 12];
  const suggested = useMemo(() => suggestTier(form.member_count, limits) || 'basic', [form.member_count, limits]);
  const tier = form.plan_tier || suggested;
  // Every club pays for its plan; an account already paying for a plan with room for
  // another club is covered.
  const covered = !!plan && plan.tier !== 'free' && !plan.trial && (plan.club_limit == null || plan.clubs_owned < plan.club_limit);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const items = data?.items || [];
  const waiting = items.find((r) => r.status === 'pending');

  function next(e) {
    e.preventDefault();
    setErr('');
    setStep((s) => s + 1);
  }

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      const r = await api.post('/api/host/club-requests', { ...form, kind: kind || 'club', plan_tier: tier, member_count: Number(form.member_count), avatar, cover });
      setSent(r);
      reload();
    } catch (e) {
      setErr(t(`creq.err_${e.payload?.code}`) === `creq.err_${e.payload?.code}` ? e.message : t(`creq.err_${e.payload?.code}`));
    } finally {
      setBusy(false);
    }
  }

  async function renew(id) {
    setBusy(true);
    try {
      const r = await api.post(`/api/host/club-requests/${id}/payment`, {});
      setSent(r);
      reload();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id) {
    setBusy(true);
    try {
      await api.post(`/api/host/club-requests/${id}/cancel`, {});
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <PlayerShell><p className="text-gray-400">{t('common.loading')}</p></PlayerShell>;
  if (error) return <PlayerShell><p className="card text-red-300 text-sm">{error.message}</p></PlayerShell>;

  return (
    <PlayerShell>
      <div className="mx-auto max-w-3xl">
        <p className="text-lime-400 text-xs font-bold uppercase tracking-widest">{t('creq.kicker')}</p>
        <h1 className="text-white text-2xl font-bold mt-1">{t(kind === 'community' ? 'creq.titleCommunity' : kind === 'club' ? 'creq.title' : 'creq.titlePick')}</h1>
        <p className="text-gray-400 text-sm mt-1 mb-4">{t(kind === 'community' ? 'creq.introCommunity' : kind === 'club' ? 'creq.intro' : 'creq.introPick')}</p>

        {data?.approval === false && (
          <p className="card mb-4 text-sm text-gray-300">ℹ️ {t('creq.approvalOff')} <Link href="/clubs" className="text-lime-300 underline">{t('creq.createDirect')}</Link></p>
        )}

        {sent || waiting ? (
          <div className="flex flex-col gap-3 mb-6">
            {sent && <p className="rounded-xl border border-lime-400/50 bg-lime-400/10 px-3 py-2 text-lime-200 text-sm">✓ {t('creq.sent')}</p>}
            <RequestCard r={sent && waiting && sent.id === waiting.id ? { ...waiting, ...sent } : sent || waiting} onCancel={cancel} onRenew={renew} busy={busy} />
            <div className="card text-sm text-gray-300">
              <p className="text-white font-semibold mb-1">{t('creq.nextTitle')}</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>{t('creq.next1')}</li>
                <li>{t('creq.next2Pay')}</li>
                <li>{t('creq.next3')}</li>
              </ol>
            </div>
            <Link href="/home" className="btn-secondary self-start">{t('creq.toHome')}</Link>
          </div>
        ) : (
          <>
            {fromOnboarding && <p className="rounded-xl border border-sky-400/40 bg-sky-400/5 px-3 py-2 text-sky-100 text-sm mb-4">👋 {t('creq.welcome')}</p>}
            {!kind ? (
              <KindChooser onPick={(k) => { setKind(k); setStep(0); }} />
            ) : (
            <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full border px-3 py-1 font-semibold ${kind === 'community' ? 'border-amber-300/60 bg-amber-300/10 text-amber-100' : 'border-lime-400/60 bg-lime-400/10 text-lime-100'}`}>
                {kind === 'community' ? '🎟' : '🏟'} {t(`creq.kind_${kind}`)}
              </span>
              <button type="button" className="text-gray-400 text-xs underline" onClick={() => setKind(null)}>{t('creq.kindChange')}</button>
            </div>
            <ol className="flex items-center gap-2 mb-5" aria-label={t('onb.progress')}>
              {STEPS.map((s, i) => (
                <li key={s} className="flex-1">
                  <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-lime-400' : 'bg-navy-700'}`} />
                  <span className={`block mt-1 text-[11px] ${i === step ? 'text-white font-semibold' : 'text-gray-500'}`}>{i + 1}. {t(`creq.step_${s}`)}</span>
                </li>
              ))}
            </ol>

            {step === 0 && (
              <form onSubmit={next} className="card flex flex-col gap-4">
                <ClubImagesPicker avatar={avatar} cover={cover} onAvatar={setAvatar} onCover={setCover} name={form.name} />
                <ClubProfileFields form={form} set={set} withName sports={sports} />
                <div className="flex justify-end">
                  <button className="btn-primary">{t('onb.next')} →</button>
                </div>
              </form>
            )}

            {step === 1 && (
              <form onSubmit={next} className="flex flex-col gap-3">
                <p className="rounded-xl border border-lime-400/40 bg-lime-400/5 px-3 py-2 text-sm text-lime-100">
                  💡 {t('creq.suggestion', { n: form.member_count, tier: suggested.toUpperCase() })}
                </p>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('creq.step_plan')}>
                  {PAID.map((k) => {
                    const lim = limits[k] || {};
                    const on = tier === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set('plan_tier', k)}
                        className={`relative text-left rounded-xl border p-3 ${on ? 'border-lime-400 bg-lime-400/10 ring-1 ring-lime-400' : 'border-navy-600 hover:border-navy-500'}`}
                      >
                        {k === suggested && <span className="absolute -top-2 right-2 rounded-full bg-lime-400 px-2 py-0.5 text-[10px] font-bold text-navy-950">{t('creq.suggested')}</span>}
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-white font-bold uppercase">{k}</span>
                          <span className="text-amber-200 text-xs font-semibold">{t('plan.perMonth', { price: formatVnd(prices[k]) })}</span>
                        </span>
                        <span className="block text-gray-400 text-xs mt-0.5">{t(`plan.for_${k}`)}</span>
                        <span className="block text-gray-200 text-xs mt-2">🏠 {lim.clubs == null ? t('plan.clubsUnlimited') : t('plan.clubsN', { n: lim.clubs })}</span>
                        <span className="block text-gray-200 text-xs">👥 {lim.fixed == null ? t('plan.membersUnlimited') : t('plan.membersN', { fixed: lim.fixed, guest: lim.guest })}</span>
                        {(HIGHLIGHTS[k] || []).slice(0, 4).map((h) => <span key={h} className="block text-gray-400 text-xs">✓ {t(`plan.${h}`)}</span>)}
                        {lim.fixed != null && Number(form.member_count) > lim.fixed && <span className="block text-amber-300 text-[11px] mt-1">⚠ {t('creq.tooSmall', { n: lim.fixed })}</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="card">
                  <p className="text-white text-sm font-semibold mb-2">{t('creq.months')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {months.map((m) => (
                      <button key={m} type="button" onClick={() => set('plan_months', m)} className={`rounded-lg px-3 py-1.5 text-sm border ${form.plan_months === m ? 'border-lime-400 bg-lime-400 text-navy-950 font-bold' : 'border-navy-600 text-gray-200'}`}>
                        {t('plan.nMonths', { n: m })}
                      </button>
                    ))}
                  </div>
                  <p className="text-gray-300 text-sm mt-2">{t('plan.total')}: <b className="text-white">{formatVnd(prices[tier] * form.plan_months)}</b></p>
                </div>
                <p className={`rounded-xl border px-3 py-2 text-sm ${covered ? 'border-lime-400/50 bg-lime-400/10 text-lime-100' : 'border-amber-300/50 bg-amber-300/10 text-amber-100'}`}>
                  {covered ? `✓ ${t('creq.coveredNote', { tier: String(plan.tier).toUpperCase() })}` : `💳 ${t('creq.payNote')}`}
                </p>
                <p className="text-gray-500 text-xs">{t('creq.approvalNote')}</p>
                <div className="flex justify-between">
                  <button type="button" className="btn-secondary" onClick={() => setStep(0)}>← {t('onb.back')}</button>
                  <button className="btn-primary">{t('onb.next')} →</button>
                </div>
              </form>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-3">
                <div className="card">
                  <ClubImagesPicker avatar={avatar} cover={cover} onAvatar={setAvatar} onCover={setCover} name={form.name} />
                  <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
                    {[
                      ['creq.name', form.name],
                      ['creq.sport', t(`onb.sport_${form.sport}`)],
                      ['creq.memberCount', form.member_count],
                      ['creq.address', form.address],
                      ['creq.where', [form.district, form.province, form.country].filter(Boolean).join(', ')],
                      ['creq.schedule', form.schedule || '—'],
                      ['creq.contactEmail', form.contact_email],
                      ['creq.description', form.description || '—'],
                      ['creq.planPicked', covered ? `${String(plan.tier).toUpperCase()} · ${t('creq.covered')}` : `${tier.toUpperCase()} · ${t('plan.nMonths', { n: form.plan_months })} · ${formatVnd(prices[tier] * form.plan_months)}`],
                    ].map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-gray-400">{t(k)}</dt>
                        <dd className="text-white break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <p className="text-gray-400 text-xs">{t('creq.reviewNote')}</p>
                {err && <p className="text-red-300 text-sm">{err}</p>}
                <div className="flex justify-between">
                  <button type="button" className="btn-secondary" onClick={() => setStep(1)} disabled={busy}>← {t('onb.back')}</button>
                  <button type="button" className="btn-primary" onClick={submit} disabled={busy}>{busy ? t('common.loading') : covered ? `📨 ${t('creq.submit')}` : `💳 ${t('creq.submitPay')}`}</button>
                </div>
              </div>
            )}
            </>
            )}
          </>
        )}

        {items.filter((r) => r.id !== (sent || waiting)?.id).length > 0 && (
          <section className="mt-8">
            <h2 className="text-white font-semibold mb-2">{t('creq.history')}</h2>
            <div className="flex flex-col gap-2">
              {items.filter((r) => r.id !== (sent || waiting)?.id).map((r) => <RequestCard key={r.id} r={r} onCancel={cancel} onRenew={renew} busy={busy} />)}
            </div>
          </section>
        )}
      </div>
    </PlayerShell>
  );
}
