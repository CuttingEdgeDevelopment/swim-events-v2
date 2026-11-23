/**
 * The events feeds, `/events.json` and `/events.ics`: every event that hasn't ended, for clubs,
 * apps, calendar subscriptions and AI tools. Written into the built site by
 * src/integrations/prerender-events.ts, from the same events as the home page.
 */
import { parseLocation } from './locations'
import { SITE } from './structured-data'
import type { SwimEvent } from './supabase'

/** Events that haven't ended by `today` ("2026-11-21"), in date order. */
export function upcomingEvents(events: SwimEvent[], today: string): SwimEvent[] {
  return events
    .filter((event) => event.dateEnd.slice(0, 10) >= today)
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart) || a.id - b.id)
}

const eventPage = (event: SwimEvent) => `${SITE}/#event-${event.id}`

/** The JSON feed: where it comes from, when it was built, and the events. */
export function eventsJson(events: SwimEvent[], today: string, updated: string): string {
  return JSON.stringify(
    {
      source: SITE,
      description: 'Upcoming swimming events on Swim Events Calendar. Dates are whole days, local to the venue.',
      updated,
      events: upcomingEvents(events, today).map((event) => {
        const place = parseLocation(event)
        return {
          id: event.id,
          name: event.name,
          dateStart: event.dateStart.slice(0, 10),
          dateEnd: event.dateEnd.slice(0, 10),
          city: place?.city ?? null,
          country: place?.country ?? null,
          countryCode: place?.code ?? null,
          website: event.link || null,
          url: eventPage(event),
        }
      }),
    },
    null,
    2,
  )
}

/** Text in an iCalendar value: backslash, semicolon, comma and line breaks are escaped. */
const escapeText = (text: string) => text.replace(/[\\;,]/g, (char) => `\\${char}`).replace(/\r?\n/g, '\\n')

/** Lines are folded after 75 bytes, the rest continuing on a line that starts with a space. */
function fold(line: string): string {
  const encoder = new TextEncoder()
  const lines: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // Continuation lines start with a space, so they hold one byte less
    if (bytes + size > (lines.length ? 74 : 75)) {
      lines.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  lines.push(current)
  return lines.join('\r\n ')
}

const compact = (isoDate: string) => isoDate.slice(0, 10).replaceAll('-', '')

/** The day after `isoDate`: all-day events end on the day after their last day in iCalendar. */
function nextDay(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return next.toISOString().slice(0, 10).replaceAll('-', '')
}

/** The calendar feed: one all-day entry per event, to subscribe to in any calendar app. */
export function eventsIcs(events: SwimEvent[], today: string, updated: Date): string {
  // "20261123T173000Z"
  const stamp = updated.toISOString().replace(/[-:]|\.\d{3}/g, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Swim Events//Swim Events Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Swim Events',
    'X-WR-CALDESC:Upcoming swimming events from swim-events.com',
    'REFRESH-INTERVAL;VALUE=DURATION:P1D',
    'X-PUBLISHED-TTL:P1D',
  ]
  for (const event of upcomingEvents(events, today)) {
    const place = parseLocation(event)
    const where = place ? `${place.city}, ${place.country}` : (event.city ?? event.location ?? '').trim()
    lines.push(
      'BEGIN:VEVENT',
      `UID:event-${event.id}@swim-events.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(event.dateStart)}`,
      `DTEND;VALUE=DATE:${nextDay(event.dateEnd)}`,
      `SUMMARY:${escapeText(event.name)}`,
      ...(where ? [`LOCATION:${escapeText(where)}`] : []),
      `URL:${event.link || eventPage(event)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
