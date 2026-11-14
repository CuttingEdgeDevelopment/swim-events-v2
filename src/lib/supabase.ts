import { PUBLIC_SUPABASE_URL } from 'astro:env/client'

export type SwimEvent = {
  id: number
  name: string
  /** "Basel"; undefined until the `city` column exists. */
  city?: string | null
  /** IOC code, a key of the `countries` table. */
  country?: string | null
  /** The older "Basel (SUI)", replaced by `city` and `country`; undefined once dropped. */
  location?: string | null
  dateStart: string
  dateEnd: string
  link: string | null
}

/** The `events` Edge Function; the table itself is closed to visitors. */
const EVENTS_URL = `${PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/events`

/** Thrown when loading events fails; `status` is 429 when the visitor hit the rate limit. */
export class EventsError extends Error {
  constructor(readonly status: number) {
    super(status === 429 ? 'Too many requests, try again shortly' : `Loading events failed (${status})`)
  }
}

/**
 * All events, ordered by start date. The browser may reuse a response for two minutes;
 * `fresh` skips that, for "Update events".
 */
export async function fetchEvents({ fresh = false }: { fresh?: boolean } = {}): Promise<SwimEvent[]> {
  const response = await fetch(EVENTS_URL, { cache: fresh ? 'no-cache' : 'default' })
  if (!response.ok) throw new EventsError(response.status)
  return (await response.json()) as SwimEvent[]
}
