import {
  dateRangeSeparator,
  eventProgress,
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

function renderLiveCard(template: HTMLTemplateElement, event: SwimEvent, today: CalendarDate): DocumentFragment {
  const card = template.content.cloneNode(true) as DocumentFragment
  const isToday = eventTiming(event.dateStart, event.dateEnd, today).kind === 'today'
  const { day, total } = eventProgress(event.dateStart, event.dateEnd, today)

  field(card, isToday ? 'badge-today' : 'badge-ongoing').hidden = false
  // One-day meets only show the badge, "1 / 1 days" says nothing
  if (total > 1) {
    field(card, 'day').textContent = String(day)
    field(card, 'total').textContent = String(total)
    field(card, 'progress-text').textContent = `Day ${day} of ${total}`
  } else {
    field(card, 'progress').hidden = true
  }

  fillName(card, event)
  field(card, 'place').textContent = event.location.trim()
  fillDates(field(card, 'dates'), event)
  return card
}

function renderNextCard(template: HTMLTemplateElement, event: SwimEvent, daysToGo: number): DocumentFragment {
  const card = template.content.cloneNode(true) as DocumentFragment

  fillName(card, event)
  field(card, 'place').textContent = event.location.trim()
  fillDates(field(card, 'dates'), event)
  field(card, 'number').textContent = String(daysToGo)
  field(card, 'unit').textContent = daysToGo === 1 ? 'day to go' : 'days to go'
  return card
}

/**
 * The blue cards above the lists: every running event under "Happening now", else the
 * nearest upcoming event under "Next up", else nothing. Returns the upcoming events
 * that still belong in the Upcoming list, so no event is shown twice.
 */
function renderFeatured(live: SwimEvent[], upcoming: SwimEvent[], today: CalendarDate): SwimEvent[] {
  const section = document.getElementById('featured')
  const list = document.getElementById('featured-events')
  const heading = document.getElementById('featured-heading')
  const liveTemplate = document.getElementById('featured-live-template') as HTMLTemplateElement | null
  const nextTemplate = document.getElementById('featured-next-template') as HTMLTemplateElement | null
  if (!section || !list || !heading || !liveTemplate || !nextTemplate) return upcoming

  if (live.length > 0) {
    heading.textContent = 'Happening now'
    list.classList.remove('is-next')
    list.replaceChildren(...live.map((event) => renderLiveCard(liveTemplate, event, today)))
    section.hidden = false
    return upcoming
  }

  const [next, ...rest] = upcoming
  if (!next) {
    list.replaceChildren()
    section.hidden = true
    return upcoming
  }

  const timing = eventTiming(next.dateStart, next.dateEnd, today)
  heading.textContent = 'Next up'
  list.classList.add('is-next')
  list.replaceChildren(renderNextCard(nextTemplate, next, timing.kind === 'upcoming' ? timing.daysToGo : 0))
  section.hidden = false
  return rest
}

function render(): void {
  const today = localToday()
  const kindOf = (event: SwimEvent) => eventTiming(event.dateStart, event.dateEnd, today).kind
  const live = events.filter((event) => ['ongoing', 'today'].includes(kindOf(event)))
  const upcoming = events.filter((event) => kindOf(event) === 'upcoming')
  // Most recently finished first
  const past = events.filter((event) => kindOf(event) === 'past').reverse()

  renderToday(today)
  renderList('upcoming-events', renderFeatured(live, upcoming, today), today)
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
