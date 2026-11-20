/**
 * Simple Analytics events (https://docs.simpleanalytics.com/events): no cookies and no personal
 * data, only which event a click was about. The `sa_event` placeholder in the page head
 * (SimpleAnalyticsEvents.astro) queues calls until the script loads, and swallows them when an
 * ad blocker stops it, so tracking never breaks the page.
 *
 * Events:
 * - `official_link`: a click on an event's name, which opens the organiser's website
 * - `add_to_calendar`: a click that opens the "Add to calendar" list
 * - `share`: a share, with `method` native (the browser's share sheet), copy, whatsapp or email
 *
 * Each carries `event_id` and `event_name` as metadata. Event names are public data.
 */

export type Metadata = Record<string, string | number | boolean>

declare global {
  interface Window {
    sa_event?: (name: string, metadata?: Metadata) => void
  }
}

/** Sends the event `name`; does nothing when Simple Analytics isn't on the page (dev, blocked). */
export function track(name: string, metadata?: Metadata): void {
  try {
    window.sa_event?.(name, metadata)
  } catch {
    // Analytics must never break the page
  }
}

/** Labels `element` with the swim event it belongs to, for `eventMetadata`. */
export function labelEvent(element: HTMLElement, event: { id: number; name: string }): void {
  element.dataset.eventId = String(event.id)
  element.dataset.eventName = event.name.replace(/\s+/g, ' ').trim()
}

/** The swim event `element` (or the closest labelled element around it) belongs to. */
export function eventMetadata(element: Element): Metadata {
  const labelled = element.closest<HTMLElement>('[data-event-id]')
  if (!labelled) return {}
  return { event_id: Number(labelled.dataset.eventId), event_name: labelled.dataset.eventName ?? '' }
}

/** What a click on `target` should be counted as, if anything. */
export function clickEvent(target: Element): { name: string; metadata: Metadata } | null {
  const link = target.closest('a[data-track="official_link"]')
  if (link) return { name: 'official_link', metadata: eventMetadata(link) }

  // A click inside the button's shadow DOM reaches the page as a click on the element itself
  const calendar = target.closest('add-to-calendar-button')
  if (calendar) return { name: 'add_to_calendar', metadata: eventMetadata(calendar) }

  return null
}

let bound = false

/** Counts clicks on official links and calendar buttons, including ones added after load. */
export function initClickTracking(): void {
  if (bound) return
  bound = true
  // Capture, so a click is counted before anything else handles it or the page moves on
  document.addEventListener(
    'click',
    (event) => {
      const found = event.target instanceof Element ? clickEvent(event.target) : null
      if (found) track(found.name, found.metadata)
    },
    { capture: true },
  )
}
