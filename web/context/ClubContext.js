'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';

const ClubContext = createContext(null);
// The club picked in Club Manager, and the community picked in Social Manager.
const STORAGE_KEY = { club: 'pickleball_club', community: 'pickleball_community' };
// Social Manager without a community: the older one-off kèo ("Kèo lẻ").
export const STANDALONE = 'standalone';
export const kindOf = (c) => (c?.kind === 'community' ? 'community' : 'club');

function readSaved(kind) {
  try {
    return window.localStorage.getItem(STORAGE_KEY[kind]);
  } catch {
    return null;
  }
}

function writeSaved(kind, id) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY[kind], id);
    else window.localStorage.removeItem(STORAGE_KEY[kind]);
  } catch {
    /* localStorage unavailable — selection just won't persist */
  }
}

// A host can run many clubs. This keeps the list plus the "current" club that
// the club-scoped pages (members, rankings, fund, schedule) work against.
// Clubs (kind 'club') belong to Club Manager; communities (kind 'community') to Social
// Manager. `clubs` / `club` are those of the space in use, so every club page works for
// a community as it is; `allClubs` has both.
export function ClubProvider({ children }) {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const space = workspace === 'xeve' ? 'community' : 'club';
  const [allClubs, setClubs] = useState([]);
  const [picked, setPicked] = useState({ club: null, community: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // `silent`: refresh in the background (tab focus) without the loading state.
  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!user) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const list = await api.get('/api/clubs');
      setClubs(list);
      setPicked((cur) => {
        const next = {};
        for (const kind of ['club', 'community']) {
          const mine = list.filter((c) => kindOf(c) === kind);
          const wanted = cur[kind] || readSaved(kind);
          next[kind] = wanted === STANDALONE && kind === 'community' ? STANDALONE : mine.some((c) => c.id === wanted) ? wanted : mine[0]?.id || null;
        }
        return next;
      });
      return list;
    } catch (err) {
      if (!silent) setError(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user?.id]);

  // Clubs shared with this account (co-admin) can appear any time: refresh when the tab
  // comes back into view, so the list never stays stuck on the sign-in snapshot.
  useEffect(() => {
    if (!user) return undefined;
    const onFocus = () => document.visibilityState === 'visible' && reload({ silent: true });
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [user?.id, reload]);

  useEffect(() => {
    if (!user) {
      setClubs([]);
      setPicked({ club: null, community: null });
      setLoading(true);
      return;
    }
    reload();
  }, [user?.id, reload]);

  useEffect(() => {
    for (const kind of ['club', 'community']) if (picked[kind]) writeSaved(kind, picked[kind]);
  }, [picked]);

  // Pick a club or community (its kind decides which space it belongs to). null in
  // Social Manager = the one-off kèo without a community.
  const selectClub = useCallback(
    (id) => {
      const c = allClubs.find((x) => x.id === id);
      const kind = c ? kindOf(c) : space;
      setPicked((cur) => ({ ...cur, [kind]: id || (kind === 'community' ? STANDALONE : null) }));
    },
    [allClubs, space]
  );

  const createClub = useCallback(async ({ name, description, sport, kind }) => {
    const created = await api.post('/api/clubs', { name, description: description || null, sport: sport || 'pickleball', ...(kind === 'community' ? { kind } : {}) });
    setClubs((list) => [{ ...created, role: 'owner' }, ...list]);
    setPicked((cur) => ({ ...cur, [kindOf(created)]: created.id }));
    return created;
  }, []);

  const updateClub = useCallback(async (id, fields) => {
    const updated = await api.patch(`/api/clubs/${id}`, fields);
    setClubs((list) => list.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    return updated;
  }, []);

  // `confirmName`: the club's name typed by the Host (the server checks it).
  const deleteClub = useCallback(async (id, confirmName) => {
    await api.del(`/api/clubs/${id}?confirm=${encodeURIComponent(confirmName || '')}`);
    const gone = allClubs.find((c) => c.id === id);
    const kind = kindOf(gone);
    const next = allClubs.filter((c) => c.id !== id);
    setClubs(next);
    setPicked((cur) => (cur[kind] === id ? { ...cur, [kind]: next.find((c) => kindOf(c) === kind)?.id || null } : cur));
    if (!next.some((c) => kindOf(c) === kind)) writeSaved(kind, null);
  }, [allClubs]);

  const clubs = useMemo(() => allClubs.filter((c) => kindOf(c) === space), [allClubs, space]);
  const club = clubs.find((c) => c.id === picked[space]) || null;
  // Working on someone else's club (co-admin, Finance or Operations — see backend
  // services/clubAccess.js and services/clubRoles.js): no owner-only pages.
  const isCoAdmin = !!club?.role && club.role !== 'owner';

  // The whole app speaks the current club's sport (DUPR vs badminton levels, balls vs shuttles...).
  // Personal pages (home hub, member club page, my activity) set their own sport.
  const { setSport } = useI18n();
  const pathname = usePathname() || '';
  const personal = pathname === '/home' || pathname.startsWith('/c/') || pathname === '/p' || pathname.startsWith('/p/');
  const sport = club?.sport || 'pickleball';
  useEffect(() => {
    if (!personal) setSport(sport);
  }, [sport, setSport, personal]);

  const value = useMemo(
    () => ({ clubs, allClubs, club, isCoAdmin, loading, error, reload, selectClub, createClub, updateClub, deleteClub }),
    [clubs, allClubs, club, isCoAdmin, loading, error, reload, selectClub, createClub, updateClub, deleteClub]
  );

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

export function useClubs() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error('useClubs must be used within ClubProvider');
  return ctx;
}
