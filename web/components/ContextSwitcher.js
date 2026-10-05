'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ClubAvatar from '@/components/ClubAvatar';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useEnter } from '@/lib/useEnter';
import { SocialManagerModal, UpgradeModal, atClubLimit } from '@/components/PlanModals';

// "Where am I": the club (or Xé Vé / staff space) the manager pages work on, with the
// role, and a menu to jump to another space this account manages — or back to the home
// hub, where the clubs it only plays in live. Replaces the old Manager/Player and
// Club/Xé Vé toggles.
export default function ContextSwitcher({ compact = false, iconOnly = false, className = '' }) {
  const { t } = useI18n();
  const { clubs, club, selectClub } = useClubs();
  const { workspace, staffInfo, plan } = useWorkspace();
  const [smOpen, setSmOpen] = useState(false);
  const [upOpen, setUpOpen] = useState(false);
  const { manageClub, space } = useEnter();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);

  // The menu floats above the page (fixed, under the button) so the narrow sidebar
  // neither clips it nor scrolls sideways.
  function place() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(Math.max(r.width, 256), window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const top = r.bottom + 8;
    setPos({ top, left, width, maxHeight: Math.max(200, window.innerHeight - top - 16) });
  }
  useEffect(() => {
    if (!open) return undefined;
    place();
    // Scrolling the page or sidebar would leave the menu behind: close it instead.
    const onScroll = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const current =
    workspace === 'xeve'
      ? { avatar: <ClubAvatar icon="🎟" size={compact ? 32 : 40} />, name: t('hub.socialManager'), role: t('hub.roleOrganizer') }
      : workspace === 'staff'
        ? { avatar: <ClubAvatar icon="🦺" size={compact ? 32 : 40} />, name: t('hub.staff'), role: t('hub.roleStaff') }
        : club
          ? { avatar: <ClubAvatar id={club.id} name={club.name} sport={club.sport} size={compact ? 32 : 40} />, name: club.name, role: t(club.role === 'co_admin' ? 'hub.roleCoAdmin' : 'hub.roleOwner') }
          : { avatar: <ClubAvatar icon="🏠" size={compact ? 32 : 40} />, name: t('hub.noClubYet'), role: '' };

  function pickClub(id) {
    setOpen(false);
    if (workspace === 'club') selectClub(id);
    else manageClub(id);
  }
  function pickSpace(ws) {
    setOpen(false);
    space(ws);
  }

  const row = (active, onClick, avatar, label, sub) => (
    <button type="button" onClick={onClick} className={`w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left ${active ? 'bg-navy-700' : 'hover:bg-navy-800'}`}>
      {avatar}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${active ? 'text-lime-300 font-semibold' : 'text-white'}`}>{label}</span>
        {sub && <span className="block text-gray-500 text-[11px]">{sub}</span>}
      </span>
      {active && <span className="text-lime-400 text-sm" aria-hidden="true">✓</span>}
    </button>
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={t('hub.switchContext')}
        className={`w-full flex items-center gap-2.5 rounded-xl border border-navy-700 bg-navy-950/60 hover:border-navy-500 text-left ${compact || iconOnly ? 'p-1.5 justify-center' : 'p-2'}`}
      >
        {current.avatar}
        {!iconOnly && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-white text-sm font-semibold truncate">{current.name}</span>
              {current.role && <span className="block text-lime-300/90 text-[11px] font-semibold uppercase tracking-wide">{current.role}</span>}
            </span>
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M7 10l5-5 5 5M7 14l5 5 5-5" />
            </svg>
          </>
        )}
      </button>

      {open && pos && (
        <div
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          className="z-50 rounded-xl border border-navy-600 bg-navy-900 shadow-2xl p-2 overflow-y-auto overflow-x-hidden"
        >
          {clubs.length > 0 && (
            <>
              <p className="px-2 pt-1 pb-1 text-gray-500 text-[11px] font-semibold uppercase tracking-wide">{t('hub.managing')}</p>
              {clubs.map((c) => (
                <div key={c.id}>
                  {row(
                    workspace === 'club' && club?.id === c.id,
                    () => pickClub(c.id),
                    <ClubAvatar id={c.id} name={c.name} sport={c.sport} size={32} />,
                    c.name,
                    t(c.role === 'co_admin' ? 'hub.roleCoAdmin' : 'hub.roleOwner')
                  )}
                </div>
              ))}
            </>
          )}
          <p className="px-2 pt-2 pb-1 text-gray-500 text-[11px] font-semibold uppercase tracking-wide">{t('hub.otherSpaces')}</p>
          {plan?.social_manager
            ? row(workspace === 'xeve', () => pickSpace('xeve'), <ClubAvatar icon="🎟" size={32} />, t('hub.socialManager'), t('hub.roleOrganizer'))
            : row(false, () => { setOpen(false); setSmOpen(true); }, <ClubAvatar icon="🎟" size={32} />, t('hub.socialManager'), t('hub.smSignUpShort'))}
          {staffInfo?.is_staff && row(workspace === 'staff', () => pickSpace('staff'), <ClubAvatar icon="🦺" size={32} />, t('hub.staff'), t('hub.roleStaff'))}
          <div className="border-t border-navy-700 mt-2 pt-2 grid gap-1">
            <Link href="/home" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-navy-800 text-sm text-white">
              <span className="w-8 text-center" aria-hidden="true">🏠</span>
              <span className="min-w-0">
                <span className="block">{t('hub.backHome')}</span>
                <span className="block text-gray-500 text-[11px]">{t('hub.backHomeHint')}</span>
              </span>
            </Link>
            <button type="button" onClick={() => { setOpen(false); if (atClubLimit(plan)) setUpOpen(true); else space('club', '/clubs'); }} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-navy-800 text-sm text-gray-300 text-left">
              <span className="w-8 text-center" aria-hidden="true">＋</span>
              {t('hub.createClub')}
            </button>
          </div>
        </div>
      )}
      <SocialManagerModal open={smOpen} onClose={() => setSmOpen(false)} />
      <UpgradeModal open={upOpen} onClose={() => setUpOpen(false)} />
    </div>
  );
}
