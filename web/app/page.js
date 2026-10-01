'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

// When Supabase can't use our /welcome link (not in its Redirect URLs) it sends the
// confirmation result to the Site URL root instead. Grab it before the auth client
// tidies the address bar, and forward it to the welcome page.
const LANDING =
  typeof window !== 'undefined' && /(^|[#&?])(error_code|access_token|code)=/.test(window.location.hash + window.location.search)
    ? `/welcome${window.location.search}${window.location.hash}`
    : null;

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (LANDING) return window.location.replace(LANDING);
    if (loading) return;
    if (!user) return router.replace('/sign-in');
    // Reopen the side last used: manager (Club / Xé Vé) or player portal.
    let mode = null;
    try {
      mode = window.localStorage.getItem('pickleball_mode');
    } catch {
      /* ignore */
    }
    router.replace(mode === 'player' ? '/p' : '/dashboard');
  }, [loading, user, router]);

  return <div className="min-h-screen bg-navy-950" />;
}
