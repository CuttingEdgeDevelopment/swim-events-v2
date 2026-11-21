/**
 * The parts every event card shares, wherever it is shown: the name (linked to the event's
 * website), the place with its flag, and the dates. Used by the home page (src/scripts/events.ts,
 * in the browser and at build time) and by the embed widget (src/scripts/embed.ts), so a new
 * event field only needs adding here.
 */
import { dateRangeSeparator, formatDateRange } from './countdown'
import { flagUrl, parseLocation } from './locations'
import { labelEvent } from './analytics'
import type { SwimEvent } from './supabase'

export function field<T extends HTMLElement = HTMLElement>(root: ParentNode, name: string): T {
  return root.querySelector<T>(`[data-field="${name}"]`)!
}

/**
 * The event name, as a link to the event website when there is one. Without a website the
 * template's empty link is removed, so no card carries a link without an address.
 */
export function fillName(root: ParentNode, event: SwimEvent): void {
  const name = field(root, 'name')
  const link = field<HTMLAnchorElement>(root, 'link')
  if (!event.link) {
    name.textContent = event.name
    link?.remove()
    return
  }

  const hint = document.createElement('span')
  hint.className = 'sr-only'
  hint.textContent = ' (opens in new tab)'
  link.href = event.link
  link.dataset.track = 'official_link'
  labelEvent(link, event)
  link.replaceChildren(event.name, hint)
  link.hidden = false
  name.remove()
}

/** A decorative round flag; the country is always named in the text next to it. */
export function flagImage(code: string): HTMLImageElement | null {
  const src = flagUrl(code)
  if (!src) return null

  const image = document.createElement('img')
  image.className = 'flag'
  image.setAttribute('src', src)
  image.setAttribute('alt', '')
  image.setAttribute('width', '18')
  image.setAttribute('height', '18')
  image.setAttribute('decoding', 'async')
  image.setAttribute('loading', 'lazy')
  image.addEventListener('error', () => image.remove())
  return image
}

/** The place text with the country's flag in front of it, when there is one. */
export function fillPlace(container: HTMLElement, event: SwimEvent, text: string): void {
  const code = parseLocation(event)?.code
  const flag = code ? flagImage(code) : null
  container.replaceChildren(...(flag ? [flag] : []), text)
}

/** "2–7 Dec 2026" as one or two `<time>` elements, each with its exact date for machines. */
export function fillDates(container: HTMLElement, event: SwimEvent): void {
  const range = formatDateRange(event.dateStart, event.dateEnd)
  const end = document.createElement('time')
  end.setAttribute('datetime', event.dateEnd.slice(0, 10))
  end.textContent = range.end

  if (!range.start) {
    container.replaceChildren(end)
    return
  }

  const start = document.createElement('time')
  start.setAttribute('datetime', event.dateStart.slice(0, 10))
  start.textContent = range.start
  container.replaceChildren(start, dateRangeSeparator(range), end)
}
