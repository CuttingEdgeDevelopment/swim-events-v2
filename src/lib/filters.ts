import { HOME_COUNTRY, parseLocation } from './locations'
import type { SwimEvent } from './supabase'

/**
 * The filters above the event lists. `country` is "" for all countries, "home" for
 * Switzerland only, "abroad" for everywhere else, or one IOC code.
 */
export type EventFilters = { query: string; country: string }

export const NO_FILTERS: EventFilters = { query: '', country: '' }

export function hasFilters({ query, country }: EventFilters): boolean {
  return query.trim() !== '' || country !== ''
}

/** Lower case without accents, so "zurich" finds "Zürich" and "munchen" finds "München". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function matchesCountry(event: SwimEvent, country: string): boolean {
  if (!country) return true
  const code = parseLocation(event.location)?.code
  if (country === 'home') return code === HOME_COUNTRY
  if (country === 'abroad') return code !== HOME_COUNTRY
  return code === country
}

/** Every word of the search has to appear in the name, city or country. */
function matchesQuery(event: SwimEvent, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true

  const parsed = parseLocation(event.location)
  const haystack = normalize([event.name, event.location, parsed?.country ?? ''].join(' '))
  return words.every((word) => haystack.includes(word))
}

export function matchesFilters(event: SwimEvent, filters: EventFilters): boolean {
  return matchesCountry(event, filters.country) && matchesQuery(event, filters.query)
}

/** The countries events take place in, by name, for the country select. */
export function eventCountries(events: SwimEvent[]): { code: string; country: string }[] {
  const countries = new Map<string, string>()
  for (const event of events) {
    const parsed = parseLocation(event.location)
    if (parsed && parsed.code !== HOME_COUNTRY) countries.set(parsed.code, parsed.country)
  }
  return [...countries]
    .map(([code, country]) => ({ code, country }))
    .sort((a, b) => a.country.localeCompare(b.country, 'en'))
}

/** Filters from the page URL (`?q=basel&country=abroad`), so a filtered list can be shared. */
export function filtersFromUrl(url: URL): EventFilters {
  return { query: url.searchParams.get('q') ?? '', country: url.searchParams.get('country') ?? '' }
}

export function filtersToUrl(url: URL, { query, country }: EventFilters): URL {
  const next = new URL(url)
  if (query.trim()) next.searchParams.set('q', query.trim())
  else next.searchParams.delete('q')
  if (country) next.searchParams.set('country', country)
  else next.searchParams.delete('country')
  return next
}

/** Consecutive events grouped under a label, e.g. by month or year. Keeps the order. */
export function groupBy<T>(items: T[], label: (item: T) => string): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = []
  for (const item of items) {
    const key = label(item)
    const last = groups.at(-1)
    if (last && last.label === key) last.items.push(item)
    else groups.push({ label: key, items: [item] })
  }
  return groups
}
