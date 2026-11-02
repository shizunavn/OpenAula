import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// The vendor app is copied verbatim from hero.aulastar.com by
// tools/copy-vendor-tap.mjs. These checks cover the parts of the capture page we
// wrote ourselves; the browser check on a real keyboard is the remaining proof.

const read = (file) => readFileSync(`public/vendor-tap/${file}`, 'utf8')

test('the capture page keeps the recording controls wired to the tap', () => {
  const page = read('index.html')
  for (const id of ['frame', 'open', 'start', 'save', 'status']) assert.ok(page.includes(`id="${id}"`), `missing #${id}`)
  assert.ok(page.includes('src="capture.js"'))
  assert.ok(!page.includes('./app-'), 'the iframe must point at app.html')
})

test('saving a log downloads a JSON document with the tap format', () => {
  const tap = read('tap.js')
  assert.ok(tap.includes("format: 'openhero68-vendor-tap'"))
  assert.ok(tap.includes('link.download = name'))
  assert.ok(tap.includes('JSON.stringify(doc, null, 1)'))
})

test('the tap records both directions and bounds the log', () => {
  const tap = read('tap.js')
  assert.ok(tap.includes('if (entries.length >= MAX_ENTRIES) dropped++'))
  assert.ok(tap.includes('t.data=this.__ohTap(t.data)'))
  assert.ok(tap.includes('return this.__ohTap(this._ensureUint8Array(t))'))
})
