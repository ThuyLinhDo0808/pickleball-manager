'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useClubs } from '@/context/ClubContext';
import { useWorkspace, WORKSPACE_HOME } from '@/context/WorkspaceContext';

// Going into one of the account's spaces from the home hub (or the context switcher):
// a club it runs → that club's manager pages; Xé Vé → the organiser pages; staff → the
// assigned events. Clubs it only plays in open the member page /c/<id> instead.
export function useEnter() {
  const router = useRouter();
  const { clubs, selectClub, reload } = useClubs();
  const { setWorkspace } = useWorkspace();

  const manageClub = useCallback(
    async (clubId, path = '/dashboard') => {
      // The club list is loaded once at sign-in; a club shared since then (co-admin)
      // isn't in it yet, so fetch it again before opening.
      if (!clubs.some((c) => c.id === clubId)) await reload();
      selectClub(clubId);
      setWorkspace('club');
      router.push(path);
    },
    [router, clubs, selectClub, reload, setWorkspace]
  );
  const space = useCallback(
    (ws, path) => {
      setWorkspace(ws);
      router.push(path || WORKSPACE_HOME[ws]);
    },
    [router, setWorkspace]
  );
  const memberClub = useCallback((clubId) => router.push(`/c/${clubId}`), [router]);
  return { manageClub, space, memberClub, reloadClubs: reload };
}
