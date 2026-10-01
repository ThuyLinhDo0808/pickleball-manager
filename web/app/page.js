'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
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
