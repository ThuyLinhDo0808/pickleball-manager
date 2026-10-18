'use client';
import Link from 'next/link';
import { levelText } from '@/lib/levels';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import MemberDetail, { FLAG_STYLE } from '@/components/MemberDetail';
import MemberRequests from '@/components/MemberRequests';
import { GuestPerkBadge, GuestNoteCell, GuestPerkSettings } from '@/components/GuestColumns';
import VipBadge from '@/components/VipBadge';
import { playDurationText } from '@/components/MemberExtras';
import { Avatar } from '@/components/PlayerChip';
import PageHeader from '@/components/ui/PageHeader';
import StatTile from '@/components/ui/StatTile';
import KpiRow from '@/components/ui/KpiRow';
import Segmented from '@/components/ui/Segmented';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import { useI18n } from '@/context/I18nContext';
import { useDefaultClub } from '@/lib/useDefaultClub';
import { useLoad } from '@/lib/useLoad';
import { api } from '@/lib/api';
import { dmy, isBirthdayMonth, missingInfo, my, tenureLabel } from '@/lib/memberDates';
import { ReviewModal, ReviewTab, InviteModal } from '@/components/MemberModeration';
import { exportMembers } from '@/lib/exportExcel';
import DuprMembers from '@/components/DuprMembers';
import { planFor, hasFeature, lockedNotice } from '@/lib/planFeatures';
import { useWorkspace } from '@/context/WorkspaceContext';
import CommunitySuggestions from '@/components/CommunitySuggestions';


// Each tab of the members section has its own address (menu Thành viên ▸ …).
const PLACE_PILL = {
  fixed: 'border-lime-400/50 text-lime-200',
  guest: 'border-sky-400/50 text-sky-200',
  waiting: 'border-yellow-400/50 text-yellow-200',
  review: 'border-red-400/60 text-red-200',
};

export const MEMBER_ROUTES = { all: '/club/members/all', fixed: '/club/members', guest: '/club/members/guests', review: '/club/members/review', waiting: '/club/members/requests', dupr: '/club/members/dupr' };

