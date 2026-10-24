'use client';
import { levelTag } from '@/lib/levels';
import { useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/useLoad';
import { PastWarning } from '@/components/MemberModeration';
import { localDate } from '@/lib/dates';
import Hint from '@/components/ui/Hint';

// Danh sách chờ: guests who asked to join the fixed team in the after-session survey, "I'm a
// member" requests from the event page, and accounts that matched a member by phone.
// For join requests the Host picks the type (fixed by default, with a tier) when approving.
// Declining a guest's request keeps them as a guest; a new request is removed; a phone
// link is undone.
const SOURCE_STYLE = {
  survey: 'border-lime-400/60 text-lime-300',
  request: 'border-sky-400/60 text-sky-300',
  link: 'border-yellow-400/60 text-yellow-300',
  search: 'border-navy-600 text-gray-200',
  invite: 'border-emerald-400/60 text-emerald-300',
  manual: 'border-gray-400/60 text-gray-300',
};

// A request from someone the Host already typed in (no phone match): merge the request into
// that member, so one person stays one row (history, passes and the account together).
// What the Host picks here is also used by "Duyệt": approving merges and approves in one step.
function MergeBox({ club, m, members, guests = [], busy, onMerge, onMergeGuest, sel = {}, setSel }) {
  const { t, lang } = useI18n();
  const other = sel.other || '';
  const guest = sel.guest || '';
  const setOther = (v) => setSel({ ...sel, other: v });
  const setGuest = (v) => setSel({ ...sel, guest: v });
  const free = members.filter((x) => !x.user_id && !x.join_requested && x.id !== m.id);
  if (!m.user_id || m.account_verified || (!m.matches?.length && !free.length && !guests.length)) return null;
  const name = m.account_name || m.full_name;
  const merge = (target) => window.confirm(t('requests.mergeAsk', { name, member: target.full_name })) && onMerge(m, target.id);
  return (
    <div className="mt-2 rounded-lg border border-sky-400/30 bg-sky-400/5 px-3 py-2 text-sm">
      {m.matches?.length > 0 && (
        <>
          <p className="text-sky-200">{t('requests.maybeMember')}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {m.matches.map((x) => (
              <button key={x.id} type="button" disabled={busy} onClick={() => merge(x)} className="rounded-full border border-sky-400/50 px-3 py-1 text-xs text-sky-100 hover:bg-sky-400/10">
                {x.full_name}
                {x.birth_year ? ` · ${x.birth_year}` : ''} → {t('requests.mergeBtn')}
              </button>
            ))}
          </div>
        </>
      )}
      {free.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className="input !w-auto !py-1 text-xs" value={other} onChange={(e) => setOther(e.target.value)} aria-label={t('requests.mergeOther')}>
            <option value="">{t('requests.mergeOther')}</option>
            {free.map((x) => (
              <option key={x.id} value={x.id}>
                {x.full_name}
                {x.birth_year ? ` (${x.birth_year})` : ''}
              </option>
            ))}
          </select>
          <button type="button" className="text-xs font-semibold text-sky-200 underline disabled:opacity-40" disabled={busy || !other} onClick={() => merge(free.find((x) => x.id === other))}>
            {t('requests.mergeBtn')}
          </button>
        </div>
      )}
      {/* Played before without an account (đặt nhanh / Host thêm): their kèo, matches and
          scores go to this account, under the account's name. */}
      {guests.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className="input !w-auto max-w-full !py-1 text-xs" value={guest} onChange={(e) => setGuest(e.target.value)} aria-label={t('requests.mergeGuest')}>
            <option value="">{t('requests.mergeGuest')}</option>
            {guests.map((g) => (
              <option key={g.key} value={g.key}>
                {g.full_name}{g.dupr_id ? ` · ${g.dupr_id}` : ''} · {t('requests.guestKeo', { n: g.count, date: g.last_date ? localDate(`${g.last_date}T00:00:00`, lang === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit' }) : '' })}
              </option>
            ))}
          </select>
          <button type="button" className="text-xs font-semibold text-sky-200 underline disabled:opacity-40 min-h-[2.75rem]" disabled={busy || !guest} onClick={() => { const g = guests.find((x) => x.key === guest); if (g && window.confirm(t('requests.mergeGuestAsk', { name, guest: g.full_name, n: g.count }))) onMergeGuest(m, g.ids); }}>
            {t('requests.mergeBtn')}
          </button>
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-gray-400">{t('requests.mergeHint')}</p>
      {(other || guest) && <p className="mt-1 text-[11px] text-lime-200">{t('requests.approveMergesHint')}</p>}
      {guests.length > 0 && <p className="mt-1 text-[11px] text-gray-400">{t('requests.mergeGuestHint')}</p>}
    </div>
  );
}

export default function MemberRequests({ club, requests, members = [], onChanged }) {
  const { t, sport } = useI18n();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState({}); // id -> { member_type, tier }
  const [mergeSel, setMergeSel] = useState({}); // id -> { other: member id, guest: guest key }

  async function act(m, action) {
    const name = m.account_name || m.full_name;
    const ask = m.source === 'survey' ? 'requests.declineGuestAsk' : 'requests.rejectAsk';
    if (action === 'reject' && !window.confirm(t(ask, { name }))) return;
    // A merge picked in the box above goes with the approval (one click, one confirmation).
    const plan = approvePlan(m);
    if (action === 'approve' && plan.ask && !window.confirm(plan.ask)) return;
    setBusy(m.id);
    setError('');
    try {
      const pick = choice[m.id] || { member_type: '', tier: '' };
      // A new member needs a type; until the Host picks one they stay in the waiting list.
      const body = action === 'approve' && m.join_requested ? { member_type: pick.member_type, tier: pick.tier || null } : {};
      if (action === 'approve') Object.assign(body, plan.body);
      const r = await api.post(`/api/clubs/${club.id}/members/${m.id}/${action}`, body);
      if (r?.merge_error) setError(r.merge_error);
      else if (plan.guest) window.alert(t('requests.mergeGuestDone', { n: r?.adopted ?? plan.guest.ids.length }));
      if (plan.guest) reloadGuests();
      setMergeSel((s) => ({ ...s, [m.id]: {} }));
      window.dispatchEvent(new Event('member-requests-changed'));
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  // Past kèo players without an account (đặt nhanh / Host thêm), to merge a request into.
  const { data: guests, reload: reloadGuests } = useLoad(() => api.get(`/api/clubs/${club.id}/merge-guests`).catch(() => []), [club.id]);

  // Merge picked for this request: into a member (that is the approval) and/or a past player.
  function approvePlan(m) {
    const sel = mergeSel[m.id] || {};
    const name = m.account_name || m.full_name;
    const target = sel.other ? members.find((x) => x.id === sel.other) : null;
    if (target) return { body: { merge_into: target.id }, target, ask: t('requests.approveMergeMemberAsk', { name, member: target.full_name }) };
    const guest = sel.guest ? (guests || []).find((g) => g.key === sel.guest) : null;
    if (guest) return { body: { merge_guest_ids: guest.ids }, guest, ask: t('requests.approveMergeGuestAsk', { name, guest: guest.full_name, n: guest.count }) };
    return { body: {} };
  }
  async function mergeGuest(m, ids) {
    setBusy(m.id);
    setError('');
    try {
      const r = await api.post(`/api/clubs/${club.id}/members/${m.id}/merge-guests`, { ids });
      window.alert(t('requests.mergeGuestDone', { n: r.adopted ?? ids.length }));
      reloadGuests();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function merge(m, into) {
    setBusy(m.id);
    setError('');
    try {
      await api.post(`/api/clubs/${club.id}/members/${m.id}/merge`, { into });
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
        <Hint text={t('requests.hint')} className="mt-1" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Hint text={t('requests.hint')} />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {requests.map((m) => {
        const facts = [
          m.gender && t(`members.${m.gender}`),
          m.birth_date ? m.birth_date.split('-').reverse().join('/') : m.birth_year,
          m.dupr_level != null && levelTag(m.dupr_level, sport, t),
        ].filter(Boolean);
        const source = m.source || (m.join_requested ? 'request' : 'link');
        const pick = choice[m.id] || { member_type: '', tier: '' };
        const setPick = (patch) => setChoice((c) => ({ ...c, [m.id]: { ...pick, ...patch } }));
        // Merging into a member the Host already had keeps that member's type: no type needed.
        const intoMember = !!mergeSel[m.id]?.other;
        const needType = m.join_requested && !pick.member_type && !intoMember;
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
                {/* Removed / reviewed here before (kept when the club changes manager). */}
                <PastWarning past={m.past} />
                <MergeBox club={club} m={m} members={members} guests={guests || []} busy={busy === m.id} onMerge={merge} onMergeGuest={mergeGuest} sel={mergeSel[m.id]} setSel={(v) => setMergeSel((s) => ({ ...s, [m.id]: v }))} />
                <p className="text-gray-600 text-xs mt-0.5">{t('requests.since', { date: localDate(new Date(m.join_requested_at || m.created_at), 'vi-VN') })}</p>
              </div>
              {m.join_requested && (
                <div className="flex flex-wrap items-end gap-2 w-full sm:w-auto">
                  <label className="text-xs text-gray-400 flex flex-col gap-0.5">
                    {t('members.type')}
                    <select className="input !py-1 text-sm" value={pick.member_type} onChange={(e) => setPick({ member_type: e.target.value, tier: e.target.value === 'fixed' ? pick.tier : '' })}>
                      <option value="">--- {t('requests.pickType')}</option>
                      <option value="fixed">{t('members.fixed')}</option>
                      <option value="guest">{t('members.guest')}</option>
                      {/* Communities: "Người mới" = first 30 days, then moved by how often they play. */}
                      {club?.kind === 'community' && <option value="new">{t('requests.typeNew')}</option>}
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
                <button className="btn-primary !py-1.5 text-sm" disabled={busy === m.id || needType} title={needType ? t('requests.pickTypeHint') : undefined} onClick={() => act(m, 'approve')}>
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
