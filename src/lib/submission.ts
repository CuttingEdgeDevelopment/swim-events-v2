/**
 * Rules and messages for the submit form. The database checks the same rules again
 * (see supabase/migrations/20261025000000_event_submissions.sql), so these are only
 * here to give quick, friendly feedback.
 */
import { daysBetween, isoDate, parseCalendarDate, type CalendarDate } from './countdown'
import { parseLocation } from './locations'
import type { SwimEvent } from './supabase'

export const CONTACT_EMAIL = 'info@proswimworkouts.com'

/** The first day must be at least this many days after today, in the visitor's own date. */
export const MIN_DAYS_AHEAD = 3
export const MAX_YEARS_AHEAD = 3
export const MAX_EVENT_DAYS = 31
export const NOTE_MAX = 1000

export type SubmissionFields = {
  name: string
  city: string
  country: string
  dateStart: string
  dateEnd: string
  link: string
  note: string
  role: string
  organiser: boolean
}

export type FieldName = keyof SubmissionFields

export type FieldError = { field: FieldName; message: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "25 Oct 2026" */
export function shortDate(value: string): string {
  const { year, month, day } = parseCalendarDate(value)
  return `${day} ${MONTHS[month - 1]} ${year}`
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }
}

/** The earliest first day the form accepts, as YYYY-MM-DD. */
export function earliestStart(today: CalendarDate): string {
  return isoDate(addDays(today, MIN_DAYS_AHEAD))
}

/** The latest first day the form accepts, as YYYY-MM-DD. */
export function latestStart(today: CalendarDate): string {
  return isoDate({ ...today, year: today.year + MAX_YEARS_AHEAD })
}

/** The latest last day for an event starting on `dateStart`. */
export function latestEnd(dateStart: string): string {
  return isoDate(addDays(parseCalendarDate(dateStart), MAX_EVENT_DAYS))
}

export function tooSoonMessage(today: CalendarDate): string {
  return `The first day must be at least ${MIN_DAYS_AHEAD} days from today (${shortDate(earliestStart(today))} or later)`
}

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/

/** "example.com/meet" becomes "https://example.com/meet"; empty stays empty. */
export function normaliseLink(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function isWebLink(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.')
  } catch {
    return false
  }
}

/** Problems with a new event, in the order of the fields on the form. */
export function validateSubmission(fields: SubmissionFields, today: CalendarDate): FieldError[] {
  const errors: FieldError[] = []
  const name = fields.name.trim()
  const city = fields.city.trim()
  const link = normaliseLink(fields.link)

  if (!name) errors.push({ field: 'name', message: 'Enter the event name' })
  else if (name.length < 3) errors.push({ field: 'name', message: 'The event name must be at least 3 characters' })
  else if (name.length > 120) errors.push({ field: 'name', message: 'The event name must be 120 characters or fewer' })

  if (!city) errors.push({ field: 'city', message: 'Enter the city' })
  else if (city.length > 80) errors.push({ field: 'city', message: 'The city must be 80 characters or fewer' })

  if (!fields.country) errors.push({ field: 'country', message: 'Choose the country' })

  const startValid = VALID_DATE.test(fields.dateStart)
  if (!fields.dateStart) errors.push({ field: 'dateStart', message: 'Enter the first day' })
  else if (!startValid) errors.push({ field: 'dateStart', message: 'Enter the first day as a date, e.g. 14/11/2026' })
  else if (fields.dateStart < earliestStart(today)) errors.push({ field: 'dateStart', message: tooSoonMessage(today) })
  else if (fields.dateStart > latestStart(today)) {
    errors.push({ field: 'dateStart', message: `The first day must be within ${MAX_YEARS_AHEAD} years from today` })
  }

  if (!fields.dateEnd) errors.push({ field: 'dateEnd', message: 'Enter the last day' })
  else if (!VALID_DATE.test(fields.dateEnd)) {
    errors.push({ field: 'dateEnd', message: 'Enter the last day as a date, e.g. 15/11/2026' })
  } else if (startValid && fields.dateEnd < fields.dateStart) {
    errors.push({ field: 'dateEnd', message: 'The last day can’t be before the first day' })
  } else if (startValid && fields.dateEnd > latestEnd(fields.dateStart)) {
    errors.push({
      field: 'dateEnd',
      message: `The last day must be at most ${MAX_EVENT_DAYS} days after the first day`,
    })
  }

  if (link && (!isWebLink(link) || link.length > 500)) {
    errors.push({ field: 'link', message: 'Enter the event website as a web address, e.g. https://example.com' })
  }

  if (fields.note.length > NOTE_MAX) {
    errors.push({ field: 'note', message: `The note must be ${NOTE_MAX.toLocaleString('en-GB')} characters or fewer` })
  }

  errors.push(...validateOrganiser(fields))
  return errors
}

