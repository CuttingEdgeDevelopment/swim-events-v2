import { COUNTRY_NAMES } from './countries'

/** Locations are stored as "City (IOC)", e.g. "Basel (SUI)". */
const LOCATION_PATTERN = /^(.+?)\s*\(([A-Z]{3})\)\s*$/
/** Some older rows use the World Aquatics form "IOC, Country, City", e.g. "HUN, Hungary, Budapest". */
const LEGACY_PATTERN = /^([A-Z]{3}),\s*.+,\s*([^,]+?)\s*$/

/** IOC code of the home country: "Switzerland" and "Outside Switzerland" in the filters. */
export const HOME_COUNTRY = 'SUI'

export type ParsedLocation = { city: string; code: string; country: string } | null

/** City and country of a stored location, or null when it isn't in a known format. */
export function parseLocation(location: string): ParsedLocation {
  const trimmed = location.trim()
  const match = LOCATION_PATTERN.exec(trimmed)
  const legacy = match ? null : LEGACY_PATTERN.exec(trimmed)
  const [city, code] = match ? [match[1], match[2]] : legacy ? [legacy[2], legacy[1]] : []
  const country = code && COUNTRY_NAMES[code]
  return city && code && country ? { city, code, country } : null
}

/**
 * The location for the event lists: "Basel, Switzerland". Anything that isn't
 * in a known format with a known code is shown exactly as stored.
 */
export function listLocation(location: string): string {
  const parsed = parseLocation(location)
  return parsed ? `${parsed.city}, ${parsed.country}` : location
}
