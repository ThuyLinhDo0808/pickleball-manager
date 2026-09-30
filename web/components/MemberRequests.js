'use client';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// Accounts that said "I'm a member of this club" when signing up for an event.
// Approving lets them register as members (use their pass, no fee); rejecting
// removes a new join request, or unlinks the account from the member it matched by phone.
export default function MemberRequests({ club, requests, onChanged }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  async function act(m, action) {
    const name = m.account_name || m.full_name;
    if (action === 'reject' && !window.confirm(t('requests.rejectAsk', { name }))) return;
    setBusy(m.id);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/members/${m.id}/${action}`, {});
      window.dispatchEvent(new Event('member-requests-changed'));
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (!requests.length) {
    return (
      <div className="card text-sm text-gray-400">
        {t('requests.empty')}
        <p className="text-gray-500 text-xs mt-1">{t('requests.hint')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-gray-500 text-xs">{t('requests.hint')}</p>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {requests.map((m) => {
        const facts = [
          m.gender && t(`members.${m.gender}`),
          m.birth_year,
          m.dupr_level != null && `DUPR ${m.dupr_level}`,
        ].filter(Boolean);
        return (
          <div key={m.id} className="card !py-3">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <div className="flex-1 min-w-[12rem]">
                <p className="text-white font-semibold">
                  {m.account_name || m.full_name}
                  <span className={`ml-2 align-middle text-[10px] leading-4 rounded border px-1 ${m.join_requested ? 'border-sky-400/60 text-sky-300' : 'border-yellow-400/60 text-yellow-300'}`}>
                    {m.join_requested ? t('requests.newJoin') : t('requests.phoneMatch')}
                  </span>
                </p>
                <p className="text-gray-400 text-sm break-all">
                  {[m.account_email, m.account_phone || m.phone].filter(Boolean).join(' · ') || '—'}
                </p>
                {!m.join_requested && (
                  <p className="text-gray-300 text-xs mt-0.5">{t('requests.matches', { name: m.full_name })}</p>
                )}
                {facts.length > 0 && <p className="text-gray-500 text-xs mt-0.5">{facts.join(' · ')}</p>}
                <p className="text-gray-600 text-xs mt-0.5">{t('requests.since', { date: new Date(m.created_at).toLocaleDateString() })}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                <button className="btn-primary !py-1.5 text-sm" disabled={busy === m.id} onClick={() => act(m, 'approve')}>
                  ✓ {t('requests.approve')}
                </button>
                <button
                  className="rounded-lg px-3 py-1.5 text-sm border border-red-500/60 text-red-400 hover:bg-red-500/10"
                  disabled={busy === m.id}
                  onClick={() => act(m, 'reject')}
                >
                  ✕ {t('requests.reject')}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
