/** Sites allowed to load events from the function: production, Netlify previews and local development. */
const ALLOWED = [
  /^https:\/\/(www\.)?swim-events\.com$/,
  /^https:\/\/swim-events\.netlify\.app$/,
  /^https:\/\/[a-z0-9-]+--swim-events\.netlify\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/,
]

export const isAllowedOrigin = (origin: string | null): origin is string =>
  !!origin && ALLOWED.some((pattern) => pattern.test(origin))

/** The visitor's IP: the first entry of x-forwarded-for, set by the Supabase gateway. */
export const clientIp = (headers: Headers): string =>
  headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown'

/** SHA-256 of salt + IP, so the database never stores an address. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}
