import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'

// The service writes Rhythm to a WIN 68 HE MAX with the XSYD `0x18`/`0x2A`
// encoder in service/native/rhythm_core.h. Those bytes cannot be executed here,
// so this test pins the two tables they depend on: the key order must stay the
// 68-key drawing order and the wire key values must stay `usage & 0xff`.
const layout = await readFile('src/keyboard/hero68Layout.ts', 'utf8')
const keymap = await readFile('src/protocol/xsyd/keymap.ts', 'utf8')
const header = await readFile('service/native/rhythm_core.h', 'utf8')
const editor = await readFile('src/components/RhythmSyncEditor.tsx', 'utf8')
const serviceLighting = await readFile('src/protocol/serviceLighting.ts', 'utf8')

const layoutIds = [...layout.matchAll(/\{ id: '([^']+)'/g)].map(m => m[1])
const usage = new Map(
  [...keymap.matchAll(/code: '([^']+)', usage: (0x[0-9a-fA-F]+)/g)].map(([, code, raw]) => [
    code === 'F1' ? 'Fn' : code,
    Number(raw) & 0xff,
  ]),
)

const block = (name) => {
  const start = header.indexOf(`constexpr std::array<const char*, 68> ${name}`) >= 0
    ? header.indexOf(`constexpr std::array<const char*, 68> ${name}`)
    : header.indexOf(`constexpr std::array<uint8_t, 68> ${name}`)
  assert.ok(start >= 0, `${name} missing`)
  const end = header.indexOf('}};', start)
  assert.ok(end > start, `${name} not closed`)
  return header.slice(start, end)
}

const headerIds = [...block('xsydLayoutIds').matchAll(/"([^"]+)"/g)].map(m => m[1])
const headerUsage = block('xsydLayoutUsage')
  .replace(/constexpr[^}]*\{\{/, '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean)
  .map(Number)

test('XSYD rhythm key order matches the 68-key layout', () => {
  assert.equal(layoutIds.length, 68)
  assert.deepEqual(headerIds, layoutIds)
})

test('XSYD rhythm key values match keymap usage & 0xff', () => {
  assert.equal(headerUsage.length, 68)
  const expected = layoutIds.map(id => {
    assert.ok(usage.has(id), `keymap has no entry for ${id}`)
    return usage.get(id)
  })
  assert.deepEqual(headerUsage, expected)
})

test('XSYD rhythm encoder uses the documented 0x18 and 0x2A layouts', () => {
  assert.match(header, /constexpr uint8_t xsydRgbOpcode = 0x18;/)
  assert.match(header, /constexpr uint8_t xsydPerKeyOpcode = 0x2a;/)
  assert.match(header, /constexpr uint8_t xsydPerKeyMode = 0x15;/)
  assert.match(header, /constexpr size_t xsydPerKeySlots = 14;/)
  // Checksum: magic + LEN + OP + 0x35 + last payload byte.
  assert.match(header, /xsydMagic \+ payload\.size\(\) \+ opcode \+ 0x35 \+ payload\.back\(\)/)
})

test('WIN 68 HE MAX RhythmPreview keeps SSE /frames stable and never overrides service frames with fake synth output', () => {
  assert.match(editor, /}, \[simulate, live, xsydLive, paused, sessionId, isWin68\]\);/)
  assert.doesNotMatch(editor, /value:\s*'web-synth'/)
  assert.match(editor, /const useBrowserWebAudio = isWin68 && \(!compatible \|\| current\.current\.endpoint\.startsWith\('web-'\)\);/)
  assert.doesNotMatch(serviceLighting, /status\.mode === 'rhythm' && status\.rhythmConfiguration && needsWebHidFallback && !xsydRhythmActive/)
})
