import {
  dateRangeSeparator,
  parseCalendarDate,
  eventProgress,
  eventTiming,
  formatDateRange,
  isoDate,
  localToday,
  toLocalDate,
  type CalendarDate,
} from '../lib/countdown'
import {
  eventCountries,
  filtersFromUrl,
  filtersToUrl,
  groupBy,
  hasFilters,
  matchesFilters,
  NO_FILTERS,
  periodRange,
  type EventFilters,
  type Period,
} from '../lib/filters'
import { COUNTRIES } from '../lib/countries'
import { flagUrl, listLocation, parseLocation, shortLocation } from '../lib/locations'
import { fetchEvents, type SwimEvent } from '../lib/supabase'

const LOCALE = 'en-US'
// Day-month-year, as in the design ("18 October 2026")
const headerDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' })
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

const BUTTON_LABEL = 'Update events'
const LOADING_TEXT = 'Loading events…'
const CALENDARS = "['apple','google','ical','ms365','outlookcom','yahoo']"

let events: SwimEvent[] = []
let loaded = false
let loading = false
let updatedAt = ''
let filters: EventFilters = NO_FILTERS

function field<T extends HTMLElement = HTMLElement>(root: Element | DocumentFragment, name: string): T {
  return root.querySelector<T>(`[data-field="${name}"]`)!
}

/** Announce `text` through the status line beside the button, without showing it. */
function announce(text: string): void {
  const status = document.getElementById('events-status')
  if (!status) return

  status.classList.add('sr-only')
  status.textContent = text
}

/** Show "Updated at 10:00" in the status line, read out as "Events updated at 10:00". */
function setUpdatedStatus(): void {
  const status = document.getElementById('events-status')
  if (!status) return

  const prefix = document.createElement('span')
  prefix.className = 'sr-only'
  prefix.textContent = 'Events '
  status.classList.remove('sr-only')
  status.replaceChildren(prefix, `Updated at ${updatedAt}`)
}

function setLoading(isLoading: boolean): void {
  const button = document.getElementById('refresh-events')
  loading = isLoading
  if (button) {
    button.setAttribute('aria-disabled', String(isLoading))
    field(button, 'label').textContent = isLoading ? LOADING_TEXT : BUTTON_LABEL
  }
}

/** The message in a panel when it has nothing to list; `null` hides it. */
function setMessage(name: 'upcoming' | 'past', content: Node[] | null): void {
  const message = document.querySelector<HTMLElement>(`[data-message="${name}"]`)
  if (!message) return

  message.replaceChildren(...(content ?? []))
  message.hidden = content === null
}

function paragraph(...content: (string | Node)[]): HTMLParagraphElement {
  const p = document.createElement('p')
  p.append(...content)
  return p
}

function strong(text: string): HTMLElement {
  const element = document.createElement('strong')
  element.textContent = text
  return element
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

/** The site's dark mode is a class on `<html>`, which the calendar button doesn't know about. */
const calendarLightMode = () => (document.documentElement.classList.contains('darkmode') ? 'dark' : 'light')

// The add-to-calendar-button script is only fetched once there is a button to show
let calendarScript: Promise<unknown> | null = null

/**
 * An "Add to calendar" button (add-to-calendar-button web component) for an all-day event.
 * Screen readers hear "Add to calendar: <event name>", so every button has its own name.
 */
function fillCalendar(container: HTMLElement, event: SwimEvent): void {
  calendarScript ??= import('add-to-calendar-button')

  const button = document.createElement('add-to-calendar-button')
  const attributes: Record<string, string> = {
    name: event.name,
    'start-date': event.dateStart.slice(0, 10),
    'end-date': event.dateEnd.slice(0, 10),
    location: listLocation(event),
    // the same id every time, so adding an event again updates it instead of duplicating it
    uid: `swim-events-${event.id}`,
    options: CALENDARS,
    // sentence case, for the button and the heading of the calendar list
    'custom-labels': JSON.stringify({ 'label.addtocalendar': 'Add to calendar' }),
    'list-style': 'modal',
    'light-mode': calendarLightMode(),
    'ics-file-name': event.name,
    'hide-branding': '',
    'hide-rich-data': '',
  }
  if (event.link) attributes.description = `Event website: [url]${event.link}[/url]`

  for (const [name, value] of Object.entries(attributes)) button.setAttribute(name, value)
  container.replaceChildren(button)
}

/** A decorative round flag; the country is always named in the text next to it. */
function flagImage(code: string): HTMLImageElement | null {
  const src = flagUrl(code)
  if (!src) return null

  const image = document.createElement('img')
  image.className = 'flag'
  image.src = src
  image.alt = ''
  image.width = 18
  image.height = 18
  image.decoding = 'async'
  image.loading = 'lazy'
  image.addEventListener('error', () => image.remove())
  return image
}

/** The place text with the country's flag in front of it, when there is one. */
function fillPlace(container: HTMLElement, event: SwimEvent, text: string): void {
  const code = parseLocation(event)?.code
  const flag = code ? flagImage(code) : null
  container.replaceChildren(...(flag ? [flag] : []), text)
}

function renderCard(template: HTMLTemplateElement, event: SwimEvent, today: CalendarDate): DocumentFragment {
  const card = template.content.cloneNode(true) as DocumentFragment
  const timing = eventTiming(event.dateStart, event.dateEnd, today)

  fillName(card, event)
  fillPlace(field(card, 'place'), event, listLocation(event))
  fillDates(field(card, 'dates'), event)
  fillCalendar(field(card, 'calendar'), event)

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
  }

  return card
}

