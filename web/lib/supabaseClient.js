'use client';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('Supabase env vars are missing — copy .env.local.example to .env.local and fill them in.');
}

// Fall back to a syntactically valid placeholder URL so createClient() doesn't
// throw during build/import when env vars aren't set yet (e.g. first Vercel
// deploy before env vars are configured). Auth calls will simply fail until
// the real env vars are set.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key');