import { isoDate, parseCalendarDate, type CalendarDate } from './countdown'
import { parseLocation } from './locations'
import type { SwimEvent } from './supabase'

/** The time periods in the "When" select; "custom" uses the From and To dates. */
export const PERIODS = ['', '7d', '30d', '3m', 'custom'] as const
export type Period = (typeof PERIODS)[number]

/**
 * The filters above the event lists. `from` and `to` are `YYYY-MM-DD` (or empty for an
 * open end) and only count when `period` is "custom".
 */
export type EventFilters = { query: string; period: Period; from: string; to: string }

export const NO_FILTERS: EventFilters = { query: '', period: '', from: '', to: '' }

export function hasFilters({ query, period }: EventFilters): boolean {
  return query.trim() !== '' || period !== ''
}

/** Lower case without accents, so "zurich" finds "Zürich" and "munchen" finds "München". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Every word of the search has to appear in the name, city or country. */
function matchesQuery(event: SwimEvent, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true

  const parsed = parseLocation(event.location)
  const haystack = normalize([event.name, event.location, parsed?.country ?? ''].join(' '))
  return words.every((word) => haystack.includes(word))
}

function addDays({ year, month, day }: CalendarDate, days: number): CalendarDate {
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

/** The day before the same date `months` later, so 20 Oct + 3 months ends on 19 Jan. */
function addMonths(today: CalendarDate, months: number): CalendarDate {
  const target = new Date(Date.UTC(today.year, today.month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  const end = { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: Math.min(today.day, lastDay) }
  return addDays(end, -1)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** First and last day of the selected period as `YYYY-MM-DD`, empty for an open end. */
export function periodRange({ period, from, to }: EventFilters, today: CalendarDate): { from: string; to: string } {
  switch (period) {
    case '7d':
      return { from: isoDate(today), to: isoDate(addDays(today, 6)) }
    case '30d':
      return { from: isoDate(today), to: isoDate(addDays(today, 29)) }
    case '3m':
      return { from: isoDate(today), to: isoDate(addMonths(today, 3)) }
    case 'custom':
      return { from: ISO_DATE.test(from) ? from : '', to: ISO_DATE.test(to) ? to : '' }
    default:
      return { from: '', to: '' }
  }
}

/** Events that take place on at least one day of the range, so running events count too. */
function matchesRange(event: SwimEvent, range: { from: string; to: string }): boolean {
  const start = isoDate(parseCalendarDate(event.dateStart))
  const end = isoDate(parseCalendarDate(event.dateEnd))
  return (!range.from || end >= range.from) && (!range.to || start <= range.to)
}

export function matchesFilters(event: SwimEvent, filters: EventFilters, today: CalendarDate): boolean {
  return matchesQuery(event, filters.query) && matchesRange(event, periodRange(filters, today))
}

function toPeriod(value: string | null): Period {
  return value && (PERIODS as readonly string[]).includes(value) ? (value as Period) : ''
}

/** Filters from the page URL (`?q=basel&when=30d`), so a filtered list can be shared. */
export function filtersFromUrl(url: URL): EventFilters {
  const params = url.searchParams
  return {
    query: params.get('q') ?? '',
    period: toPeriod(params.get('when')),
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
}

export function filtersToUrl(url: URL, { query, period, from, to }: EventFilters): URL {
  const next = new URL(url)
  const set = (name: string, value: string) =>
    value ? next.searchParams.set(name, value) : next.searchParams.delete(name)
  set('q', query.trim())
  set('when', period)
  set('from', period === 'custom' ? from : '')
  set('to', period === 'custom' ? to : '')
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
