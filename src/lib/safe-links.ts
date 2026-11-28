// No astro: imports here: the build integration (integrations/prerender-events.ts) uses it too
import type { SwimEvent } from './supabase'

/**
 * Drops any event website that isn't a plain http(s) address, such as javascript: or data:, so a
 * bad value in the database can never become a link that runs code when someone clicks it.
 * Submissions are already checked (lib/submission.ts); this also covers events entered directly.
 */
export function safeLinks(events: SwimEvent[]): SwimEvent[] {
  return events.map((event) => (isWebLink(event.link) ? event : { ...event, link: null }))
}

function isWebLink(value: string | null): boolean {
  if (!value) return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
