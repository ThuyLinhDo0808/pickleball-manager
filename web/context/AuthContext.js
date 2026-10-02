'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext(null);

// Only the origin of NEXT_PUBLIC_SITE_URL is used, so a value copied from Supabase's
// Redirect URLs (".../**") or with a trailing path still gives a valid link.
function siteOrigin() {
  try {
    if (process.env.NEXT_PUBLIC_SITE_URL) return new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
  } catch {
    /* fall back to this site */
  }
  return window.location.origin;
}
const welcomeUrl = () => `${siteOrigin()}/welcome`;

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
    signUp: (email, password) => supabase.auth.signUp({ email, password, options: { emailRedirectTo: welcomeUrl() } }),
    // A fresh confirmation email (the old link may be used up, expired or point elsewhere).
    resendConfirmation: (email) => supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: welcomeUrl() } }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