function renderPastRow(template: HTMLTemplateElement, event: SwimEvent, today: CalendarDate): DocumentFragment {
  const row = template.content.cloneNode(true) as DocumentFragment
  const timing = eventTiming(event.dateStart, event.dateEnd, today)
  const daysAgo = timing.kind === 'past' ? timing.daysAgo : 0

  fillName(row, event)
  fillPlace(field(row, 'place'), event, listLocation(event))
  fillDates(field(row, 'dates'), event)
  field(row, 'finished').textContent = daysAgo === 1 ? 'Finished yesterday' : `Finished ${daysAgo} days ago`
  return row
}

type Renderer = (template: HTMLTemplateElement, event: SwimEvent, today: CalendarDate) => DocumentFragment

/** One list per month or year, each under a heading ("November 2026", "2025"). */
function renderGroups(
  listId: string,
  templateId: string,
  renderer: Renderer,
  listEvents: SwimEvent[],
  label: (event: SwimEvent) => string,
  today: CalendarDate,
): void {
  const container = document.getElementById(listId)
  const template = document.getElementById(templateId) as HTMLTemplateElement | null
  if (!container || !template) return

  const isPast = listId === 'past-events'
  container.replaceChildren(
    ...groupBy(listEvents, label).map((group) => {
      const item = document.createElement('li')
      const heading = document.createElement('h3')
      const list = document.createElement('ul')
      item.className = 'event-group'
      heading.className = 'event-group__heading'
      heading.textContent = group.label
      list.className = isPast ? 'event-list past-list' : 'event-list'
      list.append(...group.items.map((event) => renderer(template, event, today)))
      item.append(heading, list)
      return item
    }),
  )
}

const startMonth = (event: SwimEvent) => monthYear.format(toLocalDate(parseCalendarDate(event.dateStart)))
const startYear = (event: SwimEvent) => event.dateStart.slice(0, 4)

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
  fillPlace(field(card, 'place'), event, shortLocation(event))
  fillDates(field(card, 'dates'), event)
  fillCalendar(field(card, 'calendar'), event)
  return card
}

