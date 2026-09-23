import { createClient } from "@supabase/supabase-js";
import { runtimeMode } from '../runtime';

/**
 * Server-side Supabase client using the service-role key.
 * NEVER expose this to the browser — it bypasses Row Level Security.
 */
export function getSupabaseAdmin() {
  if(runtimeMode() === 'demo') throw new Error('External database calls are disabled in demo mode.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Check your .env.local file."
    );
  }

  return createClient(url, serviceKey, {
    global: { fetch: (url, init) => fetch(url, {...init, signal: AbortSignal.timeout(10_000)}) },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Public (anon-key) Supabase client — safe for read-only operations
 * that are covered by RLS.
 */
export function getSupabasePublic() {
  if(runtimeMode() === 'demo') throw new Error('External database calls are disabled in demo mode.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(url, anonKey);
}
