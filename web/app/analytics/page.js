'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';

// The "Phân tích" page (no-show heatmap, form over time) was removed; old links land on
// the member stats (club) or the game list (Xé Vé).
export default function AnalyticsRemoved() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  useEffect(() => {
    router.replace(workspace === 'xeve' ? '/events' : '/club/attendance');
  }, [router, workspace]);
  return null;
}