function renderNextCard(template: HTMLTemplateElement, event: SwimEvent, daysToGo: number): DocumentFragment {
  const card = template.content.cloneNode(true) as DocumentFragment

  fillName(card, event)
  fillPlace(field(card, 'place'), event, shortLocation(event))
  fillDates(field(card, 'dates'), event)
  fillCalendar(field(card, 'calendar'), event)
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

function setCount(name: string, count: number): void {
  const element = document.querySelector(`[data-count="${name}"]`)
  if (element) element.textContent = `(${count})`
}

function render(): void {
  const today = localToday()
  const kindOf = (event: SwimEvent) => eventTiming(event.dateStart, event.dateEnd, today).kind
  const shown = events.filter((event) => matchesFilters(event, filters, today))
  const filtered = hasFilters(filters)
  // The chips count events that match the other filters, so picking a country never hides another
  const unlessCountry = events.filter((event) => matchesFilters(event, { ...filters, countries: [] }, today))
  const pastTab = document.getElementById('past-tab')?.getAttribute('aria-selected') === 'true'
  renderCountryChips(unlessCountry.filter((event) => (kindOf(event) === 'past') === pastTab))
  const live = shown.filter((event) => ['ongoing', 'today'].includes(kindOf(event)))
  const upcoming = shown.filter((event) => kindOf(event) === 'upcoming')
  // Most recently finished first
  const past = shown.filter((event) => kindOf(event) === 'past').reverse()

  const upcomingList = renderFeatured(live, upcoming, today)

  renderToday(today)
  renderGroups('upcoming-events', 'event-card-template', renderCard, upcomingList, startMonth, today)
  renderGroups('past-events', 'past-row-template', renderPastRow, past, startYear, today)
  renderFilterSummary(shown.length, today)
  setCount('upcoming', upcomingList.length)
  setCount('past', past.length)
  setMessage(
    'upcoming',
    upcomingList.length > 0
      ? null
      : filtered
        ? [
            paragraph(strong('No upcoming events match your filters.')),
            paragraph('Try another search, time period or country.'),
          ]
        : [
            paragraph(strong('No upcoming events right now.')),
            paragraph('New meets show up here as soon as they’re added. Recent results are under Past.'),
          ],
  )
  setMessage(
    'past',
    past.length > 0 ? null : [paragraph(filtered ? 'No past events match your filters.' : 'No past events yet.')],
  )
}

/** "Showing 6 of 95 events · 20 Oct – 19 Jan 2027 · Switzerland" while a filter is set, empty otherwise. */
function renderFilterSummary(shownCount: number, today: CalendarDate): void {
  const summary = document.getElementById('filter-summary')
  const clear = document.querySelector<HTMLButtonElement>('#event-filters button[type="reset"]')
  const filtered = hasFilters(filters)
  if (clear) clear.hidden = !filtered
  if (!summary) return

  const { from, to } = periodRange(filters, today)
  const period =
    from && to
      ? ` · ${rangeText(from, to)}`
      : from
        ? ` · from ${rangeText(from, from)}`
        : to
          ? ` · until ${rangeText(to, to)}`
          : ''
  const countries = filters.countries.map((code) => COUNTRIES[code]?.name ?? code).join(', ')
  const text = filtered
    ? `Showing ${shownCount} of ${events.length} events${period}${countries ? ` · ${countries}` : ''}`
    : ''
  if (summary.textContent !== text) summary.textContent = text
}

/** "20–26 Oct 2026" as plain text. */
function rangeText(from: string, to: string): string {
  const range = formatDateRange(from, to)
  return range.start ? `${range.start}${dateRangeSeparator(range)}${range.end}` : range.end
}

/** Chips beyond this many hide behind "More countries" on small screens. */
const VISIBLE_CHIPS = 8

/**
 * One checkbox chip per country with events in the open tab: the flag and the IOC code,
 * with the name and count for screen readers and on hover. Selected countries stay even
 * when the tab has no events for them, so they can be unticked.
 */
function renderCountryChips(tabEvents: SwimEvent[]): void {
  const fieldset = document.getElementById('country-filter')
  const list = document.getElementById('country-chips')
  const more = document.getElementById('more-countries') as HTMLButtonElement | null
  if (!fieldset || !list || !more) return

  const countries = eventCountries(tabEvents)
  for (const code of filters.countries) {
    if (!countries.some((country) => country.code === code)) {
      countries.push({ code, country: COUNTRIES[code]?.name ?? code, count: 0 })
    }
  }

  // Re-rendering replaces the checkboxes, so keep keyboard focus on the same country
  const focused = list.contains(document.activeElement) ? (document.activeElement as HTMLInputElement).value : null
  list.replaceChildren(...countries.map(renderCountryChip))
  if (focused) list.querySelector<HTMLInputElement>(`input[value="${focused}"]`)?.focus()

  fieldset.hidden = countries.length === 0
  const hiddenSelected = countries.slice(VISIBLE_CHIPS).some(({ code }) => filters.countries.includes(code))
  if (hiddenSelected) fieldset.classList.add('is-expanded')
  const expanded = fieldset.classList.contains('is-expanded')
  more.hidden = countries.length <= VISIBLE_CHIPS || expanded
  field(more, 'count').textContent = String(countries.length - VISIBLE_CHIPS)
}

function renderCountryChip({ code, country, count }: { code: string; country: string; count: number }): HTMLElement {
  const item = document.createElement('li')
  const label = document.createElement('label')
  label.className = 'country-chip'
  label.title = `${country} (${count})`

  const input = document.createElement('input')
  input.type = 'checkbox'
  input.name = 'country'
  input.value = code
  input.checked = filters.countries.includes(code)

  const check = document.createElement('span')
  check.className = 'country-chip__check'
  check.setAttribute('aria-hidden', 'true')
  const codeText = document.createElement('span')
  codeText.textContent = code
  const nameText = document.createElement('span')
  nameText.className = 'sr-only'
  nameText.textContent = ` ${country}, ${count} ${count === 1 ? 'event' : 'events'}`

  const flag = flagImage(code)
  label.append(input, check, ...(flag ? [flag] : []), codeText, nameText)
  item.append(label)
  return item
}

function readFilterForm(form: HTMLFormElement): EventFilters {
  const data = new FormData(form)
  return {
    query: String(data.get('q') ?? ''),
    period: String(data.get('when') ?? '') as Period,
    from: String(data.get('from') ?? ''),
    to: String(data.get('to') ?? ''),
    countries: data.getAll('country').map(String),
  }
}

/** The From and To dates only show for "Choose dates…"; each limits the other. */
function syncDateFields(form: HTMLFormElement): void {
  const custom = filters.period === 'custom'
  form.querySelectorAll<HTMLElement>('[data-field="custom-dates"]').forEach((field) => (field.hidden = !custom))
  ;(form.elements.namedItem('from') as HTMLInputElement).max = filters.to
  ;(form.elements.namedItem('to') as HTMLInputElement).min = filters.from
}

function applyFilters(form: HTMLFormElement, next: EventFilters): void {
  filters = next
  syncDateFields(form)
  history.replaceState(history.state, '', filtersToUrl(new URL(location.href), filters))
  if (loaded) render()
}

function initFilters(): void {
  const form = document.getElementById('event-filters') as HTMLFormElement | null
  if (!form) return

  filters = filtersFromUrl(new URL(location.href))
  // drops unknown countries and resolves aliases in a shared link (?country=mco becomes MON)
  history.replaceState(history.state, '', filtersToUrl(new URL(location.href), filters))
  const query = form.elements.namedItem('q') as HTMLInputElement
  query.value = filters.query
  ;(form.elements.namedItem('when') as HTMLSelectElement).value = filters.period
  ;(form.elements.namedItem('from') as HTMLInputElement).value = filters.from
  ;(form.elements.namedItem('to') as HTMLInputElement).value = filters.to
  syncDateFields(form)

  // The country chips follow the open tab
  const pastTab = document.getElementById('past-tab')
  if (pastTab) {
    new MutationObserver(() => loaded && render()).observe(pastTab, { attributeFilter: ['aria-selected'] })
  }
  document.getElementById('more-countries')?.addEventListener('click', (event) => {
    document.getElementById('country-filter')?.classList.add('is-expanded')
    ;(event.currentTarget as HTMLElement).hidden = true
    // the first chip that was hidden, so keyboard users carry on where the list grew
    document.querySelector<HTMLInputElement>(`#country-chips li:nth-child(${VISIBLE_CHIPS + 1}) input`)?.focus()
  })

  form.addEventListener('submit', (event) => event.preventDefault())
  form.addEventListener('input', () => applyFilters(form, readFilterForm(form)))
  // reset clears the fields after this event, so read them on the next tick
  form.addEventListener('reset', () => {
    setTimeout(() => {
      applyFilters(form, NO_FILTERS)
      query.focus()
    })
  })
}

/** First load failed: no warning, just a way to try again. */
function renderLoadFailed(): void {
  const message = () => [paragraph('No events to show yet. Use ', strong(BUTTON_LABEL), ' to try loading them again.')]
  document.getElementById('upcoming-events')?.replaceChildren()
  setMessage('upcoming', message())
  setMessage('past', message())
  announce('No events to show yet. Use Update events to try loading them again.')
}

async function loadEvents(): Promise<void> {
  if (loading) return
  setLoading(true)
  announce(LOADING_TEXT)

  try {
    events = await fetchEvents()
    loaded = true
    updatedAt = time.format(new Date())
    render()
    setUpdatedStatus()
  } catch (error) {
    console.error('Error fetching events:', error)
    // Keep what is already on screen; only an empty page gets a message
    if (loaded) setUpdatedStatus()
    else renderLoadFailed()
  } finally {
    setLoading(false)
  }
}

export function initEvents(): void {
  const refreshButton = document.getElementById('refresh-events')
  if (!refreshButton || refreshButton.dataset.bound) return

  refreshButton.dataset.bound = 'true'
  refreshButton.addEventListener('click', () => loadEvents())
  document.addEventListener('darkmode:change', () => {
    const mode = calendarLightMode()
    document.querySelectorAll('add-to-calendar-button').forEach((button) => button.setAttribute('light-mode', mode))
  })
  initFilters()
  renderToday(localToday())
  loadEvents()
}
