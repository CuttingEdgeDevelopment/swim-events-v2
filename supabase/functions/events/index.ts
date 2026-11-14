// Public list of events for swim-events.com. The `events` table is closed to visitors, so this
// function is the only way the site (and later the widgets) load events.
//
// - Answers only the sites in origins.ts; other origins get 403 and no CORS headers, so other
//   websites can't use the data in their visitors' browsers.
// - Rate limit per visitor (hashed IP), set in the `settings` table; events_rate_limit = 0 turns it off.
// - verify_jwt is off (supabase/config.toml): visitors aren't signed in.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { clientIp, hashIp, isAllowedOrigin } from './origins.ts'

/** The fields the site shows. Nothing else leaves the database. */
const FIELDS = 'id, name, city, country, dateStart, dateEnd, link'
/** How long a browser may reuse a response. "Update events" bypasses it. */
const MAX_AGE_SECONDS = 120

const env = (name: string): string => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing secret ${name}`)
  return value
}

const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  Vary: 'Origin',
})

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

/** True when the visitor is within the limit. A failing check lets the request through. */
async function withinLimit(request: Request): Promise<boolean> {
  const key = await hashIp(clientIp(request.headers), env('SUPABASE_SERVICE_ROLE_KEY'))
  const { data, error } = await supabase.rpc('events_rate_check', { visitor_key: key })
  if (error) {
    console.error('Rate limit check failed, letting the request through:', error.message)
    return true
  }
  return data !== false
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  if (!isAllowedOrigin(origin)) return json({ error: 'origin_not_allowed' }, 403)

  const cors = corsHeaders(origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors)

  if (!(await withinLimit(request))) {
    console.warn('Rate limited a visitor', { origin })
    return json({ error: 'rate_limited' }, 429, { ...cors, 'Retry-After': '60' })
  }

  const { data, error } = await supabase.from('events').select(FIELDS).order('dateStart', { ascending: true })
  if (error) {
    console.error('Loading events failed:', error.message)
    return json({ error: 'events_unavailable' }, 500, cors)
  }
  return json(data ?? [], 200, { ...cors, 'Cache-Control': `private, max-age=${MAX_AGE_SECONDS}` })
})
