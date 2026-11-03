import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { rolldown } from 'rolldown'

async function bundle(input) {
  const b = await rolldown({ input, external: /^node:/ })
  try {
    const { output } = await b.generate({ format: 'esm', codeSplitting: false })
    return await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  } finally { await b.close() }
}
const { prepareFrame, framePackets, RgbFrameEncoder, frameKeyIds } = await bundle('service/frame.ts')
const { HERO68_KEY_IDS } = await bundle('src/keyboard/hero68Layout.ts')
const { HERO84_COLOR_SOURCES, HERO84_ONLY_KEYS } = await bundle('src/keyboard/hero84Layout.ts')
const { HERO68_KEY_POSITIONS, HERO84_KEY_POSITIONS } = await bundle('src/protocol/hero68/keyPositions.ts')

const hex = (i) => '#' + [i * 3, (i * 17) % 256, (i * 53) % 256].map((c) => c.toString(16).padStart(2, '0')).join('')
const frame68 = (paint = hex) => Object.fromEntries(HERO68_KEY_IDS.map((id, i) => [id, paint(i)]))
function unpack(packets) {
  const body = packets.flatMap((p) => [...p.slice(7, 7 + p[6])])
  const groups = []
  for (let i = 0; i < body.length;) { const n = body[i + 3]; groups.push({ color: body.slice(i, i + 3), ids: body.slice(i + 4, i + 4 + n) }); i += 4 + n }
  return { body, groups }
}

test('every HERO84-only key has a colour source that is a HERO68 key', () => {
  assert.deepEqual(Object.keys(HERO84_COLOR_SOURCES).sort(), HERO84_ONLY_KEYS.map((k) => k.id).sort())
  for (const source of Object.values(HERO84_COLOR_SOURCES)) assert.ok(HERO68_KEY_IDS.includes(source), source)
  assert.equal(frameKeyIds('hero84').length, 84)
  assert.equal(frameKeyIds('hero68').length, 68)
})

test('HERO68 frames are unchanged and never address HERO84-only positions', () => {
  const { groups } = unpack(framePackets(frame68()))
  const ids = groups.flatMap((g) => g.ids)
  assert.equal(ids.length, 68)
  assert.deepEqual([...ids].sort((a, b) => a - b), Object.values(HERO68_KEY_POSITIONS).sort((a, b) => a - b))
})

test('HERO84 frames cover all 84 hardware positions once and extras copy their source colour', () => {
  const frame = frame68()
  const prepared = prepareFrame(frame, undefined, 'hero84')
  const { groups, body } = unpack(prepared.packets)
  const ids = groups.flatMap((g) => g.ids)
  assert.equal(ids.length, 84)
  assert.deepEqual([...ids].sort((a, b) => a - b), Object.values(HERO84_KEY_POSITIONS).sort((a, b) => a - b))
  assert.ok(groups.length <= 32)
  assert.ok(prepared.packets.length <= 4)
  assert.ok(body.length <= 255, 'CMD08 aggregate length is a single byte')
  for (const [id, source] of Object.entries(HERO84_COLOR_SOURCES)) {
    const groupOf = (key) => groups.find((g) => g.ids.includes(HERO84_KEY_POSITIONS[key]))
    assert.equal(groupOf(id), groupOf(source), `${id} must share ${source}'s palette group`)
    assert.equal(prepared.keys[id], prepared.keys[source])
  }
  assert.equal(Object.keys(prepared.keys).length, 84)
})

test('HERO84 worst-case palette still fits 32 colours and 4 packets', () => {
  const prepared = prepareFrame(frame68((i) => hex(i + 7)), undefined, 'hero84')
  const { groups, body } = unpack(prepared.packets)
  assert.equal(groups.length, 32)
  assert.equal(groups.flatMap((g) => g.ids).length, 84)
  assert.ok(prepared.packets.length <= 4 && body.length <= 212)
})

test('an explicit colour for a HERO84-only key wins over its source', () => {
  const frame = { ...frame68(() => '#101010'), F1: '#ff0000' }
  const prepared = prepareFrame(frame, undefined, 'hero84')
  assert.equal(prepared.keys.F1, '#ff0000')
  assert.equal(prepared.keys.Digit1, '#101010')
})

test('incomplete HERO84 frames fail before HID output', () => {
  assert.throws(() => prepareFrame({}, undefined, 'hero84'))
  const missing = frame68(); delete missing.Digit1
  assert.throws(() => prepareFrame(missing, undefined, 'hero84'))
})

test('RgbFrameEncoder switches model, drops the cache, and keeps HERO68 as the default', () => {
  const encoder = new RgbFrameEncoder(), frame = frame68()
  assert.equal(unpack(encoder.prepare(frame).packets).groups.flatMap((g) => g.ids).length, 68)
  encoder.setModel('hero84')
  assert.equal(unpack(encoder.prepare(frame).packets).groups.flatMap((g) => g.ids).length, 84)
  encoder.setModel('hero68')
  assert.equal(unpack(encoder.prepare(frame).packets).groups.flatMap((g) => g.ids).length, 68)
})

test('native Rhythm hero84Extras table matches HERO84_COLOR_SOURCES', async () => {
  const header = await readFile('service/native/rhythm_core.h', 'utf8')
  const table = header.match(/hero84Extras = \{\{([\s\S]*?)\}\};/)[1]
  const pairs = [...table.matchAll(/\{(\d+),(\d+)\}/g)].map((m) => [Number(m[1]), Number(m[2])])
  const expected = Object.entries(HERO84_COLOR_SOURCES).map(([id, source]) => [HERO84_KEY_POSITIONS[id], HERO84_KEY_POSITIONS[source]])
  assert.deepEqual(pairs.sort((a, b) => a[0] - b[0]), expected.sort((a, b) => a[0] - b[0]))
})
