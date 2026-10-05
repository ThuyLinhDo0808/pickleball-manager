'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ClubAvatar from '@/components/ClubAvatar';
import { useI18n } from '@/context/I18nContext';
import { useClubs } from '@/context/ClubContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useEnter } from '@/lib/useEnter';

// "Where am I": the club (or Xé Vé / staff space) the manager pages work on, with the
// role, and a menu to jump to another space this account manages — or back to the home
// hub, where the clubs it only plays in live. Replaces the old Manager/Player and
// Club/Xé Vé toggles.
export default function ContextSwitcher({ compact = false, iconOnly = false, className = '' }) {
  const { t } = useI18n();
  const { clubs, club, selectClub } = useClubs();
  const { workspace, staffInfo } = useWorkspace();
  const { manageClub, space } = useEnter();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
      ? { avatar: <ClubAvatar icon="🎟" size={compact ? 32 : 40} />, name: t('hub.xeve'), role: t('hub.roleOrganizer') }
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

      {open && (
        <div role="menu" className={`absolute z-50 mt-2 min-w-[16rem] ${iconOnly ? 'left-0 w-64' : 'left-0 right-0'} rounded-xl border border-navy-600 bg-navy-900 shadow-2xl p-2 max-h-[70vh] overflow-y-auto`}>
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
          {row(workspace === 'xeve', () => pickSpace('xeve'), <ClubAvatar icon="🎟" size={32} />, t('hub.xeve'), t('hub.roleOrganizer'))}
          {staffInfo?.is_staff && row(workspace === 'staff', () => pickSpace('staff'), <ClubAvatar icon="🦺" size={32} />, t('hub.staff'), t('hub.roleStaff'))}
          <div className="border-t border-navy-700 mt-2 pt-2 grid gap-1">
            <Link href="/home" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-navy-800 text-sm text-white">
              <span className="w-8 text-center" aria-hidden="true">🏠</span>
              <span className="min-w-0">
                <span className="block">{t('hub.backHome')}</span>
                <span className="block text-gray-500 text-[11px]">{t('hub.backHomeHint')}</span>
              </span>
            </Link>
            <button type="button" onClick={() => { setOpen(false); space('club', '/clubs'); }} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-navy-800 text-sm text-gray-300 text-left">
              <span className="w-8 text-center" aria-hidden="true">＋</span>
              {t('hub.createClub')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
