'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const WorkspaceContext = createContext(null);
const STORAGE_KEY = 'pickleball_workspace';
export const WORKSPACES = ['club', 'xeve'];
export const WORKSPACE_HOME = { club: '/dashboard', xeve: '/events' };

// Which half of the Host app is in use: Club Manager or Xé Vé (one-off events) Manager.
export function WorkspaceProvider({ children }) {
  const [workspace, setWorkspaceState] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (WORKSPACES.includes(saved)) setWorkspaceState(saved);
    } catch {
      /* localStorage unavailable — the picker shows each visit */
    }
    setReady(true);
  }, []);

  const setWorkspace = useCallback((next) => {
    if (!WORKSPACES.includes(next)) return;
    setWorkspaceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ workspace, setWorkspace, ready }), [workspace, setWorkspace, ready]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
