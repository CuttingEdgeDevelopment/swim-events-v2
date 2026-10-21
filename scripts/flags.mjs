/**
 * Copies the round flag of every country in `src/lib/countries.ts` from the circle-flags
 * package (MIT) to `public/flags/<IOC>.svg` and optimises them with svgo.
 * Run with `npm run flags` after adding a country.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const source = new URL('../node_modules/circle-flags/flags/', import.meta.url)
const target = new URL('../public/flags/', import.meta.url)
const countries = readFileSync(new URL('../src/lib/countries.ts', import.meta.url), 'utf8')
const entries = [...countries.matchAll(/^ {2}([A-Z]{3}): \{ name: .+, iso: '([a-z]{2})' \},$/gm)]

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
for (const [, ioc, iso] of entries) copyFileSync(new URL(`${iso}.svg`, source), new URL(`${ioc}.svg`, target))
copyFileSync(new URL('../LICENSE.md', source), new URL('LICENSE', target))

execFileSync('npx', ['svgo', '--quiet', '--folder', target.pathname], { stdio: 'inherit' })
console.log(`${entries.length} flags in public/flags`)
