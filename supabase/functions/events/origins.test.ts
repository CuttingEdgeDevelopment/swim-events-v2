// Run with `deno test supabase/functions/events`
import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import { clientIp, hashIp, isAllowedOrigin } from './origins.ts'

Deno.test('the site, previews and local development are allowed', () => {
  for (const origin of [
    'https://swim-events.com',
    'https://www.swim-events.com',
    'https://swim-events.netlify.app',
    'https://deploy-preview-38--swim-events.netlify.app',
    'http://localhost:4321',
    'http://127.0.0.1:4321',
  ]) {
    assertEquals(isAllowedOrigin(origin), true, origin)
  }
})

Deno.test('other sites and missing origins are refused', () => {
  for (const origin of [
    null,
    '',
    'https://example.com',
    'http://swim-events.com',
    'https://swim-events.com.example.com',
    'https://evil-swim-events.com',
    'https://deploy-preview-38--swim-events.netlify.app.example.com',
    'https://swim-events-copy.netlify.app',
  ]) {
    assertEquals(isAllowedOrigin(origin), false, String(origin))
  }
})

Deno.test('the visitor IP is the first forwarded address', () => {
  assertEquals(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7')
  assertEquals(clientIp(new Headers({ 'x-real-ip': '203.0.113.8' })), '203.0.113.8')
  assertEquals(clientIp(new Headers()), 'unknown')
})

Deno.test('hashes are hex digests that depend on the salt', async () => {
  const a = await hashIp('203.0.113.7', 'salt-a')
  assertEquals(/^[0-9a-f]{64}$/.test(a), true)
  assertEquals(a, await hashIp('203.0.113.7', 'salt-a'))
  assertNotEquals(a, await hashIp('203.0.113.7', 'salt-b'))
})
