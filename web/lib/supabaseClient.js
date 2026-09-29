'use client';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('Supabase env vars are missing — copy .env.local.example to .env.local and fill them in.');
}

export const supabase = createClient(url || '', anonKey || '');
