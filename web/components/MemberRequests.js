'use client';
import { levelTag } from '@/lib/levels';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';

// DS chờ: guests who asked to join the fixed team in the after-session survey, "I'm a
// member" requests from the event page, and accounts that matched a member by phone.
// For join requests the Host picks the type (fixed by default, with a tier) when approving.
// Declining a guest's request keeps them as a guest; a new request is removed; a phone
// link is undone.
const SOURCE_STYLE = {
  survey: 'border-lime-400/60 text-lime-300',
  request: 'border-sky-400/60 text-sky-300',
  link: 'border-yellow-400/60 text-yellow-300',
};

export default function MemberRequests({ club, requests, onChanged }) {
  const { t, sport } = useI18n();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState({}); // id -> { member_type, tier }

  async function act(m, action) {
    const name = m.account_name || m.full_name;
    const ask = m.source === 'survey' ? 'requests.declineGuestAsk' : 'requests.rejectAsk';
    if (action === 'reject' && !window.confirm(t(ask, { name }))) return;
    setBusy(m.id);
    setError('');
    try {
      const pick = choice[m.id] || { member_type: 'fixed', tier: '' };
      const body = action === 'approve' && m.join_requested ? { member_type: pick.member_type, tier: pick.tier || null } : {};
      await api.post(`/api/clubs/${club.id}/members/${m.id}/${action}`, body);
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
          m.birth_date ? m.birth_date.split('-').reverse().join('/') : m.birth_year,
          m.dupr_level != null && levelTag(m.dupr_level, sport, t),
        ].filter(Boolean);
        const source = m.source || (m.join_requested ? 'request' : 'link');
        const pick = choice[m.id] || { member_type: 'fixed', tier: '' };
        const setPick = (patch) => setChoice((c) => ({ ...c, [m.id]: { ...pick, ...patch } }));
        return (
          <div key={m.id} className="card !py-3">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <div className="flex-1 min-w-[12rem]">
                <p className="text-white font-semibold">
                  {m.account_name || m.full_name}
                  <span className={`ml-2 align-middle text-[10px] leading-4 rounded border px-1 ${SOURCE_STYLE[source]}`}>
                    {t(`requests.source_${source}`)}
                  </span>
                </p>
                <p className="text-gray-400 text-sm break-all">
                  {[m.account_email, m.account_phone || m.phone].filter(Boolean).join(' · ') || '—'}
                </p>
                {!m.join_requested && (
                  <p className="text-gray-300 text-xs mt-0.5">{t('requests.matches', { name: m.full_name })}</p>
                )}
                {facts.length > 0 && <p className="text-gray-500 text-xs mt-0.5">{facts.join(' · ')}</p>}
                {m.join_note && <p className="text-gray-200 text-sm mt-1 rounded bg-navy-900 px-2 py-1">“{m.join_note}”</p>}
                <p className="text-gray-600 text-xs mt-0.5">{t('requests.since', { date: new Date(m.join_requested_at || m.created_at).toLocaleDateString('vi-VN') })}</p>
              </div>
              {m.join_requested && (
                <div className="flex flex-wrap items-end gap-2 w-full sm:w-auto">
                  <label className="text-xs text-gray-400 flex flex-col gap-0.5">
                    {t('members.type')}
                    <select className="input !py-1 text-sm" value={pick.member_type} onChange={(e) => setPick({ member_type: e.target.value, tier: e.target.value === 'fixed' ? pick.tier : '' })}>
                      <option value="fixed">{t('members.fixed')}</option>
                      <option value="guest">{t('members.guest')}</option>
                    </select>
                  </label>
                  <label className="text-xs text-gray-400 flex flex-col gap-0.5">
                    {t('members.tier')}
                    <select className="input !py-1 text-sm" disabled={pick.member_type !== 'fixed'} value={pick.tier} onChange={(e) => setPick({ tier: e.target.value })}>
                      <option value="">—</option>
                      <option value="vip">{t('members.vip')}</option>
                      <option value="standard">{t('members.standard')}</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                <button className="btn-primary !py-1.5 text-sm" disabled={busy === m.id} onClick={() => act(m, 'approve')}>
                  ✓ {t('requests.approve')}
                </button>
                <button
                  className="rounded-lg px-3 py-1.5 text-sm border border-red-500/60 text-red-400 hover:bg-red-500/10"
                  disabled={busy === m.id}
                  onClick={() => act(m, 'reject')}
                >
                  ✕ {t(source === 'survey' ? 'requests.decline' : 'requests.reject')}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
