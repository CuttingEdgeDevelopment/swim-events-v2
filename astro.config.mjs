import { defineConfig, envField } from 'astro/config'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'url'
import compress from 'astro-compress'
import icon from 'astro-icon'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import prerenderEvents from './src/integrations/prerender-events'
import cspInlineHashes from './src/integrations/csp-inline-hashes'

// Pages kept out of search results: they carry a noindex tag (embed.astro, and the noindex prop of
// DefaultLayout), and robots.txt must not block them, or search engines never see the tag
const NOT_IN_SITEMAP = ['/embed', '/account', '/submit', '/404']

// Supabase API (events, sign-in, submissions), from .env locally and the Netlify settings on deploy
const { PUBLIC_SUPABASE_URL } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '')
const SUPABASE_ORIGIN = PUBLIC_SUPABASE_URL ? new URL(PUBLIC_SUPABASE_URL).origin : ''

// Content Security Policy: which sources pages may load scripts, styles, data and frames from.
// Astro puts it in a <meta> tag on every page, with hashes for its bundled scripts; cspInlineHashes()
// adds the is:inline ones.
// A new outside service (a newsletter form, another analytics tool) must be added here, or the
// browser blocks it. frame-ancestors can't go in a <meta> tag: it is set in netlify.toml.
const csp = {
  directives: [
    "default-src 'self'",
    `connect-src 'self' ${SUPABASE_ORIGIN} https://queue.simpleanalyticscdn.com`,
    "img-src 'self' data: https://queue.simpleanalyticscdn.com",
    "font-src 'self'",
    // Cloudflare Turnstile, the sign-in check
    'frame-src https://challenges.cloudflare.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ],
  scriptDirective: {
    resources: ["'self'", 'https://scripts.simpleanalyticscdn.com', 'https://challenges.cloudflare.com'],
  },
  // The add-to-calendar button sets inline styles, which hashes can't cover
  styleDirective: {
    resources: ["'self'", "'unsafe-inline'"],
  },
}

const viteConfig = {
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [fileURLToPath(new URL('./src/assets', import.meta.url))],
        logger: {
          warn: () => {},
        },
      },
    },
  },
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@layouts': fileURLToPath(new URL('./src/layouts', import.meta.url)),
      '@assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
      '@content': fileURLToPath(new URL('./src/content', import.meta.url)),
      '@pages': fileURLToPath(new URL('./src/pages', import.meta.url)),
      '@public': fileURLToPath(new URL('./public', import.meta.url)),
      '@post-images': fileURLToPath(new URL('./public/posts', import.meta.url)),
      '@project-images': fileURLToPath(new URL('./public/projects', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
      '@theme-config': fileURLToPath(new URL('./theme.config.ts', import.meta.url)),
    },
  },
}

export default defineConfig({
  compressHTML: true,
  security: { csp },
  site: 'https://swim-events.com',
  integrations: [
    // Before compress(), which minifies what it writes
    prerenderEvents(),
    // Inline scripts stay as Astro wrote them: minifying them would break their CSP hashes
    compress(),
    // After compress(), so it hashes the inline scripts as they are finally written
    cspInlineHashes(),
    icon(),
    sitemap({ filter: (page) => !NOT_IN_SITEMAP.some((path) => new URL(page).pathname.startsWith(path)) }),
  ],
  vite: viteConfig,
  env: {
    schema: {
      PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public', url: true }),
      PUBLIC_SUPABASE_KEY: envField.string({ context: 'client', access: 'public' }),
    },
  },
})
