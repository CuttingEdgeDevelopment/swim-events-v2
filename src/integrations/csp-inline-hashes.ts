/**
 * Adds a hash of every inline script in the built pages to the page's Content Security Policy, so
 * the browser runs exactly these scripts and nothing else written into the page.
 *
 * Astro writes the policy as a <meta> tag (security.csp in astro.config.mjs) with hashes for the
 * scripts it bundles, but not for `is:inline` scripts (AuthState, SimpleAnalyticsEvents, the dark
 * mode switch, the embed theme), and astro-compress rewrites inline scripts after Astro hashed them.
 * So this runs last, on the final files: it hashes each inline script as it is now and adds the
 * hashes that are missing. JSON data blocks (type="application/ld+json") aren't run, so they need none.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

const CSP_META = /<meta\b[^>]*http-equiv=["']?content-security-policy["']?[^>]*>/i
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const RUNS = /^(?:|module|text\/javascript|application\/javascript)$/i

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => join(entry.parentPath, entry.name))
}

function attribute(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, 'i'))
  if (!match) return null
  return match[1] ?? match[2] ?? match[3] ?? ''
}

/** The hashes of the inline scripts in `html` that the browser runs. */
function inlineScriptHashes(html: string): Set<string> {
  const hashes = new Set<string>()
  for (const [, attributes, body] of html.matchAll(SCRIPT)) {
    if (attribute(attributes, 'src') !== null) continue
    if (!RUNS.test(attribute(attributes, 'type') ?? '')) continue
    if (!body.trim()) continue
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`)
  }
  return hashes
}

/** `html` with the missing hashes added to script-src; throws when a page has no policy. */
export function addInlineHashes(html: string, file: string): string {
  const meta = html.match(CSP_META)?.[0]
  if (!meta) throw new Error(`No Content Security Policy in ${file}`)

  const hashes = [...inlineScriptHashes(html)].filter((hash) => !meta.includes(hash))
  if (hashes.length === 0) return html
  if (!/script-src\s/.test(meta)) throw new Error(`No script-src in the Content Security Policy of ${file}`)

  const updated = meta.replace(/script-src\s/, (directive) => `${directive}${hashes.join(' ')} `)
  return html.replace(meta, updated)
}

export default function cspInlineHashes(): AstroIntegration {
  return {
    name: 'csp-inline-hashes',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const files = await htmlFiles(fileURLToPath(dir))
        for (const file of files) {
          const html = await readFile(file, 'utf8')
          const updated = addInlineHashes(html, file)
          if (updated !== html) await writeFile(file, updated)
        }
        logger.info(`Inline script hashes checked in ${files.length} pages`)
      },
    },
  }
}
