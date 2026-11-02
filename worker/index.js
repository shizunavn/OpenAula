import { handleHealth } from './health.js'
import { handleRegion } from './region.js'

// Cloudflare Workers + Static Assets entry point.
// wrangler.jsonc sets `assets.run_worker_first: ["/api/*"]`, so this Worker only
// runs for API routes. Everything else is served straight from dist/ (with the
// headers from public/_headers) and SPA fallback comes from
// `assets.not_found_handling: "single-page-application"`.
const routes = new Map([
  ['/api/region', handleRegion],
  ['/api/health', handleHealth],
])

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/'
    const handler = routes.get(pathname)
    if (handler) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
      }
      return handler(request)
    }
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404, headers: { 'cache-control': 'no-store' } })
    }
    return env.ASSETS.fetch(request)
  },
}
