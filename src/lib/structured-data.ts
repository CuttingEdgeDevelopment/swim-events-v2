/**
 * Structured data (schema.org JSON-LD) that tells search engines and AI tools what the site is
 * and which events it lists. The site part is on every page (src/layouts/DefaultLayout.astro);
 * the events are written into the home page at build time (src/integrations/prerender-events.ts).
 * Event pages can reuse `eventData` later.
 */
import { COUNTRIES } from './countries'
import { parseLocation } from './locations'
import type { SwimEvent } from './supabase'

export const SITE = 'https://swim-events.com'
const ORGANIZATION_ID = `${SITE}/#organization`
const WEBSITE_ID = `${SITE}/#website`

type Thing = Record<string, unknown>

/** Swim Events as an organisation and as a website, for the site name and logo in search results. */
export function siteData(sameAs: string[] = []): Thing {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: 'Swim Events',
        url: `${SITE}/`,
        logo: `${SITE}/apple-touch-icon.png`,
        ...(sameAs.length ? { sameAs } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: 'Swim Events',
        alternateName: 'Swim Events Calendar',
        url: `${SITE}/`,
        inLanguage: 'en',
        publisher: { '@id': ORGANIZATION_ID },
      },
    ],
  }
}

/** Where the event takes place: the city with its country, or the place as stored. */
function place(event: SwimEvent): Thing {
  const parsed = parseLocation(event)
  if (!parsed) {
    const text = (event.city ?? event.location ?? '').trim()
    return { '@type': 'Place', name: text, address: text }
  }
  return {
    '@type': 'Place',
    name: `${parsed.city}, ${parsed.country}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: parsed.city,
      // ISO code where there is one (Chinese Taipei has none), else the country's name
      addressCountry: COUNTRIES[parsed.code]?.iso?.toUpperCase() ?? parsed.country,
    },
  }
}

/** One event: name, all-day dates, place and its official website. */
export function eventData(event: SwimEvent): Thing {
  return {
    '@type': 'Event',
    '@id': `${SITE}/#event-${event.id}`,
    name: event.name,
    startDate: event.dateStart.slice(0, 10),
    endDate: event.dateEnd.slice(0, 10),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place(event),
    url: event.link || `${SITE}/#event-${event.id}`,
  }
}

/** Every event that hasn't ended by `today` ("2026-11-21"); search engines ignore past ones. */
export function eventsData(events: SwimEvent[], today: string): Thing {
  return {
    '@context': 'https://schema.org',
    '@graph': events.filter((event) => event.dateEnd.slice(0, 10) >= today).map(eventData),
  }
}

/** JSON for a `<script type="application/ld+json">`, safe against a `</script>` in an event name. */
export function jsonLd(data: Thing): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
