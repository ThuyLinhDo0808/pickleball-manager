'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

// Pages a signed-in account may open before finishing the first-visit wizard.
const OPEN = ['/onboarding', '/sign-in', '/welcome', '/reset-password', '/owner', '/privacy', '/terms'];

// Every signed-in account fills in its sports, role and profile first — also when it
// arrived through a club invite link or a kèo link. Afterwards it goes back to that page
// (/onboarding?next=…).
export default function OnboardingGate() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const checked = useRef(null); // user id already known to be done
  useEffect(() => {
    if (loading || !user || checked.current === user.id) return;
    if (OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return;
    let gone = false;
    api
      .get('/api/host/me')
      .then((me) => {
        if (gone || !me) return;
        // Before the onboarding migration the column is missing: nobody is held back.
        if (!('onboarded_at' in me) || me.onboarded_at) {
          checked.current = user.id;
          return;
        }
        const here = `${window.location.pathname}${window.location.search}`;
        router.replace(`/onboarding?next=${encodeURIComponent(here)}`);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [user, loading, pathname, router]);
  return null;
}
