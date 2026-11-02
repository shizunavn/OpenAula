import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const withCf = (url, cf) => {
  const request = new Request(url)
  if (cf) Object.defineProperty(request, 'cf', { value: cf })
  return request
}

test('worker /api/region detects country and language', async () => {
  const { default: worker } = await import('../worker/index.js')
  const call = async (url, cf) => {
    const res = await worker.fetch(withCf(url, cf), {})
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8')
    assert.equal(res.headers.get('cache-control'), 'private, no-store, max-age=0')
    return res.json()
  }
  assert.deepEqual(await call('https://open-hero68.example/api/region', { country: 'VN' }), { region: 'VN', country: 'VN', suggestedLanguage: 'vi' })
  assert.deepEqual(await call('https://open-hero68.example/api/region/', { country: 'vn' }), { region: 'VN', country: 'VN', suggestedLanguage: 'vi' })
  assert.deepEqual(await call('https://open-hero68.example/api/region', { country: 'US' }), { region: 'OTHER', country: 'US', suggestedLanguage: 'en' })
  assert.deepEqual(await call('https://open-hero68.example/api/region'), { region: 'OTHER', country: null, suggestedLanguage: 'en' })
})

test('worker /api/health returns status and edge location', async () => {
  const { default: worker } = await import('../worker/index.js')
  const res = await worker.fetch(withCf('https://open-hero68.example/api/health', { colo: 'HAN', country: 'VN', city: 'Hanoi' }), {})
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, 'ok')
  assert.equal(body.edge.colo, 'HAN')
  assert.equal(body.edge.country, 'VN')
  assert.equal(body.edge.city, 'Hanoi')
  assert.ok(body.timestamp)
})

test('worker rejects unknown API routes and non-GET methods, passes everything else to assets', async () => {
  const { default: worker } = await import('../worker/index.js')
  assert.equal((await worker.fetch(withCf('https://open-hero68.example/api/nope'), {})).status, 404)
  assert.equal((await worker.fetch(new Request('https://open-hero68.example/api/region', { method: 'POST' }), {})).status, 405)
  const asset = new Response('static')
  const env = { ASSETS: { fetch: () => asset } }
  assert.equal(await worker.fetch(withCf('https://open-hero68.example/'), env), asset)
})

test('public/_headers defines WebHID permissions policy and asset caching', async () => {
  const content = await readFile(path.resolve('public/_headers'), 'utf8')
  assert.ok(content.includes('Permissions-Policy: hid=*, usb=*, serial=*'), '_headers must permit WebHID')
  assert.ok(content.includes('/assets/*'), '_headers must configure /assets/* cache')
})

test('Pages Functions are thin wrappers and no hand-written Pages routing files exist', async () => {
  for (const file of ['public/_routes.json', 'public/_worker.js', 'public/_redirects']) {
    assert.equal(existsSync(path.resolve(file)), false, `${file} must not exist (Pages generates routes from functions/)`)
  }
  const region = await import('../functions/api/region.js')
  const res = await region.onRequest({ request: withCf('https://open-hero68.pages.dev/api/region', { country: 'VN' }) })
  assert.deepEqual(await res.json(), { region: 'VN', country: 'VN', suggestedLanguage: 'vi' })
  const health = await import('../functions/api/health.js')
  assert.equal((await health.onRequest({ request: withCf('https://open-hero68.pages.dev/api/health') })).status, 200)
  const ignore = await readFile(path.resolve('public/.assetsignore'), 'utf8')
  assert.ok(ignore.includes('_worker.js') && ignore.includes('_routes.json'), '.assetsignore must exclude Pages files from uploads')
})

test('wrangler.jsonc is a Workers + static assets config, not a Pages config', async () => {
  const config = JSON.parse((await readFile(path.resolve('wrangler.jsonc'), 'utf8')).replace(/^\s*\/\/.*$/gm, ''))
  assert.equal(config.pages_build_output_dir, undefined)
  assert.equal(config.main, 'worker/index.js')
  assert.equal(config.assets.directory, './dist')
  assert.equal(config.assets.binding, 'ASSETS')
  assert.equal(config.assets.not_found_handling, 'single-page-application')
  assert.deepEqual(config.assets.run_worker_first, ['/api/*'])
  assert.equal(existsSync(path.resolve('wrangler.toml')), false, 'keep a single wrangler config')
})
