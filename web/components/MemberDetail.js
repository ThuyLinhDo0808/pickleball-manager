'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import MemberHistory from '@/components/MemberHistory';
import { useI18n } from '@/context/I18nContext';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { formatVnd, thisMonth } from '@/lib/format';

export const FLAGS = ['unpaid', 'late', 'attitude'];
export const FLAG_STYLE = {
  unpaid: 'bg-red-500/15 text-red-300 border-red-500/40',
  late: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  attitude: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
};
const PAY_STYLE = {
  paid: 'bg-lime-400 text-navy-950',
  pending: 'bg-yellow-500/20 text-yellow-300',
  overdue: 'bg-red-500/20 text-red-300',
};

function RegisterForm({ club, member, plans, onDone }) {
  const { t } = useI18n();
  const active = plans.filter((p) => p.is_active);
  const [form, setForm] = useState({ plan_id: active[0]?.id || '', start_month: thisMonth(), count: 1, amount: active[0]?.price ?? '', paid: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function pickPlan(id) {
    const plan = plans.find((p) => p.id === id);
    setForm({ ...form, plan_id: id, amount: plan?.price ?? '' });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/members/${member.id}/memberships`, {
        plan_id: form.plan_id,
        start_month: form.start_month,
        count: Number(form.count),
        amount: form.amount === '' ? null : Number(form.amount),
        status: form.paid ? 'paid' : 'pending',
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!active.length) {
    return (
      <p className="text-gray-400 text-sm">
        {t('membership.noPlans')}{' '}
        <Link href="/finance/plans" className="text-lime-400">{t('membership.createPlans')} →</Link>
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 bg-navy-900 rounded-lg p-3">
      <div className="col-span-2">
        <label className="text-xs text-gray-400">{t('membership.plan')}</label>
        <select className="input" value={form.plan_id} onChange={(e) => pickPlan(e.target.value)}>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {t(`plans.${p.period}`)} · {formatVnd(p.price)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('membership.startMonth')}</label>
        <input className="input" type="month" required value={form.start_month} onChange={(e) => setForm({ ...form, start_month: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-gray-400">{t('membership.count')}</label>
        <input className="input" type="number" inputMode="numeric" min="1" max="12" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
      </div>
      <p className="col-span-2 text-gray-500 text-xs -mt-2">{t('membership.countHint')}</p>
      <div className="col-span-2">
        <label className="text-xs text-gray-400">{t('membership.amount')}</label>
        <input className="input" type="number" inputMode="numeric" min="0" step="1000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </div>
      <label className="col-span-2 flex items-center gap-2 text-sm text-gray-200">
        <input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} />
        {t('membership.alreadyPaid')}
      </label>
      {error && <p className="col-span-2 text-red-400 text-sm">{error}</p>}
      <button className="btn-primary col-span-2" disabled={busy || !form.plan_id}>{t('membership.register')}</button>
    </form>
  );
}

// Popup with a member's internal notes and membership passes.
export default function MemberDetail({ club, member, onClose, onChanged }) {
  const { t } = useI18n();
  const open = !!member;
  const { data: plans } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}/plans`) : Promise.resolve([])), [club?.id]);
  const { data: passes, reload: reloadPasses } = useLoad(
    () => (open ? api.get(`/api/clubs/${club.id}/members/${member.id}/memberships`) : Promise.resolve([])),
    [member?.id]
  );
  const [flags, setFlags] = useState([]);
  const [notes, setNotes] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFlags(member?.flags || []);
    setNotes(member?.notes || '');
    setShowRegister(false);
  }, [member?.id]);

  if (!open) return null;

  const planName = (id) => plans?.find((p) => p.id === id)?.name || '';

  async function run(fn) {
    setBusy(true);
    try {
      await fn();
      reloadPasses();
      onChanged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  const patchMember = (body) => run(() => api.patch(`/api/clubs/${club.id}/members/${member.id}`, body));

  function toggleFlag(f) {
    const next = flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f];
    setFlags(next);
    patchMember({ flags: next });
  }

  const base = `/api/clubs/${club.id}/memberships`;

  return (
    <Modal open title={member.full_name} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="text-gray-400 text-sm flex flex-wrap gap-x-4 gap-y-1">
          <span>{member.member_type === 'fixed' ? t('members.fixed') : t('members.guest')}{member.tier && ` · ${t(`members.${member.tier}`)}`}</span>
          {member.phone && <a href={`tel:${member.phone}`} className="text-lime-400">{member.phone}</a>}
          {member.dupr_level != null && <span>DUPR {member.dupr_level}</span>}
          {member.debt > 0 && <span className="text-red-300">{t('membership.debt')}: {formatVnd(member.debt)}</span>}
        </div>

        {member.account_email && (
          <div className="flex items-center justify-between gap-3 bg-navy-900 rounded-lg px-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="text-gray-400">{t('payments.linked')}: </span>
              <span className="text-white">{member.account_email}</span>
            </span>
            <button
              type="button"
              className="text-red-400 text-xs shrink-0"
              disabled={busy}
              onClick={() => window.confirm(t('payments.unlinkConfirm', { email: member.account_email })) && patchMember({ unlink_account: true })}
            >
              {t('payments.unlink')}
            </button>
          </div>
        )}

        <section>
          <h3 className="text-white font-semibold text-sm mb-2">{t('flags.title')}</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {FLAGS.map((f) => (
              <button
                key={f}
                type="button"
                disabled={busy}
                onClick={() => toggleFlag(f)}
                className={`text-sm rounded-full border px-3 py-1 transition ${
                  flags.includes(f) ? FLAG_STYLE[f] : 'border-navy-600 text-gray-400 hover:text-gray-200'
                }`}
              >
                {flags.includes(f) ? '✓ ' : ''}
                {t(`flags.${f}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input text-sm" placeholder={t('flags.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button
              type="button"
              className="btn-secondary text-sm shrink-0"
              disabled={busy || notes === (member.notes || '')}
              onClick={() => patchMember({ notes: notes.trim() || null })}
            >
              {t('common.save')}
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white font-semibold text-sm">{t('membership.title')}</h3>
            <button type="button" className="text-lime-400 text-sm" onClick={() => setShowRegister((s) => !s)}>
              {showRegister ? t('common.cancel') : `+ ${t('membership.register')}`}
            </button>
          </div>

          {showRegister && plans && (
            <div className="mb-3">
              <RegisterForm
                club={club}
                member={member}
                plans={plans}
                onDone={() => {
                  setShowRegister(false);
                  reloadPasses();
                  onChanged();
                }}
              />
            </div>
          )}

          {(passes || []).length === 0 && !showRegister && <p className="text-gray-400 text-sm">{t('membership.none')}</p>}
          <div className="flex flex-col gap-2">
            {(passes || []).map((p) => {
              const unlimited = p.sessions_included === 0;
              return (
                <div key={p.membership_id} className="bg-navy-900 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-white text-sm font-semibold">{p.period_label}</div>
                      <div className="text-gray-400 text-xs truncate">{planName(p.plan_id)} · {formatVnd(p.amount)}</div>
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 shrink-0 font-semibold ${PAY_STYLE[p.status]}`}>
                      {t(`membership.${p.status}`)}
                    </span>
                  </div>
                  <div className="text-gray-300 text-xs mt-2">
                    {unlimited
                      ? t('membership.usedUnlimited', { used: p.sessions_used })
                      : t('membership.used', { used: p.sessions_used, total: p.sessions_included })}
                  </div>
                  {!unlimited && (
                    <div className="w-full bg-navy-800 rounded-full h-1.5 mt-1">
                      <div className="bg-lime-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, (100 * p.sessions_used) / p.sessions_included)}%` }} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
                    <button
                      disabled={busy}
                      className={p.status === 'paid' ? 'text-gray-400' : 'text-lime-400'}
                      onClick={() => run(() => api.patch(`${base}/${p.membership_id}`, { status: p.status === 'paid' ? 'pending' : 'paid' }))}
                    >
                      {p.status === 'paid' ? t('membership.markUnpaid') : t('membership.markPaid')}
                    </button>
                    <button
                      disabled={busy || (!unlimited && p.sessions_remaining <= 0)}
                      className="text-gray-300 disabled:opacity-30"
                      onClick={() => run(() => api.post(`${base}/${p.membership_id}/sessions`, {}))}
                    >
                      {t('membership.useSession')}
                    </button>
                    <button
                      disabled={busy || p.sessions_used <= 0}
                      className="text-gray-300 disabled:opacity-30"
                      onClick={() => run(() => api.del(`${base}/${p.membership_id}/sessions/last`))}
                    >
                      {t('membership.undoSession')}
                    </button>
                    <button
                      disabled={busy}
                      className="text-red-400 ml-auto"
                      onClick={() => {
                        if (window.confirm(t('membership.deleteConfirm', { label: p.period_label }))) {
                          run(() => api.del(`${base}/${p.membership_id}`));
                        }
                      }}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <MemberHistory key={member.id} club={club} member={member} />
      </div>
    </Modal>
  );
}
