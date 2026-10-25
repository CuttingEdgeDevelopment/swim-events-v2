import { auth, loadProfile } from '../lib/auth'
import { dateRangeSeparator, formatDateRange } from '../lib/countdown'
import { listLocation } from '../lib/locations'
import { CONTACT_EMAIL, shortDate } from '../lib/submission'
import type { SwimEvent } from '../lib/supabase'
import { isBusy, setBusy, showNotice } from './form-errors'
import { handleSignInLink, initSignIn, type SignIn } from './sign-in'

type View = 'loading' | 'signed-out' | 'signed-in' | 'deleted'

type Submission = {
  id: string
  kind: 'new' | 'claim' | 'correction' | 'cancellation'
  event_id: number | null
  name: string
  city: string
  country: string
  dateStart: string
  dateEnd: string
  status: 'pending' | 'approved' | 'rejected' | 'spam' | 'withdrawn'
  review_note: string | null
  created_at: string
}

const STATUS = {
  pending: { label: 'Waiting for review', tone: 'info', icon: 'clock' },
  approved: { label: 'Published', tone: 'done', icon: 'check' },
  rejected: { label: 'Not accepted', tone: 'problem', icon: 'x' },
  spam: { label: 'Not accepted', tone: 'problem', icon: 'x' },
  withdrawn: { label: 'Withdrawn', tone: 'plain', icon: null },
} as const

const ICONS = {
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
}

