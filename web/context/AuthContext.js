'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    session,
    user: session?.user || null,
    loading: session === undefined,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    // The confirmation email brings people to the welcome page of this site. Supabase only
    // follows it when the URL is in Authentication → URL Configuration → Redirect URLs;
    // otherwise it falls back to the Site URL (e.g. localhost). NEXT_PUBLIC_SITE_URL can pin
    // the public address.
    signUp: (email, password) =>
      supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${(process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, '')}/welcome` },
      }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
