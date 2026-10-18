import { COUNTRY_NAMES } from './countries'

/** Locations are stored as "City (IOC)", e.g. "Basel (SUI)". */
const LOCATION_PATTERN = /^(.+?)\s*\(([A-Z]{3})\)\s*$/

/**
 * The location for the event lists: "Basel, Switzerland". Anything that isn't
 * "City (IOC)" with a known code is shown exactly as stored.
 */
export function listLocation(location: string): string {
  const match = LOCATION_PATTERN.exec(location.trim())
  const country = match && COUNTRY_NAMES[match[2]]
  return match && country ? `${match[1]}, ${country}` : location
}
