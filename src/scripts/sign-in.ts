/**
 * Sign-in with a 6-digit code (see SignIn.astro): email and terms, then the code from the
 * email. The same email has a sign-in link back to the page, handled by `handleSignInLink`.
 */
import { auth, TURNSTILE_SITE_KEY } from '../lib/auth'
import { CONTACT_EMAIL } from '../lib/submission'
import { clearFieldError, clearFieldErrors, isBusy, setBusy, showFieldError, showNotice } from './form-errors'

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

/** Supabase allows a new code after 60 seconds. */
const RESEND_SECONDS = 60
const PENDING_KEY = 'swim-events:sign-in-email'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

let turnstileScript: Promise<Turnstile> | null = null

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  turnstileScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing')))
    script.onerror = () => {
      turnstileScript = null
      reject(new Error('Turnstile failed to load'))
    }
    document.head.append(script)
  })
  return turnstileScript
}

// sessionStorage can be missing or blocked; the code step then only lasts until a reload
function remember(email: string | null): void {
  try {
    if (email) sessionStorage.setItem(PENDING_KEY, email)
    else sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // not stored, nothing else to do
  }
}

function remembered(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}

export type LinkProblem = 'expired' | 'other-browser' | null

const LINK_MESSAGES = {
  expired: {
    code: 'This sign-in link has expired or was already used. Enter the code from the email, or send a new one.',
    email: 'This sign-in link has expired or was already used. Enter your email address to get a new code.',
  },
  'other-browser': {
    code: 'This sign-in link only works in the browser where you asked for the code. Enter the 6-digit code from the same email instead.',
    email:
      'This sign-in link only works in the browser where you asked for the code. Open it there, or enter your email address here to get a new code.',
  },
}

/**
 * Finishes a sign-in from the link in the email (`?code=…`), or says why the link didn't
 * work. Removes the link's parameters from the address either way.
 */
