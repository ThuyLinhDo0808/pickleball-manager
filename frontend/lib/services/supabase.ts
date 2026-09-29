import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zplnwjjrnuzjbmunipdt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_i5sYbPRW5a4cXQT1BOtdjw_zrydRV1q';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});