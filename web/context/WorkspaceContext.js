'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const WorkspaceContext = createContext(null);
const STORAGE_KEY = 'pickleball_workspace';
const ALL = ['club', 'xeve', 'staff'];
export const WORKSPACE_HOME = { club: '/dashboard', xeve: '/events', staff: '/staff' };

// Which part of the app is in use: Club Manager, Xé Vé Manager, or — for accounts
// a Host has granted access to — the Referee / Coordinator view.
export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [workspace, setWorkspaceState] = useState(null);
  const [staffInfo, setStaffInfo] = useState(null); // { is_staff, email_verified }
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (ALL.includes(saved)) setWorkspaceState(saved);
    } catch {
      /* localStorage unavailable — the picker shows each visit */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setStaffInfo(null);
      return;
    }
    let cancelled = false;
    api
      .get('/api/staff/me')
      .then((info) => !cancelled && setStaffInfo(info))
      .catch(() => !cancelled && setStaffInfo({ is_staff: false }));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const workspaces = staffInfo?.is_staff ? ALL : ['club', 'xeve'];

  const setWorkspace = useCallback((next) => {
    if (!ALL.includes(next)) return;
    setWorkspaceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  // A saved "staff" choice is dropped once the account no longer has any grants.
  const effective = workspace === 'staff' && staffInfo && !staffInfo.is_staff ? null : workspace;

  const value = useMemo(
    () => ({ workspace: effective, setWorkspace, ready: ready && (effective !== 'staff' || !!staffInfo), workspaces, staffInfo }),
    [effective, setWorkspace, ready, workspaces.length, staffInfo]
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
