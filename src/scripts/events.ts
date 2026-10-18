import {
  dateRangeSeparator,
  eventTiming,
  formatDateRange,
  isoDate,
  localToday,
  toLocalDate,
  type CalendarDate,
} from '../lib/countdown'
import { listLocation } from '../lib/locations'
import { fetchEvents, type SwimEvent } from '../lib/supabase'

const LOCALE = 'en-US'
// Day-month-year, as in the design ("18 October 2026")
const headerDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' })
const time = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })

let events: SwimEvent[] = []

function field<T extends HTMLElement = HTMLElement>(root: Element | DocumentFragment, name: string): T {
  return root.querySelector<T>(`[data-field="${name}"]`)!
}

function setStatus(state: 'loading' | 'ready' | 'error', text: string): void {
  const status = document.getElementById('events-status')
  if (!status) return

  status.dataset.state = state
  field(status, 'text').textContent = text
}

function renderToday(today: CalendarDate): void {
  const container = document.getElementById('today')
  if (!container) return

  const date = toLocalDate(today)
  const dateField = field<HTMLTimeElement>(container, 'date')
  field(container, 'weekday').textContent = weekday.format(date)
  dateField.textContent = headerDate.format(date)
  dateField.dateTime = isoDate(today)
  container.hidden = false
}

/** "2–7 Dec 2026" as one or two `<time>` elements. */
function fillDates(container: HTMLElement, event: SwimEvent): void {
  const range = formatDateRange(event.dateStart, event.dateEnd)
  const end = document.createElement('time')
  end.dateTime = event.dateEnd.slice(0, 10)
  end.textContent = range.end

  if (!range.start) {
    container.replaceChildren(end)
    return
  }

  const start = document.createElement('time')
  start.dateTime = event.dateStart.slice(0, 10)
  start.textContent = range.start
  container.replaceChildren(start, dateRangeSeparator(range), end)
}

/** The event name, as a link to the event website when there is one. */
function fillName(root: DocumentFragment, event: SwimEvent): void {
  const name = field(root, 'name')
  if (!event.link) {
    name.textContent = event.name
    return
  }

  const link = field<HTMLAnchorElement>(root, 'link')
  const hint = document.createElement('span')
  hint.className = 'sr-only'
  hint.textContent = ' (opens in new tab)'
  link.href = event.link
  link.replaceChildren(event.name, hint)
  link.hidden = false
  name.remove()
}

function renderCard(template: HTMLTemplateElement, event: SwimEvent, today: CalendarDate): DocumentFragment {
  const card = template.content.cloneNode(true) as DocumentFragment
  const timing = eventTiming(event.dateStart, event.dateEnd, today)

  fillName(card, event)
  field(card, 'place').textContent = listLocation(event.location)
  fillDates(field(card, 'dates'), event)

  const badge = field(card, 'badge')
  const number = field(card, 'number')
  const unit = field(card, 'unit')

  switch (timing.kind) {
    case 'ongoing':
      badge.textContent = 'Ongoing'
      badge.className = 'badge badge--live event-card__badge'
      badge.hidden = false
      field(card, 'countdown').remove()
      break
    case 'today':
      badge.textContent = 'Starts today'
      badge.hidden = false
      field(card, 'countdown').remove()
      break
    case 'upcoming':
      number.textContent = String(timing.daysToGo)
      unit.textContent = timing.daysToGo === 1 ? 'day to go' : 'days to go'
      if (timing.daysToGo === 1) {
        badge.textContent = 'Tomorrow'
        badge.hidden = false
      }
      break
    case 'past':
      number.textContent = String(timing.daysAgo)
      unit.textContent = timing.daysAgo === 1 ? 'day ago' : 'days ago'
      break
  }

  return card
}

function renderList(listId: string, listEvents: SwimEvent[], today: CalendarDate): void {
  const list = document.getElementById(listId)
  const template = document.getElementById('event-card-template') as HTMLTemplateElement | null
  if (!list || !template) return

  list.replaceChildren(...listEvents.map((event) => renderCard(template, event, today)))

  const empty = list.parentElement?.querySelector<HTMLElement>('.event-list-empty')
  if (empty) empty.hidden = listEvents.length > 0
}

function render(): void {
  const today = localToday()
  const upcoming = events.filter((event) => eventTiming(event.dateStart, event.dateEnd, today).kind !== 'past')
  // Most recently finished first
  const past = events.filter((event) => eventTiming(event.dateStart, event.dateEnd, today).kind === 'past').reverse()

  renderToday(today)
  renderList('upcoming-events', upcoming, today)
  renderList('past-events', past, today)
}

async function loadEvents(isRefresh: boolean): Promise<void> {
  setStatus('loading', isRefresh ? 'Updating events' : 'Loading events')

  try {
    events = await fetchEvents()
    render()
    setStatus('ready', `Events updated at ${time.format(new Date())}.`)
  } catch (error) {
    console.error('Error fetching events:', error)
    setStatus('error', "Couldn't load the events. Check your connection and try “Update events” again.")
  }
}

export function initEvents(): void {
  const refreshButton = document.getElementById('refresh-events')
  if (!refreshButton || refreshButton.dataset.bound) return

  refreshButton.dataset.bound = 'true'
  refreshButton.addEventListener('click', () => loadEvents(true))
  renderToday(localToday())
  loadEvents(false)
}
