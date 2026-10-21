import { COUNTRIES, countryCode } from './countries'
import type { SwimEvent } from './supabase'

/** Locations are stored as "City (IOC)", e.g. "Basel (SUI)". */
const LOCATION_PATTERN = /^(.+?)\s*\(([A-Z]{3})\)\s*$/
/** Some older rows use the World Aquatics form "IOC, Country, City", e.g. "HUN, Hungary, Budapest". */
const LEGACY_PATTERN = /^([A-Z]{3}),\s*.+,\s*([^,]+?)\s*$/

export type ParsedLocation = { city: string; code: string; country: string } | null

/**
 * City and country of an event, or null when they can't be told apart. The country comes
 * from the `country` column when it's set, otherwise from the code in `location`; aliases
 * such as "MCO" for Monaco are resolved either way.
 */
export function parseLocation(event: Pick<SwimEvent, 'location' | 'country'>): ParsedLocation {
  const trimmed = event.location.trim()
  const match = LOCATION_PATTERN.exec(trimmed)
  const legacy = match ? null : LEGACY_PATTERN.exec(trimmed)
  const [city, storedCode] = match ? [match[1], match[2]] : legacy ? [legacy[2], legacy[1]] : [trimmed]
  const code = countryCode(event.country) ?? countryCode(storedCode)
  return city && code ? { city, code, country: COUNTRIES[code].name } : null
}

/**
 * The location for the event lists: "Basel, Switzerland". Anything that isn't
 * in a known format with a known code is shown exactly as stored.
 */
export function listLocation(event: Pick<SwimEvent, 'location' | 'country'>): string {
  const parsed = parseLocation(event)
  return parsed ? `${parsed.city}, ${parsed.country}` : event.location
}

/** The round flag for an IOC code, or null when the country has none (or it's unknown). */
export function flagUrl(code: string): string | null {
  return COUNTRIES[code]?.iso ? `/flags/${code}.svg` : null
}
