/**
 * The upcoming-events widget (src/pages/embed.astro): the next few events with their countdown,
 * filled into the same card template as the home page, without the calendar and share buttons.
 */
import { dateRangeSeparator, eventTiming, formatDateRange, localToday } from '../lib/countdown'
import { countryCode } from '../lib/countries'
import { flagUrl, listLocation, parseLocation } from '../lib/locations'
import { fetchEvents, type SwimEvent } from '../lib/supabase'

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20

export type EmbedOptions = { limit: number; countries: string[]; heading: boolean }

/** Reads `?limit=`, `?country=` and `?heading=` with safe defaults. */
export function embedOptions(params: URLSearchParams): EmbedOptions {
  const limit = Number.parseInt(params.get('limit') ?? '', 10)
  const countries = (params.get('country') ?? '')
    .split(',')
    .map((code) => countryCode(code.trim()))
    .filter((code): code is string => !!code)
  return {
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), MAX_LIMIT) : DEFAULT_LIMIT,
    countries,
    heading: params.get('heading') !== '0',
  }
}

/** Ongoing and upcoming events in date order, optionally only in some countries. */
export function nextEvents(events: SwimEvent[], { limit, countries }: EmbedOptions, today = localToday()): SwimEvent[] {
  return events
    .filter((event) => eventTiming(event.dateStart, event.dateEnd, today).kind !== 'past')
    .filter((event) => !countries.length || countries.includes(parseLocation(event)?.code ?? ''))
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart))
    .slice(0, limit)
}

const field = <T extends HTMLElement = HTMLElement>(root: ParentNode, name: string) =>
  root.querySelector<T>(`[data-field="${name}"]`) as T

function card(template: HTMLTemplateElement, event: SwimEvent): DocumentFragment {
  const root = template.content.cloneNode(true) as DocumentFragment
  const timing = eventTiming(event.dateStart, event.dateEnd, localToday())

  // The widget's list sits under an h2, so the names are h3
  const oldHeading = root.querySelector('h4')
  if (oldHeading) {
    const heading = document.createElement('h3')
    heading.className = oldHeading.className
    heading.replaceChildren(...oldHeading.childNodes)
    oldHeading.replaceWith(heading)
  }

  const name = field(root, 'name')
  if (event.link) {
    const link = field<HTMLAnchorElement>(root, 'link')
    const hint = document.createElement('span')
    hint.className = 'sr-only'
    hint.textContent = ' (opens in new tab)'
    link.href = event.link
    link.replaceChildren(event.name, hint)
    link.hidden = false
    name.remove()
  } else {
    name.textContent = event.name
  }

  const place = field(root, 'place')
  const code = parseLocation(event)?.code
  const src = code ? flagUrl(code) : null
  const parts: (Node | string)[] = []
  if (src) {
    const flag = document.createElement('img')
    Object.assign(flag, { className: 'flag', src, alt: '', width: 18, height: 18, decoding: 'async' })
    parts.push(flag)
  }
  parts.push(listLocation(event))
  place.replaceChildren(...parts)

  const range = formatDateRange(event.dateStart, event.dateEnd)
  const end = document.createElement('time')
  end.dateTime = event.dateEnd.slice(0, 10)
  end.textContent = range.end
  if (range.start) {
    const start = document.createElement('time')
    start.dateTime = event.dateStart.slice(0, 10)
    start.textContent = range.start
    field(root, 'dates').replaceChildren(start, dateRangeSeparator(range), end)
  } else {
    field(root, 'dates').replaceChildren(end)
  }

  field(root, 'actions').remove()

  const badge = field(root, 'badge')
  switch (timing.kind) {
    case 'ongoing':
      badge.textContent = 'Ongoing'
      badge.className = 'badge badge--live event-card__badge'
      badge.hidden = false
      field(root, 'countdown').remove()
      break
    case 'today':
      badge.textContent = 'Starts today'
      badge.hidden = false
      field(root, 'countdown').remove()
      break
    case 'upcoming':
      field(root, 'number').textContent = String(timing.daysToGo)
      field(root, 'unit').textContent = timing.daysToGo === 1 ? 'day to go' : 'days to go'
      if (timing.daysToGo === 1) {
        badge.textContent = 'Tomorrow'
        badge.hidden = false
      }
      break
  }
  return root
}

/** Tells the page around the iframe how tall the widget is, so it can drop the scrollbar. */
function reportHeight(): void {
  if (window.parent === window) return
  const send = () =>
    window.parent.postMessage(
      { type: 'swim-events:height', height: Math.ceil(document.body.getBoundingClientRect().height) },
      '*',
    )
  new ResizeObserver(send).observe(document.body)
  send()
}

export async function initEmbed(): Promise<void> {
  const options = embedOptions(new URLSearchParams(location.search))
  const list = document.getElementById('embed-events')
  const status = document.getElementById('embed-status')
  const template = document.getElementById('event-card-template') as HTMLTemplateElement | null
  if (!list || !status || !template) return

  if (!options.heading) document.getElementById('embed-heading')?.classList.add('sr-only')
  reportHeight()

  try {
    const events = nextEvents(await fetchEvents(), options)
    list.replaceChildren(...events.map((event) => card(template, event)))
    status.textContent = events.length ? '' : 'No upcoming events right now.'
  } catch (error) {
    console.error('Loading events failed:', error)
    status.textContent = 'The events couldn’t be loaded. Please try again later.'
  }
}
