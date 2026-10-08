'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';

const ClubContext = createContext(null);
const STORAGE_KEY = 'pickleball_club';

function readSaved() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSaved(id) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage unavailable — selection just won't persist */
  }
}

// A host can run many clubs. This keeps the list plus the "current" club that
// the club-scoped pages (members, rankings, fund, schedule) work against.
export function ClubProvider({ children }) {
  const { user } = useAuth();
  const [clubs, setClubs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
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
      setSelectedId((current) => {
        const wanted = current || readSaved();
        return list.some((c) => c.id === wanted) ? wanted : list[0]?.id || null;
      });
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
      setSelectedId(null);
      setLoading(true);
      return;
    }
    reload();
  }, [user?.id, reload]);

  useEffect(() => {
    if (selectedId) writeSaved(selectedId);
  }, [selectedId]);

  const selectClub = useCallback((id) => setSelectedId(id), []);

  const createClub = useCallback(async ({ name, description, sport }) => {
    const created = await api.post('/api/clubs', { name, description: description || null, sport: sport || 'pickleball' });
    setClubs((list) => [{ ...created, role: 'owner' }, ...list]);
    setSelectedId(created.id);
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
    const next = clubs.filter((c) => c.id !== id);
    setClubs(next);
    setSelectedId((current) => (current === id ? next[0]?.id || null : current));
    if (next.length === 0) writeSaved(null);
  }, [clubs]);

  const club = clubs.find((c) => c.id === selectedId) || null;
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
    () => ({ clubs, club, isCoAdmin, loading, error, reload, selectClub, createClub, updateClub, deleteClub }),
    [clubs, club, isCoAdmin, loading, error, reload, selectClub, createClub, updateClub, deleteClub]
  );

  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

export function useClubs() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error('useClubs must be used within ClubProvider');
  return ctx;
}
