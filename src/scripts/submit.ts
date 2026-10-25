import { auth, loadProfile } from '../lib/auth'
import { dateRangeSeparator, formatDateRange, isoDate, localToday } from '../lib/countdown'
import { COUNTRIES } from '../lib/countries'
import { listLocation } from '../lib/locations'
import {
  earliestStart,
  isClaimable,
  latestEnd,
  latestStart,
  normaliseLink,
  NOTE_MAX,
  possibleDuplicates,
  sendProblem,
  shortDate,
  validateOrganiser,
  validateSubmission,
  type FieldError,
  type SubmissionFields,
} from '../lib/submission'
import type { SwimEvent } from '../lib/supabase'
import {
  clearFieldError,
  clearFieldErrors,
  isBusy,
  setBusy,
  showErrorSummary,
  showFieldError,
  showNotice,
} from './form-errors'
import { handleSignInLink, initSignIn, type SignIn } from './sign-in'

type View = 'loading' | 'signed-out' | 'closed' | 'blocked' | 'waiting' | 'form' | 'success'

const numberFormat = new Intl.NumberFormat('en-GB')

function dateText(event: Pick<SwimEvent, 'dateStart' | 'dateEnd'>): string {
  const range = formatDateRange(event.dateStart, event.dateEnd)
  return range.start ? `${range.start}${dateRangeSeparator(range)}${range.end}` : range.end
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function initSubmit(): void {
  const root = document.getElementById('submit-page')
  if (!root || root.dataset.bound) return
  root.dataset.bound = 'true'
  const page: HTMLElement = root

  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => page.querySelector<T>(selector)!
  const field = <T extends HTMLElement = HTMLElement>(name: string) => $<T>(`[data-field="${name}"]`)

  const form = $<HTMLFormElement>('form[data-view="form"]')
  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const summary = field('summary')
  const sendNotice = field('send-notice')
  const sendStatus = field('send-status')
  const inputs = {
    name: $<HTMLInputElement>('#name'),
    city: $<HTMLInputElement>('#city'),
    country: $<HTMLSelectElement>('#country'),
    dateStart: $<HTMLInputElement>('#dateStart'),
    dateEnd: $<HTMLInputElement>('#dateEnd'),
    link: $<HTMLInputElement>('#link'),
    note: $<HTMLTextAreaElement>('#note'),
    role: $<HTMLInputElement>('#role'),
    organiser: $<HTMLInputElement>('#organiser'),
  }

  let signIn: SignIn
  let events: SwimEvent[] = []
  let email = ''
  let waiting = 0
  let idempotencyKey = crypto.randomUUID()
  // set when the session ran out while sending, so the form is sent again after signing in
  let resend: (() => void) | null = null

  function show(view: View): void {
    page.querySelectorAll<HTMLElement>('[data-view]').forEach((element) => {
      const views = element.dataset.view!
      element.hidden = views !== view && !(views === 'signed-in' && view !== 'signed-out' && view !== 'loading')
    })
    if (view === 'signed-out') signIn.show()
    else signIn.hide()
  }

  function values(): SubmissionFields {
    return {
      name: inputs.name.value,
      city: inputs.city.value,
      country: inputs.country.value,
      dateStart: inputs.dateStart.value,
      dateEnd: inputs.dateEnd.value,
      link: inputs.link.value,
      note: inputs.note.value,
      role: inputs.role.value,
      organiser: inputs.organiser.checked,
    }
  }

  function setDateLimits(): void {
    const today = localToday()
    const earliest = earliestStart(today)
    field('earliest').textContent = ` (${shortDate(earliest)} or later)`
    inputs.dateStart.min = earliest
    inputs.dateStart.max = latestStart(today)
    const start = inputs.dateStart.value
    inputs.dateEnd.min = start || earliest
    inputs.dateEnd.max = start ? latestEnd(start) : ''
  }

  function updateWaitingLine(): void {
    const line = field('waiting-line')
    line.hidden = waiting === 0
    line.textContent = `You have ${plural(waiting, 'event')} waiting for review.`
  }

  // "Is it one of these?" for listed events in the same country on overlapping dates
  function updateDuplicates(): void {
    const box = field('duplicates')
    const today = localToday()
    const matches = possibleDuplicates(
      events,
      inputs.country.value,
      inputs.dateStart.value,
      inputs.dateEnd.value,
    ).filter((event) => isClaimable(event, today))
    const wasHidden = box.hidden
    box.hidden = matches.length === 0
    if (!matches.length) return

    field('duplicates-country').textContent = COUNTRIES[inputs.country.value]?.name ?? inputs.country.value
    const list = field('duplicates-list')
    list.replaceChildren(
      ...matches.map((event) => {
        const item = document.createElement('li')
        const text = document.createElement('p')
        const name = event.link ? document.createElement('a') : document.createElement('strong')
        name.textContent = event.name
        if (name instanceof HTMLAnchorElement) {
          name.href = event.link!
          name.target = '_blank'
          name.rel = 'noopener'
        }
        text.append(name, `, ${listLocation(event)}, ${dateText(event)}`)

        const claim = document.createElement('button')
        claim.type = 'button'
        claim.className = 'button button--secondary'
        claim.innerHTML =
          '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>'
        const label = document.createElement('span')
        label.dataset.label = ''
        label.textContent = `I organise ${event.name}, claim it`
        claim.append(label)
        claim.addEventListener('click', () => sendClaim(event, claim))
        item.append(text, claim)
        return item
      }),
    )
    if (wasHidden)
      sendStatus.textContent = `${plural(matches.length, 'similar event')} already listed, shown under the dates.`
  }

  let noteTimer: number | undefined
  function updateNoteCount(): void {
    const text = `${numberFormat.format(inputs.note.value.length)} of ${numberFormat.format(NOTE_MAX)} characters`
    $('#note-count').textContent = text
    // read out once typing pauses, not on every key
    window.clearTimeout(noteTimer)
    noteTimer = window.setTimeout(() => (field('note-status').textContent = text), 1000)
  }

  function showErrors(errors: FieldError[], messages: string[] = []): void {
    const shown = errors.map(({ field: name, message }) => {
      showFieldError(inputs[name], message)
      return { input: inputs[name], message }
    })
    showErrorSummary(summary, shown, messages)
  }

  function resetMessages(): void {
    clearFieldErrors(form)
    showErrorSummary(summary, [])
    showNotice(sendNotice, null)
  }

  /** Handles a refused insert. Returns true when the submission did arrive after all. */
  function handleProblem(error: Parameters<typeof sendProblem>[0], retry: () => void): boolean {
    const problem = sendProblem(error, localToday())
    switch (problem.kind) {
      case 'duplicate':
        return true
      case 'signed-out':
        resend = retry
        show('signed-out')
        return false
      case 'closed':
        show('closed')
        $('#closed-heading').focus()
        return false
      case 'blocked':
        show('blocked')
        $('#blocked-heading').focus()
        return false
      case 'waiting':
        field('waiting-count').textContent = plural(waiting || 1, 'event')
        show('waiting')
        $('#waiting-heading').focus()
        return false
      case 'field':
        showErrors([{ field: problem.field, message: problem.message }])
        return false
      case 'message':
        showErrorSummary(summary, [], [problem.message])
        return false
    }
  }

  function showSuccess(details: { name: string; place: string; dates: string; claim: boolean }): void {
    field('done-heading').textContent = details.claim ? 'Thanks, we’ll check your claim' : 'Thanks, we’ve got it'
    field('done-name').textContent = details.name
    field('done-details').textContent = `${details.place} · ${details.dates}`
    field('done-what').textContent = details.claim
      ? 'is now waiting for us to confirm that you organise it.'
      : 'is now waiting for review.'
    field('done-after').textContent = details.claim
      ? 'Once it’s confirmed, the event is linked to your account.'
      : 'Once it’s approved, it appears on the site straight away.'
    field('done-email').textContent = email
    waiting += 1
    updateWaitingLine()
    idempotencyKey = crypto.randomUUID()
    show('success')
    $('#done-heading').focus()
  }

  async function sendEvent(): Promise<void> {
    if (isBusy(submitButton)) return
    resetMessages()
    const fields = values()
    const errors = validateSubmission(fields, localToday())
    if (errors.length) {
      showErrors(errors)
      return
    }

    const link = normaliseLink(fields.link)
    inputs.link.value = link
    setBusy(submitButton, true, 'Sending…')
    sendStatus.textContent = 'Sending the event…'
    const { error } = await auth.from('event_submissions').insert({
      kind: 'new',
      name: fields.name.trim(),
      city: fields.city.trim(),
      country: fields.country,
      dateStart: fields.dateStart,
      dateEnd: fields.dateEnd,
      link,
      note: fields.note.trim() || null,
      organiser_role: fields.role.trim(),
      organiser_confirmed: true,
      idempotency_key: idempotencyKey,
    })
    setBusy(submitButton, false, '')
    sendStatus.textContent = ''
    if (error && !handleProblem(error, () => form.requestSubmit())) return

    showSuccess({
      name: fields.name.trim(),
      place: `${fields.city.trim()}, ${COUNTRIES[fields.country]?.name ?? fields.country}`,
      dates: dateText(fields),
      claim: false,
    })
  }

  async function sendClaim(event: SwimEvent, button: HTMLButtonElement): Promise<void> {
    if (isBusy(button)) return
    resetMessages()
    const fields = values()
    const errors = validateOrganiser(fields)
    if (errors.length) {
      showErrors(errors)
      return
    }

    setBusy(button, true, 'Sending…')
    sendStatus.textContent = 'Sending your claim…'
    // the database copies the listed event's details into the claim
    const { error } = await auth.from('event_submissions').insert({
      kind: 'claim',
      event_id: event.id,
      name: event.name,
      city: event.city ?? '',
      country: event.country ?? '',
      dateStart: event.dateStart,
      dateEnd: event.dateEnd,
      organiser_role: fields.role.trim(),
      organiser_confirmed: true,
      idempotency_key: idempotencyKey,
    })
    setBusy(button, false, '')
    sendStatus.textContent = ''
    if (error && !handleProblem(error, () => sendClaim(event, button))) return

    showSuccess({ name: event.name, place: listLocation(event), dates: dateText(event), claim: true })
  }

  async function loadSignedIn(fromSignIn: boolean): Promise<void> {
    const { data } = await auth.auth.getSession()
    const session = data.session
    if (!session) {
      show('signed-out')
      return
    }
    email = session.user.email ?? ''
    field('user-email').textContent = email

    try {
      const today = isoDate(localToday())
      const [profile, pending, listed] = await Promise.all([
        loadProfile(),
        auth.from('event_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        auth.from('events').select('*').gte('dateEnd', today).order('dateStart'),
      ])
      if (pending.error) throw pending.error
      if (listed.error) throw listed.error
      waiting = pending.count ?? 0
      events = (listed.data ?? []) as SwimEvent[]
      showNotice(field('load-notice'), null)

      if (profile?.blocked) {
        show('blocked')
        if (fromSignIn) $('#blocked-heading').focus()
        return
      }
    } catch (error) {
      console.error('Loading the account failed:', error)
      show('loading')
      $('[data-view="loading"]').hidden = true
      showNotice(field('load-notice'), 'We couldn’t load your account. Check your connection and reload the page.')
      return
    }

    setDateLimits()
    updateWaitingLine()
    updateDuplicates()
    show('form')
    if (resend) {
      const retry = resend
      resend = null
      retry()
    } else if (fromSignIn) {
      $('#form-heading').focus()
    }
  }

  signIn = initSignIn($('[data-sign-in]'), () => loadSignedIn(true))

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    sendEvent()
  })
  inputs.dateStart.addEventListener('change', () => {
    // a one-day event is the most common, so the last day follows the first
    const start = inputs.dateStart.value
    if (start && (!inputs.dateEnd.value || inputs.dateEnd.value < start || inputs.dateEnd.value > latestEnd(start))) {
      inputs.dateEnd.value = start
    }
    setDateLimits()
    updateDuplicates()
  })
  inputs.dateEnd.addEventListener('change', updateDuplicates)
  inputs.country.addEventListener('change', updateDuplicates)
  inputs.note.addEventListener('input', updateNoteCount)
  // a fixed field loses its message straight away; the summary updates on the next send
  Object.values(inputs).forEach((input) =>
    input.addEventListener('change', () => {
      if (input.getAttribute('aria-invalid') === 'true') clearFieldError(input)
    }),
  )
  inputs.link.addEventListener('blur', () => (inputs.link.value = normaliseLink(inputs.link.value)))

  $('[data-action="sign-out"]').addEventListener('click', async () => {
    await auth.auth.signOut({ scope: 'local' })
    email = ''
    show('signed-out')
    $('#signin-heading').focus()
  })

  $('[data-action="another"]').addEventListener('click', () => {
    const { role, organiser } = values()
    form.reset()
    // the same person usually sends several events in the same role
    inputs.role.value = role
    inputs.organiser.checked = organiser
    resetMessages()
    updateNoteCount()
    setDateLimits()
    updateDuplicates()
    show('form')
    $('#form-heading').focus()
  })

  handleSignInLink().then((linkProblem) => {
    auth.auth.getSession().then(({ data }) => {
      if (data.session) loadSignedIn(false)
      else if (linkProblem) {
        show('signed-out')
        signIn.show(linkProblem)
      } else show('signed-out')
    })
  })
}
