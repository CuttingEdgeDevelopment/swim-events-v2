import { COUNTRIES, countryCode } from './countries'
import type { SwimEvent } from './supabase'

/** Locations are stored as "City (IOC)", e.g. "Basel (SUI)". */
const LOCATION_PATTERN = /^(.+?)\s*\(([A-Z]{3})\)\s*$/
/** Some older rows use the World Aquatics form "IOC, Country, City", e.g. "HUN, Hungary, Budapest". */
const LEGACY_PATTERN = /^([A-Z]{3}),\s*.+,\s*([^,]+?)\s*$/

export type ParsedLocation = { city: string; code: string; country: string } | null

type Place = Pick<SwimEvent, 'city' | 'country' | 'location'>

/**
 * City and country of an event, or null when they can't be told apart. Reads the `city`
 * and `country` columns, and falls back to the older `location` ("Basel (SUI)") while it
 * exists; aliases such as "MCO" for Monaco are resolved either way.
 */
export function parseLocation(event: Place): ParsedLocation {
  const trimmed = (event.city ?? event.location ?? '').trim()
  const match = LOCATION_PATTERN.exec(trimmed)
  const legacy = match ? null : LEGACY_PATTERN.exec(trimmed)
  const [city, storedCode] = match ? [match[1], match[2]] : legacy ? [legacy[2], legacy[1]] : [trimmed]
  const code = countryCode(event.country) ?? countryCode(storedCode)
  return city && code ? { city, code, country: COUNTRIES[code].name } : null
}

/** The place as stored, for anything that can't be parsed. */
function rawPlace(event: Place): string {
  return (event.city ?? event.location ?? '').trim()
}

/**
 * The location for the event lists: "Basel, Switzerland". Anything that isn't
 * in a known format with a known code is shown exactly as stored.
 */
export function listLocation(event: Place): string {
  const parsed = parseLocation(event)
  return parsed ? `${parsed.city}, ${parsed.country}` : rawPlace(event)
}

/** The location on the featured cards, with the code: "Bern (SUI)". */
export function shortLocation(event: Place): string {
  const parsed = parseLocation(event)
  return parsed ? `${parsed.city} (${parsed.code})` : rawPlace(event)
}

/** The round flag for an IOC code, or null when the country has none (or it's unknown). */
export function flagUrl(code: string): string | null {
  return COUNTRIES[code]?.iso ? `/flags/${code}.svg` : null
}
