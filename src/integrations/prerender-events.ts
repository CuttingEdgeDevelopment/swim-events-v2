/**
 * Writes the event lists into the built home page (dist/index.html), so search engines, AI tools
 * and the first paint see every event without running JavaScript. The browser still loads the
 * latest events on every visit and renders the same lists again (src/scripts/events.ts).
 *
 * After `astro build`, this loads the events once through the `events` Edge Function, the same way
 * the browser does, then runs the page's own rendering code on a document made from the built
 * page (happy-dom, with scripts off). The built page shows names, places and dates only: the
 * countdowns depend on the day and the visitor's time zone, so the browser fills them in. It also
 * adds the events that haven't ended as structured data (src/lib/structured-data.ts).
 *
 * If the events can't be loaded, the build fails and Netlify keeps the last good version live.
 * The only exception is a build with the placeholder URL from CI (Dependabot runs get no
 * repository variables), which skips this step with a warning.
 *
 * A scheduled GitHub Actions workflow (.github/workflows/rebuild.yml) rebuilds the site every
 * night, so new events and events that ended move to the right list.
 */
import { readFile, writeFile } from 'node:fs/promises'
import type { AstroIntegration } from 'astro'
import { Window } from 'happy-dom'
import { loadEnv } from 'vite'
import { prerenderEvents } from '../scripts/events'
import { eventsData, jsonLd, SITE } from '../lib/structured-data'
import type { SwimEvent } from '../lib/supabase'

const PLACEHOLDER_HOST = 'placeholder.supabase.co'
const TIME_ZONE = 'Europe/Zurich'

/** Today in Zurich, where the site is run; the browser re-sorts the lists for each visitor's own date. */
function todayInZurich(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(now)
    .reduce<Record<string, number>>((all, part) => ({ ...all, [part.type]: Number(part.value) }), {})
  return { year: parts.year, month: parts.month, day: parts.day }
}

async function loadEvents(supabaseUrl: string): Promise<SwimEvent[]> {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/events`
  // The function only answers the site's own origins
  const response = await fetch(url, { headers: { Origin: SITE }, signal: AbortSignal.timeout(30_000) }).catch(
    (error: Error) => {
      throw new Error(`Loading events failed: ${error.message} (${url})`, { cause: error })
    },
  )
  if (!response.ok) throw new Error(`Loading events failed: HTTP ${response.status} from ${url}`)

  const events = (await response.json()) as SwimEvent[]
  // The site never has zero events, so an empty answer means something broke on the database side
  if (!Array.isArray(events) || events.length === 0) throw new Error(`Loading events failed: no events from ${url}`)
  return events
}

/** Runs `render` with the browser globals the rendering code uses pointing at `window`. */
function withBrowserGlobals(window: Window, render: () => void): void {
  const names = ['window', 'document', 'location', 'matchMedia', 'requestAnimationFrame'] as const
  const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name))
  const values = {
    window,
    document: window.document,
    location: window.location,
    matchMedia: window.matchMedia.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
  }
  for (const name of names) {
    Object.defineProperty(globalThis, name, { value: values[name], configurable: true, writable: true })
  }
  try {
    render()
  } finally {
    names.forEach((name, index) => {
      const descriptor = saved[index]
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete (globalThis as Record<string, unknown>)[name]
    })
  }
}

export default function prerenderEventsIntegration(): AstroIntegration {
  return {
    name: 'prerender-events',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const { PUBLIC_SUPABASE_URL: supabaseUrl = '' } = {
          ...loadEnv('production', process.cwd(), 'PUBLIC_'),
          ...process.env,
        }
        if (!supabaseUrl || new URL(supabaseUrl).hostname === PLACEHOLDER_HOST) {
          logger.warn('No Supabase URL: the home page is built without events (fine for CI, never for a deploy)')
          return
        }

        const events = await loadEvents(supabaseUrl)
        const file = new URL('index.html', dir)
        const html = await readFile(file, 'utf8')

        const window = new Window({
          url: `${SITE}/`,
          settings: {
            disableJavaScriptEvaluation: true,
            disableJavaScriptFileLoading: true,
            disableCSSFileLoading: true,
            disableIframePageLoading: true,
            navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true },
          },
        })
        try {
          window.document.write(html)
          const today = todayInZurich()
          withBrowserGlobals(window, () => prerenderEvents(events, today))

          const script = window.document.createElement('script')
          script.setAttribute('type', 'application/ld+json')
          const isoToday = [today.year, today.month, today.day].map((part) => String(part).padStart(2, '0')).join('-')
          const data = eventsData(events, isoToday)
          script.textContent = jsonLd(data)
          window.document.head.append(script)
          const doctype = html.match(/^<!doctype[^>]*>/i)?.[0] ?? '<!DOCTYPE html>'
          await writeFile(file, doctype + window.document.documentElement.outerHTML)
          logger.info(
            `Wrote ${events.length} events into index.html, ${(data['@graph'] as unknown[]).length} of them as structured data`,
          )
        } finally {
          await window.happyDOM.close()
        }
      },
    },
  }
}