/** The two organiser fields, which a claim needs as well. */
export function validateOrganiser(fields: Pick<SubmissionFields, 'role' | 'organiser'>): FieldError[] {
  const errors: FieldError[] = []
  const role = fields.role.trim()
  if (!role) errors.push({ field: 'role', message: 'Enter your role, e.g. Meet director, SC Basel' })
  else if (role.length < 2) errors.push({ field: 'role', message: 'Your role must be at least 2 characters' })
  else if (role.length > 120) errors.push({ field: 'role', message: 'Your role must be 120 characters or fewer' })

  if (!fields.organiser) {
    errors.push({ field: 'organiser', message: 'Confirm that you organise this event or act for its organiser' })
  }
  return errors
}

/** Listed events in the same country whose dates overlap, for "Is it one of these?". */
export function possibleDuplicates(
  events: SwimEvent[],
  country: string,
  dateStart: string,
  dateEnd: string,
): SwimEvent[] {
  if (!country || !VALID_DATE.test(dateStart)) return []
  const end = VALID_DATE.test(dateEnd) && dateEnd >= dateStart ? dateEnd : dateStart
  return events.filter(
    (event) => parseLocation(event)?.code === country && event.dateStart <= end && event.dateEnd >= dateStart,
  )
}

/** Whether a listed event can still be claimed: not over yet. */
export function isClaimable(event: SwimEvent, today: CalendarDate): boolean {
  return daysBetween(today, parseCalendarDate(event.dateEnd)) >= 0
}

/**
 * What went wrong when the database refused a submission. The check trigger raises
 * short codes as the message; `field` points the message at a form field.
 */
export type SendProblem =
  | { kind: 'field'; field: FieldName; message: string }
  | { kind: 'message'; message: string }
  | { kind: 'closed' | 'blocked' | 'waiting' | 'signed-out' | 'duplicate' }

type DatabaseError = { code?: string; message?: string; status?: number } | null

export function sendProblem(error: DatabaseError, today: CalendarDate): SendProblem {
  const code = error?.code ?? ''
  const message = error?.message ?? ''

  // a retry of a submission that already arrived
  if (code === '23505') return { kind: 'duplicate' }
  if (code === 'PGRST301' || code === 'PGRST303' || error?.status === 401 || /jwt/i.test(message)) {
    return { kind: 'signed-out' }
  }

  switch (message) {
    case 'submissions_closed':
      return { kind: 'closed' }
    case 'account_blocked':
      return { kind: 'blocked' }
    case 'too_many_waiting':
      return { kind: 'waiting' }
    case 'daily_limit':
      return {
        kind: 'message',
        message: 'You’ve reached today’s limit for sending events. You can send more tomorrow.',
      }
    case 'date_too_soon':
      return { kind: 'field', field: 'dateStart', message: tooSoonMessage(today) }
    case 'date_too_far':
      return {
        kind: 'field',
        field: 'dateStart',
        message: `The first day must be within ${MAX_YEARS_AHEAD} years from today`,
      }
    case 'event_not_claimable':
      return { kind: 'message', message: 'This event can’t be claimed any more, because it’s over or was removed.' }
    case 'already_owner':
      return { kind: 'message', message: 'This event is already linked to your account.' }
    case 'claim_waiting':
      return { kind: 'message', message: 'You’ve already claimed this event. Your claim is waiting for review.' }
    case 'no_profile':
      return {
        kind: 'message',
        message: `Your account isn’t set up completely. Sign out and in again, or write to ${CONTACT_EMAIL}.`,
      }
  }

  // foreign key: an unknown country
  if (code === '23503') return { kind: 'field', field: 'country', message: 'Choose the country from the list' }
  if (!code && !error?.status) {
    return { kind: 'message', message: 'We couldn’t reach the server. Check your connection and try again.' }
  }
  return {
    kind: 'message',
    message: `Something went wrong and the event wasn’t sent. Try again, or write to ${CONTACT_EMAIL}.`,
  }
}
