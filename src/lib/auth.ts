/**
 * The signed-in Supabase client for /submit and /account. The home page keeps using the
 * session-free client in `supabase.ts`, so it never touches sign-in state.
 */
import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_KEY, PUBLIC_SUPABASE_URL } from 'astro:env/client'

export const auth = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // The sign-in link is handled in sign-in.ts, so a failed link can be explained
    detectSessionInUrl: false,
    // The link only works in the browser that asked for the code
    flowType: 'pkce',
  },
})

/**
 * Turnstile site key. The production key only works on swim-events.com; everywhere else
 * Cloudflare's always-passing test key is used, which local Supabase (captcha off) accepts.
 */
export const TURNSTILE_SITE_KEY =
  typeof location !== 'undefined' && location.hostname.endsWith('swim-events.com')
    ? '0x4AAAAAAFkcSXkh4YjCr6O-'
    : '1x00000000000000000000AA'

export type Profile = {
  id: string
  display_name: string | null
  organisation: string | null
  terms_accepted_at: string | null
  level: string
  blocked: boolean
}

/** The signed-in user's profile, recording the terms acceptance from the sign-in step. */
export async function loadProfile(): Promise<Profile | null> {
  const { data: profile, error } = await auth.from('profiles').select('*').maybeSingle<Profile>()
  if (error) throw error
  if (profile && !profile.terms_accepted_at) {
    // Signing in always needs the terms box ticked, so the first sign-in is the acceptance
    const accepted = new Date().toISOString()
    await auth.from('profiles').update({ terms_accepted_at: accepted }).eq('id', profile.id)
    profile.terms_accepted_at = accepted
  }
  return profile
}
