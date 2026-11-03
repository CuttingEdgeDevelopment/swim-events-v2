/**
 * Share buttons. Where the browser has a share sheet (phones, Safari, Edge and Chrome on
 * Windows), Share opens it. Elsewhere it opens a small menu with Copy link, WhatsApp and
 * Email: plain links, no third-party scripts.
 */

export type ShareData = { title: string; text: string; url: string }

const COPIED_FOR_MS = 2000

const canNativeShare = () => typeof navigator.share === 'function'

function field<T extends HTMLElement = HTMLElement>(root: Element | DocumentFragment, name: string): T {
  return root.querySelector<T>(`[data-field="${name}"]`)!
}

/** Tell screen readers `text` through the status line, clearing it first so a repeat is read again. */
function announce(text: string): void {
  const status = document.getElementById('share-status')
  if (!status) return
  status.textContent = ''
  setTimeout(() => (status.textContent = text), 50)
}

/**
 * A Share button for `data`. `name` follows "Share" for screen readers only, so every
 * button on the page has its own name ("Share Geneva Swim Meet").
 */
export function shareButton(data: ShareData, name: string): DocumentFragment | null {
  const template = document.getElementById('share-button-template') as HTMLTemplateElement | null
  if (!template) return null

  const fragment = template.content.cloneNode(true) as DocumentFragment
  const button = fragment.querySelector<HTMLButtonElement>('.share-button')!
  button.dataset.shareTitle = data.title
  button.dataset.shareText = data.text
  button.dataset.shareUrl = data.url
  field(fragment, 'share-name').textContent = ` ${name}`
  // Only the menu opens and closes; the share sheet is the browser's own
  if (!canNativeShare()) button.setAttribute('aria-expanded', 'false')
  return fragment
}

function dataOf(button: HTMLElement): ShareData {
  return {
    title: button.dataset.shareTitle ?? document.title,
    text: button.dataset.shareText ?? '',
    url: button.dataset.shareUrl ?? location.href,
  }
}

function openMenu(button: HTMLButtonElement): void {
  closeMenus()
  const template = document.getElementById('share-menu-template') as HTMLTemplateElement | null
  if (!template) return

  const data = dataOf(button)
  const menu = template.content.firstElementChild!.cloneNode(true) as HTMLElement
  const message = `${data.text}\n${data.url}`
  menu.id = `share-menu-${Math.random().toString(36).slice(2)}`
  menu.querySelector<HTMLAnchorElement>('[data-share="whatsapp"]')!.href =
    `https://wa.me/?text=${encodeURIComponent(message)}`
  menu.querySelector<HTMLAnchorElement>('[data-share="email"]')!.href =
    `mailto:?subject=${encodeURIComponent(data.title)}&body=${encodeURIComponent(message)}`

  button.after(menu)
  button.setAttribute('aria-controls', menu.id)
  button.setAttribute('aria-expanded', 'true')
  menu.querySelector<HTMLElement>('.share-menu__item')?.focus()
}

/** Closes any open menu; `returnFocus` puts keyboard focus back on its Share button. */
function closeMenus(returnFocus = false): void {
  document.querySelectorAll<HTMLElement>('.share-menu').forEach((menu) => {
    const button = menu.previousElementSibling as HTMLButtonElement | null
    menu.remove()
    if (!button) return
    button.setAttribute('aria-expanded', 'false')
    button.removeAttribute('aria-controls')
    if (returnFocus) button.focus()
  })
}

/** "Link copied" on the button for a moment, and read out. */
function showCopied(button: HTMLButtonElement): void {
  const label = field(button, 'share-label')
  field(button, 'share-icon').toggleAttribute('hidden', true)
  field(button, 'copied-icon').toggleAttribute('hidden', false)
  label.textContent = 'Link copied'
  announce('Link copied')
  clearTimeout(Number(button.dataset.copiedTimer))
  button.dataset.copiedTimer = String(
    setTimeout(() => {
      field(button, 'share-icon').toggleAttribute('hidden', false)
      field(button, 'copied-icon').toggleAttribute('hidden', true)
      label.textContent = 'Share'
    }, COPIED_FOR_MS),
  )
}

async function copyLink(button: HTMLButtonElement): Promise<void> {
  const { url } = dataOf(button)
  closeMenus(true)
  try {
    await navigator.clipboard.writeText(url)
    showCopied(button)
  } catch {
    // No clipboard access (an old browser or a blocked permission): show the link to copy by hand
    window.prompt('Copy this link:', url)
  }
}

async function share(button: HTMLButtonElement): Promise<void> {
  if (!canNativeShare()) {
    if (button.getAttribute('aria-expanded') === 'true') closeMenus()
    else openMenu(button)
    return
  }

  try {
    await navigator.share(dataOf(button))
  } catch (error) {
    // Closing the share sheet is not an error; anything else falls back to the menu
    if ((error as DOMException).name === 'AbortError') return
    button.setAttribute('aria-expanded', 'false')
    openMenu(button)
  }
}

export function initShare(): void {
  if (document.body.dataset.shareBound) return
  document.body.dataset.shareBound = 'true'

  document.addEventListener('click', (event) => {
    const target = event.target as Element
    const button = target.closest<HTMLButtonElement>('.share-button')
    if (button) {
      share(button)
      return
    }

    const item = target.closest<HTMLElement>('.share-menu__item')
    if (item?.dataset.share === 'copy') {
      const menu = item.closest('.share-menu')
      copyLink(menu?.previousElementSibling as HTMLButtonElement)
      return
    }
    // WhatsApp and Email open on their own; the menu closes behind them
    if (item) setTimeout(() => closeMenus())
    else if (!target.closest('.share-menu')) closeMenus()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.querySelector('.share-menu')) closeMenus(true)
  })

  // Tabbing out of the menu closes it
  document.addEventListener('focusout', (event) => {
    const share = (event.target as Element).closest?.('.share')
    if (!share || !share.querySelector('.share-menu')) return
    const next = (event as FocusEvent).relatedTarget as Node | null
    if (next && !share.contains(next)) closeMenus()
  })
}
