/**
 * The upcoming-events widget (src/pages/embed.astro): the next few events with their countdown,
 * filled into the same card template as the home page, without the calendar and share buttons.
 */
import {
  dateRangeSeparator,
  eventProgress,
  eventTiming,
  formatDateRange,
  localToday,
  parseCalendarDate,
  toLocalDate,
} from '../lib/countdown'
import { countryCode } from '../lib/countries'
import { listLocation, parseLocation } from '../lib/locations'
import { initClickTracking, labelEvent } from '../lib/analytics'
import { field, fillDates, fillName, fillPlace } from '../lib/event-card'
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

/**
 * What the widget shows, in date order and optionally only in some countries:
 * - `live`: every event running today (ongoing or starting today), for "Happening now";
 * - `next`: when nothing is running, the next upcoming event, for the "Next up" countdown;
 * - `upcoming`: the following `limit` upcoming events, for the list.
 */
export function widgetEvents(
  events: SwimEvent[],
  { limit, countries }: EmbedOptions,
  today = localToday(),
): { live: SwimEvent[]; next: SwimEvent | null; upcoming: SwimEvent[] } {
  const shown = events
    .filter((event) => !countries.length || countries.includes(parseLocation(event)?.code ?? ''))
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart))
  const kind = (event: SwimEvent) => eventTiming(event.dateStart, event.dateEnd, today).kind
  const live = shown.filter((event) => kind(event) === 'ongoing' || kind(event) === 'today')
  const later = shown.filter((event) => kind(event) === 'upcoming')
  const next = live.length ? null : (later[0] ?? null)
  return { live, next, upcoming: later.slice(next ? 1 : 0, (next ? 1 : 0) + limit) }
}

/** The event name, linked to its website when there is one. */
function nameNode(event: SwimEvent): Node {
  if (!event.link) return document.createTextNode(event.name)
  const link = document.createElement('a')
  link.href = event.link
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.dataset.track = 'official_link'
  labelEvent(link, event)
  const hint = document.createElement('span')
  hint.className = 'sr-only'
  hint.textContent = ' (opens in new tab)'
  link.append(event.name, hint)
  return link
}

/** One line of the "Happening now" stripe: badge, name, place and which day it is. */
function liveItem(event: SwimEvent, today = localToday()): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'live-strip__item'
  const startsToday = eventTiming(event.dateStart, event.dateEnd, today).kind === 'today'
  const { day, total } = eventProgress(event.dateStart, event.dateEnd, today)

  const name = document.createElement('span')
  name.className = 'live-strip__name'
  name.append(nameNode(event))

  const details = document.createElement('span')
  details.className = 'live-strip__details'
  const when = startsToday ? 'Starts today' : total > 1 ? `Day ${day} of ${total}` : ''
  details.textContent = [listLocation(event), when].filter(Boolean).join(' · ')

  item.append(name, ' ', details)
  return item
}

/** The "Next up" box: a big countdown to the next event, then its name, place and dates. */
export type CountdownParts = { days: number; hours: number; minutes: number }

/** Whole days, hours and minutes left until `target`, never below zero. Rounds up to the next minute. */
export function countdownParts(target: Date, now: Date = new Date()): CountdownParts {
  const totalMinutes = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 60_000))
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  }
}

let countdownTimer: number | undefined

/**
 * The "Next up" box: a live countdown to midnight (the visitor's time) on the meet's first day,
 * then its name, place and dates. Calls `onStart` once the countdown reaches zero.
 */
function nextUp(container: HTMLElement, event: SwimEvent, onStart: () => void): void {
  const target = toLocalDate(parseCalendarDate(event.dateStart))

  const countdown = document.createElement('p')
  countdown.className = 'next-up__countdown'
  const units = (['days', 'hours', 'minutes'] as const).map((key) => {
    const unit = document.createElement('span')
    unit.className = 'next-up__part'
    const number = document.createElement('span')
    number.className = 'next-up__number'
    const label = document.createElement('span')
    label.className = 'next-up__unit'
    unit.append(number, label)
    countdown.append(unit)
    return { key, number, label }
  })
  const labels = { days: ['day', 'days'], hours: ['hour', 'hours'], minutes: ['min', 'min'] }

  const tick = () => {
    const parts = countdownParts(target)
    for (const { key, number, label } of units) {
      const value = parts[key]
      number.textContent = key === 'days' ? String(value) : String(value).padStart(2, '0')
      label.textContent = labels[key][value === 1 ? 0 : 1]
    }
    if (target.getTime() <= Date.now()) {
      window.clearInterval(countdownTimer)
      onStart()
    }
  }

  const name = document.createElement('h3')
  name.className = 'next-up__name'
  name.append(nameNode(event))

  const details = document.createElement('p')
  details.className = 'next-up__details'
  details.textContent = `${listLocation(event)} · ${dateText(event)}`

  container.replaceChildren(countdown, name, details)
  window.clearInterval(countdownTimer)
  tick()
  // A check every few seconds keeps the minutes exact without a timer per second
  countdownTimer = window.setInterval(tick, 5_000)
}

/** "2–7 Dec 2026" as plain text. */
function dateText(event: SwimEvent): string {
  const range = formatDateRange(event.dateStart, event.dateEnd)
  return range.start ? `${range.start}${dateRangeSeparator(range)}${range.end}` : range.end
}

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

  fillName(root, event)
  fillPlace(field(root, 'place'), event, listLocation(event))
  fillDates(field(root, 'dates'), event)

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

  if (!options.heading) {
    document.querySelectorAll('.embed__heading').forEach((heading) => heading.classList.add('sr-only'))
  }
  reportHeight()
  initClickTracking()

  try {
    const events = await fetchEvents()
    const render = () => {
      const { live, next, upcoming } = widgetEvents(events, options, localToday())
      const liveSection = document.getElementById('live')
      if (liveSection) {
        liveSection.querySelector('ul')?.replaceChildren(...live.map((event) => liveItem(event)))
        liveSection.hidden = !live.length
      }
      const nextSection = document.getElementById('next')
      if (nextSection) {
        if (next) nextUp(nextSection.querySelector('.next-up') as HTMLElement, next, render)
        else window.clearInterval(countdownTimer)
        nextSection.hidden = !next
      }
      list.replaceChildren(...upcoming.map((event) => card(template, event)))
      status.textContent = upcoming.length ? '' : 'No upcoming events right now.'
    }
    render()
  } catch (error) {
    console.error('Loading events failed:', error)
    status.textContent = 'The events couldn’t be loaded. Please try again later.'
  }
}