export default function MembersPage({ tab = 'fixed' }) {
  const router = useRouter();
  const { t, sport } = useI18n();
  const { club } = useDefaultClub();
  // A community's control panel: its levels (trình độ) show as a column here.
  const isCommunity = club?.kind === 'community';
  const { data: cs } = useLoad(() => (club && isCommunity ? api.get(`/api/clubs/${club.id}/community-settings`).catch(() => null) : Promise.resolve(null)), [club?.id, isCommunity]);
  const levelCfg = cs?.ready && cs.settings?.levels?.mode !== 'none' ? cs.settings.levels : null;
  const { data: members, loading, reload } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/members`) : Promise.resolve([])),
    [club?.id]
  );
  // Official / guest places on the club's plan (GET /api/clubs/:id -> member_room).
  const { data: clubInfo } = useLoad(() => (club ? api.get(`/api/clubs/${club.id}`).catch(() => null) : Promise.resolve(null)), [club?.id, members?.length]);
  const room = clubInfo?.member_room;
  // A community (Social Manager) has one limit for official + guest together.
  const placeText = (r) => {
    const x = room?.kind === 'community' ? room.total : r;
    return x && x.limit != null ? t(room?.kind === 'community' ? 'plan.placesTotal' : 'plan.places', { used: x.used, limit: x.limit }) : null;
  };
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [gender, setGender] = useState('all');
  const [sortBy, setSortBy] = useState('default');
  const [showInactive, setShowInactive] = useState(true);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  // Communities: VIP (a pack with sessions left) / ưu tiên; clubs: VIP / thường.
  const [vipF, setVipF] = useState('all');
  const [reviewing, setReviewing] = useState(null); // member being moved to review
  const [inviteOpen, setInviteOpen] = useState(false);
  const { plan } = useWorkspace();
  const { data: requests, reload: reloadRequests } = useLoad(
    () => (club ? api.get(`/api/clubs/${club.id}/member-requests`).catch(() => []) : Promise.resolve([])),
    [club?.id]
  );
  const pending = requests || [];

  // New join requests ("I'm a member", no match) only live in Danh sách chờ until approved. Guests who
  // asked to join from the survey stay in the guest tab meanwhile (they did play).
  // Members under review ("Xem xét thêm") have their own tab.
  const reviewRows = (members || []).filter((m) => m.review_started_at);
  const all = (members || []).filter((m) => !m.review_started_at && !(m.join_requested && !m.account_verified && m.member_type === 'fixed'));
  const fixedRows = all.filter((m) => m.member_type === 'fixed');
  const guestRows = all.filter((m) => m.member_type !== 'fixed');
  // Tabs: fixed members, guests, to review, waiting list. Editing a member's type moves them across.
  // Where each person is: fixed / guest / Danh sách chờ / Danh sách đen.
  const waitingIds = new Set(pending.map((r) => r.id));
  const placeOf = (m) => (m.review_started_at ? 'review' : waitingIds.has(m.id) || (m.join_requested && !m.account_verified && m.member_type === 'fixed') ? 'waiting' : m.member_type === 'fixed' ? 'fixed' : 'guest');
  // "Tổng quan": everyone in one table, wherever they are.
  const everyone = (members || []).slice().sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));
  const rows = tab === 'fixed' ? fixedRows : tab === 'guest' ? guestRows : tab === 'review' ? reviewRows : tab === 'all' ? everyone : [];
  const isVip = (m) => (isCommunity ? m.membership_state === 'active' : m.vip_stars > 0 || m.tier === 'vip');
  const vipFilters = isCommunity ? ['all', 'vip', 'priority'] : ['all', 'vip', 'standard'];
  const vipOk = (m) => vipF === 'all' || (vipF === 'vip' ? isVip(m) : vipF === 'priority' ? !!m.guest_perk : !isVip(m));
  const canManage = !club?.role || ['owner', 'co_admin'].includes(club.role);

  // Everyone in the club with their details, in one Excel sheet.
  function exportAll() {
    if (!hasFeature(planFor(club, plan), 'excel_export')) return lockedNotice('excel_export');
    const order = { fixed: 0, guest: 1, review: 2, waiting: 3 };
    const list = (members || []).map((m) => ({ ...m, place: placeOf(m) })).sort((a, b) => order[a.place] - order[b.place] || a.full_name.localeCompare(b.full_name, 'vi'));
    exportMembers(club, list, t, (v) => levelText(v, sport, t));
  }
  const isGuestTab = tab === 'guest';
  const detailMember = (members || []).find((m) => m.id === detailId) || null;

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function deleteSelected() {
    const names = all.filter((m) => selected.includes(m.id)).map((m) => m.full_name).join(', ');
    if (!window.confirm(t('members.deleteConfirm', { count: selected.length, names }))) return;
    setBusy(true);
    try {
      await Promise.all(selected.map((id) => api.del(`/api/clubs/${club.id}/members/${id}`)));
      setSelected([]);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
      reload();
    }
  }

  // Search + filters + sort over the current tab.
  const q = query.trim().toLowerCase();
  const shownRows = rows
    .filter((m) => (gender === 'all' ? true : m.gender === gender))
    .filter((m) => showInactive || m.is_active)
    .filter((m) => !onlyIncomplete || missingInfo(m).length > 0)
    .filter(vipOk)
    .filter((m) => !q || [m.full_name, m.phone, m.district].some((v) => String(v || '').toLowerCase().includes(q)));
  if (sortBy === 'name') shownRows.sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));
  if (sortBy === 'level') shownRows.sort((a, b) => (Number(b.dupr_level) || 0) - (Number(a.dupr_level) || 0));
  if (sortBy === 'joined') shownRows.sort((a, b) => (a.joined_on || '9999').localeCompare(b.joined_on || '9999'));
  const inactiveCount = rows.filter((m) => !m.is_active).length;
  // Official members still missing a birthday / phone / gender (added quickly, to fill in later).
  const incomplete = fixedRows.filter((m) => missingInfo(m).length > 0);
  const missText = (m) => missingInfo(m).map((k) => t(`members.miss_${k}`)).join(', ');
  // A missing detail is flagged in its own column (not next to the name).
  const miss = (m, k) => (missingInfo(m).includes(k) ? <span className="text-[11px] rounded border border-amber-400/50 bg-amber-400/5 text-amber-300 px-1.5 py-0.5 whitespace-nowrap">⚠ {t('members.missCell')}</span> : '—');
  // Operations staff don't get phone numbers (GET members leaves them out).
  const showPhone = rows.some((m) => 'phone' in m);
  const bdays = all.filter((m) => m.is_active && isBirthdayMonth(m.birth_date)).sort((a, b) => a.birth_date.slice(8).localeCompare(b.birth_date.slice(8)));
  const activeFixed = fixedRows.filter((m) => m.is_active);
  const vipCount = activeFixed.filter((m) => m.vip_stars > 0).length;
  const shownSelected = shownRows.length > 0 && shownRows.every((m) => selected.includes(m.id));
  const openMember = (m, edit) => {
    setEditing(edit);
    setDetailId(m.id);
  };
  const pickTab = (k) => {
    setSelected([]);
    if (k !== tab) router.push(MEMBER_ROUTES[k]);
  };

  return (
    <AppShell>
      <PageHeader
        icon="👥"
        title={t('nav.members')}
        subtitle={club?.name}
        actions={
          // Members come in with their own account only (invite link / join request → Danh sách chờ),
          // so there is no manual add or Excel import: one person, one record.
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary text-sm" disabled={!club || !members?.length} onClick={exportAll}>⬇ {t('common.exportExcel')}</button>
            {canManage && (
              <>
                {isCommunity && <Link href="/club/community-settings" className="btn-secondary text-sm">🎛 {t('cpanel.short')}</Link>}
                <button className="btn-primary text-sm" disabled={!club} onClick={() => setInviteOpen(true)}>🔗 {t('invite.button')}</button>
              </>
            )}
          </div>
        }
      />

      <KpiRow cols={5}>
        <StatTile icon="🏠" label={t('requests.tabFixed')} value={fixedRows.length} sub={placeText(room?.fixed) || t('memx.activeN', { n: activeFixed.length })} onClick={() => pickTab('fixed')} active={tab === 'fixed'} />
        <StatTile icon="⭐" label="VIP" value={vipCount} tone="text-amber-300" sub={t('memx.vipSub')} />
        <StatTile icon="🤝" label={t('requests.tabGuest')} value={guestRows.length} tone="text-sky-300" sub={placeText(room?.guest) || t('memx.priorityN', { n: guestRows.filter((m) => m.guest_perk).length })} onClick={() => pickTab('guest')} active={tab === 'guest'} />
        <StatTile icon="📝" label={t('memx.waiting')} value={pending.length} tone={pending.length ? 'text-yellow-300' : 'text-white'} sub={pending.length ? t('memx.needReview') : t('memx.nothing')} onClick={() => pickTab('waiting')} active={tab === 'waiting'} />
        <StatTile icon="🎂" label={t('memx.birthdays')} value={bdays.length} tone="text-pink-300" sub={bdays.slice(0, 2).map((m) => `${m.full_name.split(' ').pop()} ${m.birth_date.slice(8, 10)}/${m.birth_date.slice(5, 7)}`).join(', ') || '—'} />
      </KpiRow>
      {isCommunity && <CommunitySuggestions club={club} onChanged={reload} />}

      <UnderlineTabs
        value={tab}
        onChange={pickTab}
        tabs={[
          { key: 'all', label: t('nav.memAll'), icon: '📋', count: everyone.length },
          { key: 'fixed', label: t('requests.tabFixed'), icon: '🏠', count: fixedRows.length },
          { key: 'guest', label: t('requests.tabGuest'), icon: '🤝', count: guestRows.length },
          { key: 'waiting', label: t('nav.memRequests'), icon: '📝', alert: pending.length },
          { key: 'review', label: t('mod.tab'), icon: '⛔', count: reviewRows.length },
          // DUPR (pickleball): members' DUPR IDs and ratings, import of the DUPR Club list.
          ...((club?.sport || 'pickleball') === 'pickleball' ? [{ key: 'dupr', label: t('nav.memDupr'), icon: '📈' }] : []),
        ]}
      />

      {tab === 'waiting' && <MemberRequests club={club} requests={pending} members={members || []} onChanged={() => { reloadRequests(); reload(); }} />}
      {tab === 'dupr' && club && <DuprMembers club={club} />}

      {!['waiting', 'review', 'dupr', 'all'].includes(tab) && pending.length > 0 && (
        <button className="w-full text-left rounded-xl border border-yellow-400/40 bg-yellow-400/5 px-4 py-2.5 mb-3 text-sm" onClick={() => pickTab('waiting')}>
          <span className="text-yellow-300 font-semibold">📝 {t('requests.banner', { n: pending.length })}</span>{' '}
          <span className="text-gray-300">{pending.map((m) => m.account_name || m.full_name).join(', ')}</span>
          <span className="text-lime-400 ml-1">→</span>
        </button>
      )}

      {tab === 'fixed' && incomplete.length > 0 && (
        <button
          type="button"
          className={`w-full text-left rounded-xl border px-4 py-2.5 mb-3 text-sm ${onlyIncomplete ? 'border-amber-400 bg-amber-400/10' : 'border-amber-400/40 bg-amber-400/5'}`}
          onClick={() => setOnlyIncomplete((v) => !v)}
          aria-pressed={onlyIncomplete}
        >
          <span className="text-amber-300 font-semibold">⚠️ {t('members.incompleteBanner', { n: incomplete.length })}</span>{' '}
          <span className="text-gray-300">{t('members.incompleteHint')}</span>
          <span className="text-lime-400 ml-1">{onlyIncomplete ? t('members.incompleteShowAll') : t('members.incompleteFilter')}</span>
        </button>
      )}

      {isGuestTab && club && <GuestPerkSettings />}

      {!['waiting', 'dupr'].includes(tab) && (
        <section className={`card !p-0 overflow-hidden ${tab === 'review' ? 'mb-4 border-amber-300/30' : ''}`}>
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-navy-700 bg-navy-900/40">
            <div className="relative flex-1 min-w-[12rem]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm" aria-hidden="true">🔍</span>
              <input className="input !pl-9" type="search" placeholder={t('memx.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('memx.search')} />
            </div>
            <Segmented items={['all', 'male', 'female']} value={gender} onChange={setGender} label={(k) => (k === 'all' ? t('memx.allGenders') : t(`members.${k}`))} />
            <Segmented items={vipFilters} value={vipF} onChange={setVipF} label={(k) => t(`memx.vipF_${k}`)} />
            <select className="input !w-auto text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label={t('memx.sort')}>
              {['default', 'name', 'level', 'joined'].map((k) => <option key={k} value={k}>{t(`memx.sort_${k}`)}</option>)}
            </select>
            {inactiveCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-300 whitespace-nowrap">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                {t('memx.showInactive', { n: inactiveCount })}
              </label>
            )}
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-red-500/30 bg-red-500/10 text-sm">
              <span className="text-red-200 font-semibold">{t('memx.selectedN', { n: selected.length })}</span>
              <button type="button" className="text-gray-300 hover:text-white underline underline-offset-2" onClick={() => setSelected([])}>{t('memx.clearSel')}</button>
              <button type="button" className="ml-auto rounded-lg px-3 py-1.5 font-semibold border border-red-500/60 text-red-300 hover:bg-red-500/15 disabled:opacity-40" disabled={busy} onClick={deleteSelected}>
                🗑 {t('members.deleteSelected', { count: selected.length })}
              </button>
            </div>
          )}

          {loading && <p className="text-gray-400 text-sm p-4">{t('common.loading')}</p>}
          {!loading && rows.length === 0 && (
            <div className="p-8 text-center">
              <div className="text-4xl mb-2" aria-hidden="true">{isGuestTab ? '🤝' : '👥'}</div>
              <p className="text-gray-400 text-sm mb-3">{t(tab === 'review' ? 'mod.empty' : isGuestTab ? 'guests.empty' : 'members.empty')}</p>
              {!isGuestTab && tab !== 'review' && canManage && <button className="btn-primary text-sm" disabled={!club} onClick={() => setInviteOpen(true)}>🔗 {t('invite.button')}</button>}
            </div>
          )}
          {!loading && rows.length > 0 && shownRows.length === 0 && <p className="text-gray-400 text-sm p-4">{t('memx.noMatch')}</p>}

          {!loading && shownRows.length > 0 && (
            <>
              {/* Phones: one card per person */}
              <ul className="md:hidden divide-y divide-navy-700">
                {shownRows.map((m) => (
                  <li key={m.id} className={`flex items-start gap-3 px-3 py-3 ${selected.includes(m.id) ? 'bg-red-500/10' : ''} ${m.is_active ? '' : 'opacity-50'}`}>
                    <input type="checkbox" className="mt-3" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} aria-label={m.full_name} />
                    <button type="button" className="flex-1 min-w-0 text-left flex items-start gap-3" onClick={() => openMember(m, false)}>
                      <Avatar name={m.full_name} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-white font-semibold truncate">{m.full_name}</span>
                          {(m.member_type === 'fixed' || isCommunity) && <VipBadge stars={m.vip_stars} />}
                          {tab === 'all' && <span className={`text-[10px] leading-4 rounded-full border px-1.5 ${PLACE_PILL[placeOf(m)]}`}>{t(`xlsx.place_${placeOf(m)}`)}</span>}
                          {isBirthdayMonth(m.birth_date) && <span title={t('members.birthdayMonth')}>🎂</span>}
                        </span>
                        <span className="block text-gray-400 text-xs mt-0.5">
                          {[m.gender ? t(`members.${m.gender}`) : null, m.district, playDurationText(m.play_duration, t), levelText(m.dupr_level, sport, t)].filter(Boolean).join(' · ') || '—'}
                        </span>
                        {missingInfo(m).length > 0 && <span className="block text-amber-300 text-xs mt-0.5">⚠ {t('members.missingList', { list: missText(m) })}</span>}
                        <span className="block text-gray-500 text-xs mt-0.5">
                          {isGuestTab
                            ? `${t('guests.played')}: ${m.guest_stats?.played ?? 0}`
                            : m.joined_on ? `${t('members.joined')} ${my(m.joined_on)} · ${tenureLabel(m.joined_on, t)}` : ''}
                        </span>
                        {(m.flags?.length > 0 || ((isGuestTab || isCommunity) && m.guest_perk)) && (
                          <span className="flex flex-wrap gap-1 mt-1">
                            {(isGuestTab || isCommunity) && <GuestPerkBadge perk={m.guest_perk} pct={m.guest_discount_pct} />}
                            {(m.flags || []).map((f) => <span key={f} className={`text-[10px] leading-4 rounded border px-1 ${FLAG_STYLE[f]}`}>{t(`flags.${f}`)}</span>)}
                          </span>
                        )}
                      </span>
                    </button>
                    <button type="button" className="rounded-lg px-2 py-1 text-sm hover:bg-navy-700" aria-label={`${t('members.edit')}: ${m.full_name}`} onClick={() => openMember(m, true)}>✏️</button>
                  </li>
                ))}
              </ul>

              {/* Tablets / computers: the full table */}
              <div className="hidden md:block table-wrap">
                <table className={`w-full text-sm grid-table ${isGuestTab ? 'wrap-head' : ''}`}>
                  <thead>
                    <tr className="text-gray-300 text-left bg-navy-900">
                      <th className="w-10 text-center">
                        <input type="checkbox" aria-label="Select all" checked={shownSelected} onChange={() => setSelected(shownSelected ? [] : shownRows.map((m) => m.id))} />
                      </th>
                      <th className="w-12 text-center">{t('members.no')}</th>
                      <th>{t('common.name')}</th>
                      <th>{t('members.type')}</th>
                      <th>{t('members.gender')}</th>
                      <th>{t('members.birthDate')}</th>
                      {showPhone && <th>{t('common.phone')}</th>}
                      <th>{t('members.joined')}</th>
                      <th>{t('memberX.district')}</th>
                      <th>{t('memberX.playDuration')}</th>
                      <th>{t('members.colScore')}</th>
                      {levelCfg && <th>{t('members.colLevel')}</th>}
                      {isGuestTab ? (
                        <>
                          <th>{t('guests.played')}</th>
                          <th>{t('guests.perk')}</th>
                          <th>{t('guests.notes')}</th>
                        </>
                      ) : (
                        <th>{t('members.tier')}</th>
                      )}
                      <th className="w-14 text-center">{t('members.editCol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.map((m, i) => (
                      <tr key={m.id} onClick={() => toggle(m.id)} className={`cursor-pointer ${selected.includes(m.id) ? 'bg-red-500/10' : 'hover:bg-navy-700/40'} ${m.is_active ? '' : 'opacity-40'}`}>
                        <td className="text-center">
                          <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} onClick={(e) => e.stopPropagation()} />
                        </td>
                        <td className="text-center text-gray-400">{i + 1}</td>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={m.full_name} size={30} />
                            <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                              <button
                                type="button"
                                className="text-white font-medium hover:text-lime-400 text-left whitespace-nowrap"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openMember(m, false);
                                }}
                              >
                                {m.full_name}
                              </button>
                              {(m.member_type === 'fixed' || isCommunity) && <VipBadge stars={m.vip_stars} />}
                              {isCommunity && !isGuestTab && m.guest_perk && <GuestPerkBadge perk={m.guest_perk} pct={m.guest_discount_pct} />}
                              {m.account_email && !m.account_verified && (
                                <span className="text-[10px] leading-4 rounded border border-yellow-400/60 text-yellow-300 px-1 whitespace-nowrap">{t('verify.pending')}</span>
                              )}
                              {m.flags?.length > 0 && (
                                <span className="basis-full flex flex-wrap gap-1">
                                  {m.flags.map((f) => (
                                    <span key={f} title={t(`flags.${f}`)} className={`text-[10px] leading-4 rounded border px-1 ${FLAG_STYLE[f]}`}>
                                      {t(`flags.${f}`)}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          <span className={`text-xs rounded-full border px-2 py-0.5 ${PLACE_PILL[placeOf(m)]}`}>
                            {t(`xlsx.place_${placeOf(m)}`)}
                          </span>
                        </td>
                        <td className="text-gray-300 whitespace-nowrap">{m.gender ? t(`members.${m.gender}`) : miss(m, 'gender')}</td>
                        <td className="text-gray-300 whitespace-nowrap">
                          {m.birth_date ? dmy(m.birth_date) : m.birth_year ? (
                            <>
                              {m.birth_year} <span className="text-yellow-300/80 text-xs" title={t('members.noDayMonth')}>· {t('members.noDayMonthShort')}</span>
                            </>
                          ) : miss(m, 'birthday')}
                          {isBirthdayMonth(m.birth_date) && <span className="ml-1" title={t('members.birthdayMonth')}>🎂</span>}
                        </td>
                        {showPhone && <td className="text-gray-300 whitespace-nowrap tabular-nums">{m.phone || miss(m, 'phone')}</td>}
                        <td className="text-gray-300 whitespace-nowrap">
                          {m.joined_on ? (
                            <>
                              {my(m.joined_on)}
                              {!isGuestTab && <span className="text-gray-500 text-xs"> · {tenureLabel(m.joined_on, t)}</span>}
                            </>
                          ) : '—'}
                        </td>
                        <td className="text-gray-300 whitespace-nowrap">{m.district || '—'}</td>
                        <td className="text-gray-300 whitespace-nowrap">{playDurationText(m.play_duration, t) || '—'}</td>
                        <td className="text-gray-300">{levelText(m.dupr_level, sport, t) ?? '—'}</td>
                        {levelCfg && (
                          <td className="text-gray-200 whitespace-nowrap" onClick={(e) => levelCfg.mode === 'manual' && e.stopPropagation()}>
                            {levelCfg.mode === 'manual' ? (
                              <select
                                className="input !w-auto !py-1 text-sm"
                                aria-label={`${t('members.colLevel')}: ${m.full_name}`}
                                value={m.level_key || ''}
                                onChange={async (e) => {
                                  try {
                                    await api.patch(`/api/clubs/${club.id}/members/${m.id}`, { level_key: e.target.value || null });
                                    reload();
                                  } catch (err) {
                                    window.alert(err.message);
                                  }
                                }}
                              >
                                <option value="">—</option>
                                {levelCfg.items.map((it) => <option key={it.key} value={it.key}>{it.label}</option>)}
                              </select>
                            ) : (
                              m.level?.label || <span className="text-gray-500">—</span>
                            )}
                          </td>
                        )}
                        {isGuestTab ? (
                          <>
                            <td className="text-gray-300 whitespace-nowrap">
                              {m.guest_stats?.played ?? 0}
                              {m.guest_stats?.last_played && <span className="text-gray-500 text-xs"> · {dmy(m.guest_stats.last_played).slice(0, 5)}</span>}
                            </td>
                            <td><GuestPerkBadge perk={m.guest_perk} pct={m.guest_discount_pct} /></td>
                            <td className="!whitespace-normal min-w-[11rem] max-w-[16rem]" onClick={(e) => e.stopPropagation()}><GuestNoteCell club={club} member={m} onSaved={reload} /></td>
                          </>
                        ) : (
                          <td className="text-gray-300">{m.vip_stars > 0 ? <VipBadge stars={m.vip_stars} /> : m.tier ? t(`members.${m.tier}`) : '—'}</td>
                        )}
                        <td className="text-center">
                          <button
                            type="button"
                            title={t('members.edit')}
                            aria-label={`${t('members.edit')}: ${m.full_name}`}
                            className="rounded px-1.5 py-0.5 text-sm opacity-70 hover:opacity-100 hover:bg-navy-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              openMember(m, true);
                            }}
                          >
                            ✏️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-gray-500 text-xs px-3 py-2 border-t border-navy-700">{t('memx.footer', { n: shownRows.length, total: rows.length })} · {t('members.openHint')}</p>
            </>
          )}
        </section>
      )}

      {/* Danh sách đen: the table above shows who they are; here, why and what to do. */}
      {tab === 'review' && club && <ReviewTab club={club} members={reviewRows} onChanged={() => { reloadRequests(); reload(); }} />}

      <MemberDetail
        club={club}
        member={detailMember}
        autoEdit={editing}
        onClose={() => { setDetailId(null); setEditing(false); }}
        onChanged={reload}
        onReview={canManage ? (m) => { setDetailId(null); setEditing(false); setReviewing(m); } : null}
      />
      <ReviewModal club={club} member={reviewing} open={!!reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); reload(); pickTab('review'); }} />
      <InviteModal club={club} open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </AppShell>
  );
}
