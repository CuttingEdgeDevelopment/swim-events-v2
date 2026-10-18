/**
 * Date helpers for the countdowns.
 *
 * Events are stored as calendar dates (`YYYY-MM-DD`) without a time or time zone,
 * and "today" is the visitor's local date. All comparisons work on calendar days
 * only, never on timestamps, so results don't shift by a day around midnight UTC
 * or across daylight saving changes.
 */

const MS_PER_DAY = 86_400_000

export type CalendarDate = { year: number; month: number; day: number }

/** Parse `YYYY-MM-DD` (anything after the date part, such as a time, is ignored). */
export function parseCalendarDate(value: string): CalendarDate {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return { year, month, day }
}

/** The visitor's local date. */
export function localToday(now: Date = new Date()): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
}

function dayNumber({ year, month, day }: CalendarDate): number {
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return dayNumber(to) - dayNumber(from)
}

/** A calendar date as `YYYY-MM-DD`, for `<time datetime>`. */
export function isoDate({ year, month, day }: CalendarDate): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** A calendar date as a local `Date` at midnight, for formatting only. */
export function toLocalDate({ year, month, day }: CalendarDate): Date {
  return new Date(year, month - 1, day)
}

export type EventTiming =
  { kind: 'upcoming'; daysToGo: number } | { kind: 'today' } | { kind: 'ongoing' } | { kind: 'past'; daysAgo: number }

/** Where an event stands relative to `today`. */
export function eventTiming(dateStart: string, dateEnd: string, today: CalendarDate): EventTiming {
  const daysToStart = daysBetween(today, parseCalendarDate(dateStart))
  const daysToEnd = daysBetween(today, parseCalendarDate(dateEnd))

  if (daysToEnd < 0) return { kind: 'past', daysAgo: -daysToEnd }
  if (daysToStart < 0) return { kind: 'ongoing' }
  if (daysToStart === 0) return { kind: 'today' }
  return { kind: 'upcoming', daysToGo: daysToStart }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type DateRangeText = { start: string | null; end: string }

/**
 * A compact, day-month-year date range: "19 Oct 2026", "2–7 Dec 2026",
 * "28 Nov – 3 Dec 2026" or "30 Dec 2026 – 2 Jan 2027". `start` is null for
 * one-day events; otherwise the range reads `${start}–${end}` (or with spaces
 * around the dash when the start carries a month, see `dateRangeSeparator`).
 */
export function formatDateRange(dateStart: string, dateEnd: string): DateRangeText {
  const start = parseCalendarDate(dateStart)
  const end = parseCalendarDate(dateEnd)
  const endText = `${end.day} ${MONTHS[end.month - 1]} ${end.year}`

  if (daysBetween(start, end) <= 0) return { start: null, end: endText }
  if (start.year !== end.year) return { start: `${start.day} ${MONTHS[start.month - 1]} ${start.year}`, end: endText }
  if (start.month !== end.month) return { start: `${start.day} ${MONTHS[start.month - 1]}`, end: endText }
  return { start: String(start.day), end: endText }
}

/** "–" between plain day numbers ("2–7 Dec"), " – " when the start has a month. */
export function dateRangeSeparator({ start }: DateRangeText): string {
  return start && start.includes(' ') ? ' – ' : '–'
}

/** Which day of a running event `today` is, and how many days it lasts in total. */
export function eventProgress(dateStart: string, dateEnd: string, today: CalendarDate): { day: number; total: number } {
  const start = parseCalendarDate(dateStart)
  return {
    day: daysBetween(start, today) + 1,
    total: daysBetween(start, parseCalendarDate(dateEnd)) + 1,
  }
}