export async function handleSignInLink(): Promise<LinkProblem> {
  const url = new URL(location.href)
  const code = url.searchParams.get('code')
  const linkError =
    url.searchParams.get('error_description') ?? new URLSearchParams(url.hash.slice(1)).get('error_description')
  if (!code && !linkError) return null

  for (const name of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(name)
  url.hash = ''
  history.replaceState(history.state, '', url)

  if (linkError) return 'expired'
  const { error } = await auth.auth.exchangeCodeForSession(code!)
  if (!error) {
    remember(null)
    return null
  }
  // the code verifier is kept in the browser that asked for the code
  return /verifier/i.test(error.message) ? 'other-browser' : 'expired'
}

export type SignIn = {
  /** Shows the sign-in steps, explaining a sign-in link that didn't work. */
  show: (linkProblem?: LinkProblem) => void
  hide: () => void
}

/** Wires up a SignIn.astro section. `onSignedIn` runs once the code is accepted. */
export function initSignIn(section: HTMLElement, onSignedIn: () => void): SignIn {
  const emailForm = section.querySelector<HTMLFormElement>('[data-step="email"]')!
  const codeForm = section.querySelector<HTMLFormElement>('[data-step="code"]')!
  const emailInput = emailForm.querySelector<HTMLInputElement>('#signin-email')!
  const termsInput = emailForm.querySelector<HTMLInputElement>('#signin-terms')!
  const sendButton = emailForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const emailNotice = section.querySelector<HTMLElement>('[data-field="email-notice"]')!
  const codeInput = codeForm.querySelector<HTMLInputElement>('#signin-code')!
  const verifyButton = codeForm.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const resendButton = codeForm.querySelector<HTMLButtonElement>('[data-action="resend"]')!
  const changeButton = codeForm.querySelector<HTMLButtonElement>('[data-action="change-email"]')!
  const codeNotice = section.querySelector<HTMLElement>('[data-field="code-notice"]')!
  const sentTo = section.querySelector<HTMLElement>('[data-field="sent-to"]')!
  const turnstileElement = section.querySelector<HTMLElement>('[data-field="turnstile"]')!
  const status = section.querySelector<HTMLElement>('[data-field="status"]')!

  let email = ''
  let captchaToken = ''
  let widgetId: string | null = null
  let resendTimer: number | undefined

  function startTurnstile(): void {
    if (widgetId !== null) return
    loadTurnstile()
      .then((turnstile) => {
        if (widgetId !== null || !turnstileElement.isConnected) return
        widgetId = turnstile.render(turnstileElement, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: 'interaction-only',
          theme: document.documentElement.classList.contains('darkmode') ? 'dark' : 'light',
          language: 'en',
          'response-field': false,
          callback: (token: string) => (captchaToken = token),
          'expired-callback': () => (captchaToken = ''),
          'error-callback': () => {
            captchaToken = ''
          },
        })
      })
      .catch(() => {
        showNotice(
          emailNotice,
          'The spam check couldn’t load. Check your connection, or turn off a blocker for challenges.cloudflare.com, then reload the page.',
        )
      })
  }

  // Turnstile tokens work once, so every request gets a fresh one
  function resetTurnstile(): void {
    captchaToken = ''
    if (widgetId !== null) window.turnstile?.reset(widgetId)
  }

  function showStep(step: 'email' | 'code'): void {
    emailForm.hidden = step !== 'email'
    codeForm.hidden = step !== 'code'
    section.setAttribute('aria-labelledby', step === 'email' ? 'signin-heading' : 'code-heading')
    section.querySelector<HTMLElement>(step === 'email' ? '#signin-heading' : '#code-heading')!.focus()
  }

  function countDown(): void {
    window.clearInterval(resendTimer)
    let left = RESEND_SECONDS
    const label = resendButton.querySelector<HTMLElement>('[data-label]')!
    const tick = () => {
      if (left <= 0) {
        window.clearInterval(resendTimer)
        label.textContent = 'Send a new code'
        resendButton.removeAttribute('aria-disabled')
        return
      }
      label.textContent = `Send a new code (in 0:${String(left).padStart(2, '0')})`
      resendButton.setAttribute('aria-disabled', 'true')
      left -= 1
    }
    tick()
    resendTimer = window.setInterval(tick, 1000)
  }

  function sendProblem(error: { status?: number; code?: string; message: string }): string {
    if (error.status === 429 || error.code?.startsWith('over_')) {
      return 'Too many codes were asked for in a short time. Wait a few minutes, then try again.'
    }
    if (/captcha/i.test(error.message)) return 'The spam check didn’t pass. Reload the page and try again.'
    if (error.code === 'email_address_invalid') return 'This email address can’t be used. Check it, or use another one.'
    if (!error.status) return 'We couldn’t reach the server. Check your connection and try again.'
    return `We couldn’t send the code. Try again later, or write to ${CONTACT_EMAIL}.`
  }

  async function sendCode(notice: HTMLElement, button: HTMLButtonElement): Promise<boolean> {
    if (!captchaToken) {
      showNotice(notice, 'The spam check is still running. Wait a moment, then try again.')
      startTurnstile()
      return false
    }
    setBusy(button, true, 'Sending…')
    status.textContent = 'Sending the code…'
    const { error } = await auth.auth.signInWithOtp({
      email,
      options: {
        captchaToken,
        shouldCreateUser: true,
        emailRedirectTo: `${location.origin}${location.pathname}`,
      },
    })
    resetTurnstile()
    setBusy(button, false, '')
    status.textContent = ''
    if (error) {
      showNotice(notice, sendProblem(error))
      notice.scrollIntoView({ block: 'nearest' })
      return false
    }
    showNotice(notice, null)
    return true
  }

  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (isBusy(sendButton)) return
    clearFieldErrors(emailForm)
    showNotice(emailNotice, null)

    email = emailInput.value.trim()
    const problems: HTMLElement[] = []
    if (!EMAIL_PATTERN.test(email)) {
      showFieldError(emailInput, email ? 'Enter an email address like name@example.com' : 'Enter your email address')
      problems.push(emailInput)
    }
    if (!termsInput.checked) {
      showFieldError(termsInput, 'Agree to the terms of service and the privacy policy to continue')
      problems.push(termsInput)
    }
    if (problems.length) {
      problems[0].focus()
      return
    }

    if (await sendCode(emailNotice, sendButton)) {
      remember(email)
      sentTo.textContent = email
      codeInput.value = ''
      clearFieldErrors(codeForm)
      showNotice(codeNotice, null)
      showStep('code')
      countDown()
    }
  })

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (isBusy(verifyButton)) return
    clearFieldError(codeInput)
    showNotice(codeNotice, null)

    const token = codeInput.value.replace(/\D/g, '')
    if (token.length !== 6) {
      showFieldError(codeInput, 'Enter the 6-digit code from the email')
      codeInput.focus()
      return
    }

    setBusy(verifyButton, true, 'Signing in…')
    const { error } = await auth.auth.verifyOtp({ email, token, type: 'email' })
    setBusy(verifyButton, false, '')
    if (error) {
      if (error.status === 429) {
        showNotice(codeNotice, 'Too many tries. Wait a few minutes, then send a new code.')
      } else if (!error.status) {
        showNotice(codeNotice, 'We couldn’t reach the server. Check your connection and try again.')
      } else {
        showFieldError(codeInput, 'This code is wrong or has expired. Check the latest email, or send a new code.')
        codeInput.focus()
      }
      return
    }
    remember(null)
    window.clearInterval(resendTimer)
    onSignedIn()
  })

  codeInput.addEventListener('input', () => {
    const digits = codeInput.value.replace(/\D/g, '').slice(0, 6)
    if (digits !== codeInput.value) codeInput.value = digits
  })

  resendButton.addEventListener('click', async () => {
    if (isBusy(resendButton)) return
    if (await sendCode(codeNotice, resendButton)) {
      status.textContent = `We sent a new code to ${email}.`
      countDown()
      codeInput.focus()
    }
  })

  changeButton.addEventListener('click', () => {
    remember(null)
    window.clearInterval(resendTimer)
    showStep('email')
    emailInput.focus()
  })

  return {
    show(linkProblem = null) {
      section.hidden = false
      startTurnstile()
      const pending = remembered()
      if (pending) {
        // came back after a reload, or from a sign-in link that didn't work here
        email = pending
        emailInput.value = pending
        sentTo.textContent = pending
        showStep('code')
        showNotice(codeNotice, linkProblem && LINK_MESSAGES[linkProblem].code)
      } else {
        showNotice(emailNotice, linkProblem && LINK_MESSAGES[linkProblem].email)
      }
    },
    hide() {
      section.hidden = true
      window.clearInterval(resendTimer)
    },
  }
}
