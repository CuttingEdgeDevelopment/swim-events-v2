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