function icon(name: keyof typeof ICONS): string {
  return `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
}

/** The dates as <time> elements, as on the event cards: "14–15 Nov 2026". */
function dates(event: Pick<SwimEvent, 'dateStart' | 'dateEnd'>): Node[] {
  const range = formatDateRange(event.dateStart, event.dateEnd)
  const time = (value: string, text: string) => {
    const element = document.createElement('time')
    element.dateTime = value
    element.textContent = text
    return element
  }
  if (!range.start) return [time(event.dateEnd, range.end)]
  return [
    time(event.dateStart, range.start),
    document.createTextNode(dateRangeSeparator(range)),
    time(event.dateEnd, range.end),
  ]
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function initAccount(): void {
  const root = document.getElementById('account-page')
  if (!root || root.dataset.bound) return
  root.dataset.bound = 'true'
  const page: HTMLElement = root

  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => page.querySelector<T>(selector)!
  const field = <T extends HTMLElement = HTMLElement>(name: string) => $<T>(`[data-field="${name}"]`)

  const profileForm = field<HTMLFormElement>('profile-form')
  const nameInput = $<HTMLInputElement>('#display-name')
  const organisationInput = $<HTMLInputElement>('#organisation')
  const dialog = field<HTMLDialogElement>('delete-dialog')
  let signIn: SignIn
  let submissions: Submission[] = []

  function show(view: View): void {
    page.querySelectorAll<HTMLElement>('[data-view]').forEach((element) => {
      element.hidden = element.dataset.view !== view
    })
    if (view !== 'signed-in') field('owned').hidden = true
    if (view === 'signed-out') signIn.show()
    else signIn.hide()
  }

  function renderSubmissions(): void {
    const list = field('submissions')
    field('no-submissions').hidden = submissions.length > 0
    const waiting = submissions.filter((submission) => submission.status === 'pending').length
    const waitingLine = field('waiting-line')
    waitingLine.hidden = waiting === 0
    waitingLine.textContent = `${plural(waiting, 'event')} waiting for review`

    list.replaceChildren(
      ...submissions.map((submission) => {
        const status = STATUS[submission.status]
        const item = document.createElement('li')
        item.className = 'submission'

        const text = document.createElement('div')
        text.className = 'submission__text'
        const heading = document.createElement('h3')
        heading.textContent = submission.kind === 'claim' ? `Claim: ${submission.name}` : submission.name
        const meta = document.createElement('p')
        meta.className = 'muted'
        meta.append(
          `${listLocation(submission)} · `,
          ...dates(submission),
          ` · sent ${shortDate(submission.created_at)}`,
        )
        if (submission.status === 'approved' && submission.kind === 'new') {
          const link = document.createElement('a')
          link.href = `/?q=${encodeURIComponent(submission.name)}`
          link.textContent = 'See it on the site'
          meta.append(' · ', link)
        }
        text.append(heading, meta)
        if (submission.review_note && submission.status !== 'pending') {
          const note = document.createElement('p')
          const label = document.createElement('strong')
          label.textContent = 'Note from the reviewer: '
          note.append(label, submission.review_note)
          text.append(note)
        }

        const badge = document.createElement('span')
        badge.className = `badge badge--${status.tone}`
        badge.innerHTML = status.icon ? icon(status.icon) : ''
        badge.append(submission.status === 'approved' && submission.kind === 'claim' ? 'Linked to you' : status.label)
        item.append(text, badge)

        if (submission.status === 'pending') {
          const withdraw = document.createElement('button')
          withdraw.type = 'button'
          withdraw.className = 'button button--secondary button--small'
          withdraw.innerHTML = '<span data-label>Withdraw</span>'
          const hidden = document.createElement('span')
          hidden.className = 'sr-only'
          hidden.textContent = ` ${submission.name}`
          withdraw.append(hidden)
          withdraw.addEventListener('click', () => withdrawSubmission(submission, withdraw))
          item.append(withdraw)
        }
        return item
      }),
    )
  }

  async function withdrawSubmission(submission: Submission, button: HTMLButtonElement): Promise<void> {
    if (isBusy(button)) return
    if (!window.confirm(`Withdraw ${submission.name}? We won't review it, and you can't undo this.`)) return
    setBusy(button, true, 'Withdrawing…')
    const { error } = await auth.from('event_submissions').update({ status: 'withdrawn' }).eq('id', submission.id)
    setBusy(button, false, '')
    if (error) {
      showNotice(field('list-notice'), `We couldn’t withdraw ${submission.name}. Reload the page and try again.`)
      return
    }
    showNotice(field('list-notice'), null)
    submission.status = 'withdrawn'
    renderSubmissions()
    field('list-status').textContent = `${submission.name} is withdrawn.`
    $('#subs-heading').setAttribute('tabindex', '-1')
    $('#subs-heading').focus()
  }

  function renderOwned(events: SwimEvent[]): void {
    field('owned').hidden = events.length === 0
    field('owned-list').replaceChildren(
      ...events.map((event) => {
        const item = document.createElement('li')
        item.className = 'submission'
        const text = document.createElement('div')
        text.className = 'submission__text'
        const heading = document.createElement('h3')
        heading.textContent = event.name
        const meta = document.createElement('p')
        meta.className = 'muted'
        const link = document.createElement('a')
        link.href = `/?q=${encodeURIComponent(event.name)}`
        link.textContent = 'See it on the site'
        meta.append(`${listLocation(event)} · `, ...dates(event), ' · ', link)
        text.append(heading, meta)
        item.append(text)
        return item
      }),
    )
  }

  async function loadSignedIn(fromSignIn: boolean): Promise<void> {
    const { data } = await auth.auth.getSession()
    if (!data.session) {
      show('signed-out')
      return
    }
    field('user-email').textContent = data.session.user.email ?? ''

    try {
      const [profile, sent, owned] = await Promise.all([
        loadProfile(),
        auth
          .from('event_submissions')
          .select('id, kind, event_id, name, city, country, dateStart, dateEnd, status, review_note, created_at')
          .neq('status', 'spam')
          .order('created_at', { ascending: false }),
        auth.from('event_owners').select('events(*)'),
      ])
      if (sent.error) throw sent.error
      if (owned.error) throw owned.error
      submissions = (sent.data ?? []) as Submission[]
      nameInput.value = profile?.display_name ?? ''
      organisationInput.value = profile?.organisation ?? ''
      const events = (owned.data ?? [])
        .map((row) => row.events as unknown as SwimEvent | null)
        .filter((event): event is SwimEvent => !!event)
        .sort((a, b) => a.dateStart.localeCompare(b.dateStart))
      renderSubmissions()
      renderOwned(events)
      showNotice(field('load-notice'), null)
    } catch (error) {
      console.error('Loading the account failed:', error)
      show('loading')
      $('[data-view="loading"]').hidden = true
      showNotice(field('load-notice'), 'We couldn’t load your account. Check your connection and reload the page.')
      return
    }

    show('signed-in')
    field('owned').hidden = field('owned-list').childElementCount === 0
    if (fromSignIn) $('#account-heading').focus()
  }

  signIn = initSignIn($('[data-sign-in]'), () => loadSignedIn(true))

  $('[data-action="sign-out"]').addEventListener('click', async () => {
    await auth.auth.signOut({ scope: 'local' })
    show('signed-out')
    $('#signin-heading').focus()
  })

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = profileForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
    if (isBusy(button)) return
    const status = field('profile-status')
    status.textContent = ''
    setBusy(button, true, 'Saving…')
    const { data } = await auth.auth.getSession()
    const { error } = await auth
      .from('profiles')
      .update({ display_name: nameInput.value.trim() || null, organisation: organisationInput.value.trim() || null })
      .eq('id', data.session?.user.id ?? '')
    setBusy(button, false, '')
    if (error) {
      showNotice(field('profile-notice'), 'We couldn’t save your profile. Check your connection and try again.')
      return
    }
    showNotice(field('profile-notice'), null)
    status.textContent = 'Profile saved.'
  })

  $('[data-action="delete"]').addEventListener('click', () => {
    showNotice(field('delete-notice'), null)
    dialog.showModal()
    // the safe choice gets focus first
    dialog.querySelector<HTMLButtonElement>('button[value="cancel"]')!.focus()
  })

  dialog.querySelector('[data-action="confirm-delete"]')!.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement
    if (isBusy(button)) return
    setBusy(button, true, 'Deleting…')
    const { error } = await auth.rpc('delete_my_account')
    setBusy(button, false, '')
    if (error) {
      showNotice(
        field('delete-notice'),
        `We couldn’t delete your account. Try again, or write to ${CONTACT_EMAIL} and we’ll do it for you.`,
      )
      return
    }
    dialog.close()
    // the account is gone, so only the session stored in this browser is left to clear
    await auth.auth.signOut({ scope: 'local' })
    show('deleted')
    $('#deleted-heading').focus()
  })

  handleSignInLink().then((linkProblem) => {
    auth.auth.getSession().then(({ data }) => {
      if (data.session) loadSignedIn(false)
      else {
        show('signed-out')
        if (linkProblem) signIn.show(linkProblem)
      }
    })
  })
}
