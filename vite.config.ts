import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}

function vendorTapRoutingPlugin() {
  const publicRoot = path.resolve(process.cwd(), 'public')
  const rewriteMiddleware = (
    req: { url?: string; method?: string },
    res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: Buffer | string) => void },
    next: () => void,
  ) => {
    if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) {
      next()
      return
    }
    const [rawPathname] = req.url.split('?')
    let pathname = decodeURIComponent(rawPathname)
    if (pathname === '/vendor-tap' || pathname === '/vendor-tap/') {
      pathname = '/vendor-tap/index.html'
    } else if (pathname === '/vendor-tap/app') {
      pathname = '/vendor-tap/app.html'
    }

    if (
      pathname.startsWith('/vendor-tap/') ||
      pathname.startsWith('/assets/') ||
      pathname === '/aula-head.png'
    ) {
      const candidate = path.resolve(publicRoot, '.' + pathname)
      if (candidate.startsWith(publicRoot) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const ext = path.extname(candidate).toLowerCase()
        res.statusCode = 200
        res.setHeader('Content-Type', MIME_BY_EXT[ext] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        if (req.method === 'HEAD') {
          res.end()
        } else {
          res.end(fs.readFileSync(candidate))
        }
        return
      }
    }
    next()
  }
  return {
    name: 'openhero68-vendor-tap-routing',
    configureServer(server: { middlewares: { use: (fn: typeof rewriteMiddleware) => void } }) {
      server.middlewares.use(rewriteMiddleware)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof rewriteMiddleware) => void } }) {
      server.middlewares.use(rewriteMiddleware)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'HERO68_')
  const extraDomains = (env.HERO68_DEV_HOSTS ?? '').split(',').map(host => host.trim()).filter(Boolean)
  return {
    plugins: [
      vendorTapRoutingPlugin(),
      react(),
      basicSsl({
        name: 'hero68-dev',
        domains: [...new Set(['localhost', '127.0.0.1', ...extraDomains])],
      }),
    ],
    server: { host: '0.0.0.0', allowedHosts: true },
    preview: { host: '0.0.0.0', allowedHosts: true },
  }
})
