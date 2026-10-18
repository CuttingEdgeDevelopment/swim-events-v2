import { eventTiming, localToday, parseCalendarDate, toLocalDate, type CalendarDate } from '../lib/countdown'
import { fetchEvents, type SwimEvent } from '../lib/supabase'

const LOCALE = 'en-US'
const longDate = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', month: 'long', day: '2-digit', year: 'numeric' })
const headerDate = new Intl.DateTimeFormat(LOCALE, { month: 'long', day: '2-digit', year: 'numeric' })
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' })
const time = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })

let events: SwimEvent[] = []

function field<T extends HTMLElement = HTMLElement>(root: Element | DocumentFragment, name: string): T {
  return root.querySelector<T>(`[data-field="${name}"]`)!
}

function formatDate(value: string): string {
  return longDate.format(toLocalDate(parseCalendarDate(value)))
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
  field(container, 'weekday').textContent = weekday.format(date)
  field(container, 'date').textContent = headerDate.format(date)
  container.hidden = false
}

function renderCard(template: HTMLTemplateElement, event: SwimEvent, today: CalendarDate): DocumentFragment {
  const card = template.content.cloneNode(true) as DocumentFragment
  const item = card.querySelector('li')!
  const timing = eventTiming(event.dateStart, event.dateEnd, today)
  const isPast = timing.kind === 'past'

  field(card, 'name').textContent = event.name
  if (event.link) {
    const link = field<HTMLAnchorElement>(card, 'link')
    link.href = event.link
    link.hidden = false
  }

  field(card, 'location').textContent = event.location
  field(card, 'start-label').textContent = isPast ? 'Began' : 'Begins'
  field(card, 'start').textContent = formatDate(event.dateStart)
  field(card, 'end-label').textContent = isPast ? 'Ended' : 'Ends'
  field(card, 'end').textContent = formatDate(event.dateEnd)

  const number = field(card, 'number')
  const label = field(card, 'label')

  switch (timing.kind) {
    case 'ongoing':
      card.querySelector<HTMLElement>('[data-icon="ongoing"]')!.hidden = false
      label.textContent = 'Ongoing!'
      item.classList.add('is-live')
      break
    case 'today':
      card.querySelector<HTMLElement>('[data-icon="today"]')!.hidden = false
      label.textContent = 'Today is the day!'
      item.classList.add('is-live')
      break
    case 'upcoming':
      number.textContent = String(timing.daysToGo)
      number.hidden = false
      label.textContent = timing.daysToGo === 1 ? 'day to go' : 'days to go'
      break
    case 'past':
      number.textContent = String(timing.daysAgo)
      number.hidden = false
      label.textContent = timing.daysAgo === 1 ? 'day ago' : 'days ago'
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
