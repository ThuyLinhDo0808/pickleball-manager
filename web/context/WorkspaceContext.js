'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const WorkspaceContext = createContext(null);
const STORAGE_KEY = 'pickleball_workspace';
const ALL = ['club', 'xeve', 'staff', 'coach'];
export const WORKSPACE_HOME = { club: '/dashboard', xeve: '/events', staff: '/staff', coach: '/coach' };

// Which part of the app is in use: Club Manager, Xé Vé Manager, or — for accounts
// a Host has granted access to — the Referee / Coordinator view.
export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [workspace, setWorkspaceState] = useState(null);
  const [staffInfo, setStaffInfo] = useState(null); // { is_staff, email_verified }
  // Coach Manager: on for this account? has a profile? (its own product, not a plan)
  const [coachInfo, setCoachInfo] = useState(null); // { enabled, has_profile, slug, status }
  const reloadCoach = useCallback(() => {
    if (!user) return Promise.resolve(null);
    return api
      .get('/api/coach/status')
      .then((c) => {
        setCoachInfo(c);
        return c;
      })
      .catch(() => {
        setCoachInfo({ enabled: false, has_profile: false });
        return null;
      });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) setCoachInfo(null);
    else reloadCoach();
  }, [user?.id, reloadCoach]); // eslint-disable-line react-hooks/exhaustive-deps
  // Plan: tier, club limit / usage, Social Manager add-on (see backend services/plan.js).
  const [plan, setPlan] = useState(null);
  const reloadPlan = useCallback(() => {
    if (!user) return Promise.resolve(null);
    return api
      .get('/api/host/plan')
      .then((p) => {
        setPlan(p);
        return p;
      })
      .catch(() => null);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) setPlan(null);
    else reloadPlan();
  }, [user?.id, reloadPlan]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const workspaces = [...(staffInfo?.is_staff ? ['club', 'xeve', 'staff'] : ['club', 'xeve']), ...(coachInfo?.has_profile ? ['coach'] : [])];

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
  // Likewise a saved "coach" choice once the profile is gone or the product switched off.
  const effective =
    (workspace === 'staff' && staffInfo && !staffInfo.is_staff) || (workspace === 'coach' && coachInfo && !coachInfo.has_profile) ? null : workspace;

  const value = useMemo(
    () => ({ workspace: effective, setWorkspace, ready: ready && (effective !== 'staff' || !!staffInfo) && (effective !== 'coach' || !!coachInfo), workspaces, staffInfo, coachInfo, reloadCoach, plan, reloadPlan }),
    [effective, setWorkspace, ready, workspaces.length, staffInfo, coachInfo, reloadCoach, plan, reloadPlan]
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
