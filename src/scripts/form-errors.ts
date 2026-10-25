/**
 * Error messages on the submit and account forms: an inline message above each field,
 * linked with aria-describedby, and a summary at the top that links to the fields.
 * Every message carries an icon and a hidden "Error:", so it never relies on colour.
 */

const ERROR_ICON =
  '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>'

export type ShownError = { input: HTMLElement; message: string }

function errorId(input: HTMLElement): string {
  return `${input.id}-error`
}

/** The element the inline message goes before: the field's group, or the input itself. */
function anchorOf(input: HTMLElement): HTMLElement {
  return input.closest<HTMLElement>('[data-error-anchor]') ?? input
}

function describedBy(input: HTMLElement, add: string | null, remove: string): void {
  const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== remove)
  if (add) ids.push(add)
  if (ids.length) input.setAttribute('aria-describedby', ids.join(' '))
  else input.removeAttribute('aria-describedby')
}

export function showFieldError(input: HTMLElement, message: string): void {
  const id = errorId(input)
  let error = document.getElementById(id)
  if (!error) {
    error = document.createElement('p')
    error.id = id
    error.className = 'field-error'
    error.innerHTML = `${ERROR_ICON}<span><span class="sr-only">Error: </span><span data-text></span></span>`
    anchorOf(input).before(error)
  }
  error.querySelector('[data-text]')!.textContent = message
  input.setAttribute('aria-invalid', 'true')
  describedBy(input, id, id)
}

export function clearFieldError(input: HTMLElement): void {
  const id = errorId(input)
  document.getElementById(id)?.remove()
  input.removeAttribute('aria-invalid')
  describedBy(input, null, id)
}

/** Clears every inline message inside `root`. */
export function clearFieldErrors(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[aria-invalid="true"]').forEach(clearFieldError)
}

/**
 * Fills the summary box ("There are 2 problems", with links to the fields) and moves
 * focus to it. An empty list hides it.
 */
export function showErrorSummary(summary: HTMLElement, errors: ShownError[], messages: string[] = []): void {
  const count = errors.length + messages.length
  summary.hidden = count === 0
  if (count === 0) return

  summary.replaceChildren()
  const heading = document.createElement('h2')
  heading.innerHTML = ERROR_ICON
  heading.append(count === 1 ? 'There is a problem' : `There are ${count} problems`)
  const list = document.createElement('ul')
  for (const { input, message } of errors) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = `#${input.id}`
    link.textContent = message
    link.addEventListener('click', (event) => {
      event.preventDefault()
      input.focus()
      anchorOf(input).scrollIntoView({ block: 'center' })
    })
    item.append(link)
    list.append(item)
  }
  for (const message of messages) {
    const item = document.createElement('li')
    item.textContent = message
    list.append(item)
  }
  summary.append(heading, list)
  summary.focus()
}

/** A message box for problems that belong to no single field, such as a lost connection. */
export function showNotice(notice: HTMLElement, message: string | null): void {
  notice.hidden = !message
  if (!message) return
  notice.innerHTML = ERROR_ICON
  const text = document.createElement('p')
  text.textContent = message
  notice.append(text)
}

/** Marks a button busy without disabling it, so keyboard focus stays on it. */
export function setBusy(button: HTMLButtonElement, busy: boolean, busyLabel: string): void {
  const label = button.querySelector<HTMLElement>('[data-label]') ?? button
  if (busy) {
    button.dataset.idleLabel = label.textContent ?? ''
    label.textContent = busyLabel
    button.setAttribute('aria-disabled', 'true')
  } else {
    if (button.dataset.idleLabel !== undefined) label.textContent = button.dataset.idleLabel
    button.removeAttribute('aria-disabled')
  }
}

export function isBusy(button: HTMLButtonElement): boolean {
  return button.getAttribute('aria-disabled') === 'true'
}
