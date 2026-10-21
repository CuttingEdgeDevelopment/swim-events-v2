import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_KEY, PUBLIC_SUPABASE_URL } from 'astro:env/client'

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

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** All events, ordered by start date. */
export async function fetchEvents(): Promise<SwimEvent[]> {
  const { data, error } = await supabase.from('events').select('*').order('dateStart', { ascending: true })

  if (error) throw error
  return data ?? []
}
