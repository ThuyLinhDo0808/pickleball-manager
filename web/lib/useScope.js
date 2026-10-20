'use client';
import { useClubs } from '@/context/ClubContext';
import { useWorkspace } from '@/context/WorkspaceContext';

// What the manager pages work on:
//   scoped     — a club (Club Manager) or a community (Social Manager): club pages apply
//   community  — the picked club is a Social Manager community ("cộng đồng xé vé")
export function useScope() {
  const { workspace } = useWorkspace();
  const { club } = useClubs();
  const community = workspace === 'xeve' && !!club;
  return { workspace, club, community, scoped: workspace === 'club' || community };
}
