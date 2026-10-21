'use client';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { clearReturn } from '@/lib/returnTo';

// Pages a signed-in account may open before finishing the first-visit wizard. Kèo links
// (/e, the vote page /v, the survey /s, tickets /t), club invite / join links and the
// email code skip it: a player who came to play only gives name, phone and level on the
// kèo page itself; the wizard comes when they open the rest of the app.
const OPEN = ['/onboarding', '/sign-in', '/welcome', '/reset-password', '/owner', '/privacy', '/terms', '/verify-email', '/e', '/v', '/s', '/t', '/invite', '/join', '/l', '/claim'];

// Every other page: the signed-in account fills in its sports, role and profile first,
// then goes back to that page (/onboarding?next=…).
export default function OnboardingGate() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const checked = useRef(null); // user id already known to be done
  // Signed in and on the page they signed up for (invite, kèo…): nothing left to go back to.
  useEffect(() => {
    if (!loading && user) clearReturn(pathname);
  }, [loading, user, pathname]);
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
