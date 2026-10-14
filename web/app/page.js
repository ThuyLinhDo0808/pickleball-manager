'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Landing from '@/components/Landing';

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
    // Signed in: everyone lands on the home hub (all their clubs and roles in one place).
    // Visitors see the landing page, then go on to sign up / sign in from it.
    if (user) router.replace('/home');
  }, [loading, user, router]);

  if (LANDING || loading || user) return <div className="min-h-screen bg-navy-950" />;
  return <Landing />;
}
