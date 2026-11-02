import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { rolldown } from 'rolldown'

async function bundle(path) {
  const build = await rolldown({ input: path })
  try {
    const { output } = await build.generate({ format: 'esm' })
    return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  } finally { await build.close() }
}

const layouts = await bundle('src/keyboard/layout.ts')
const {
  HERO_DEVICE_MODELS,
  heroDeviceModel,
  detectHeroDeviceModelFromUuid,
  detectHeroDeviceModelFromProductName,
} = await bundle('src/keyboard/devices.ts')
const { HERO84_ONLY_KEYS } = await bundle('src/keyboard/hero84Layout.ts')
const positions = await bundle('src/protocol/hero68/keyPositions.ts')
const remap = await bundle('src/protocol/hero68/remap.ts')
const rgb = await bundle('src/protocol/hero68/rgb.ts')
const encoder = await bundle('src/protocol/hero68/hero68Encoder.ts')
const codec = await bundle('src/protocol/hero68/codec.ts')

test('both boards are offered with the documented key counts', () => {
  assert.deepEqual(HERO_DEVICE_MODELS.map((model) => model.id), ['hero68', 'hero84'])
  assert.equal(layouts.heroLayout('hero68').keyIds.length, 68)
  assert.equal(layouts.heroLayout('hero84').keyIds.length, 84)
})

test('HERO84 keeps every HERO68 key and only adds the 16 75% keys', () => {
  const hero68 = layouts.heroLayout('hero68').keyIds
  const hero84 = layouts.heroLayout('hero84').keyIds
  assert.ok(hero68.every((keyId) => hero84.includes(keyId)))
  assert.deepEqual(
    hero84.filter((keyId) => !hero68.includes(keyId)).sort(),
    HERO84_ONLY_KEYS.map((key) => key.id).sort(),
    'Backquote, F1–F12, PrtSc, Home, End',
  )
  assert.equal(HERO84_ONLY_KEYS.length, 16)
})

test('HERO84 key ids stay unique and every row is flush at 16U', () => {
  const { keyIds, rows } = layouts.heroLayout('hero84')
  assert.equal(new Set(keyIds).size, keyIds.length)
  const visible = rows.map((row) => row.filter((key) => !key.spacer).length)
  assert.deepEqual(visible, [16, 15, 15, 14, 14, 10])
  const rowWidths = rows.map((row) => row.reduce((sum, key) => sum + (key.width ?? 1), 0))
  assert.deepEqual(rowWidths, [16, 16, 16, 16, 16, 16])
  assert.equal(rows[0][0].id, 'Escape')
  assert.equal(rows[0][1].id, 'F1')
  assert.equal(rows[0][12].id, 'F12')
  assert.equal(rows[0][13].id, 'PrintScreen')
  assert.equal(rows[0][14].id, 'Insert')
  assert.equal(rows[0][15].id, 'Delete')
  assert.equal(rows[1][0].id, 'Backquote')
  assert.equal(rows[1].at(-1).id, 'Home')
  assert.equal(rows[2][0].id, 'Tab')
  assert.equal(rows[2].at(-1).id, 'End')
  assert.equal(rows[3].at(-1).id, 'PageUp')
  assert.equal(rows[4].at(-1).id, 'PageDown')
  assert.equal(rows[5].at(-1).id, 'ArrowRight')
})

test('HERO84 hardware key positions match official web driver keyValues (1..103)', () => {
  assert.equal(Object.keys(positions.HERO68_KEY_POSITIONS).length, 68)
  assert.equal(Object.keys(positions.HERO84_KEY_POSITIONS).length, 84)
  for (let i = 1; i <= 12; i++) {
    assert.equal(positions.keyIdToPos(`F${i}`), i + 1)
    assert.equal(positions.posToKeyId(i + 1), `F${i}`)
  }
  assert.equal(positions.keyIdToPos('Backquote'), 14)
  assert.equal(positions.keyIdToPos('PrintScreen'), 95)
  assert.equal(positions.keyIdToPos('Insert'), 98)
  assert.equal(positions.keyIdToPos('Delete'), 99)
  assert.equal(positions.keyIdToPos('Home'), 100)
  assert.equal(positions.keyIdToPos('End'), 101)
  assert.equal(positions.keyIdToPos('PageUp'), 102)
  assert.equal(positions.keyIdToPos('PageDown'), 103)
  for (const keyId of layouts.heroLayout('hero84').keyIds) {
    const pos = positions.keyIdToPos(keyId)
    assert.equal(positions.posToKeyId(pos), keyId)
  }
})

test('device model detection recognizes HERO68 and HERO84 UUIDs and productNames', () => {
  assert.equal(detectHeroDeviceModelFromUuid([0x11, 0, 0, 0, 0, 0x03]), 'hero68')
  assert.equal(detectHeroDeviceModelFromUuid([0x11, 0, 0, 0, 0, 0x05]), 'hero84')
  assert.equal(detectHeroDeviceModelFromUuid([0x12, 0, 0, 0, 0, 0x15]), 'hero84')
  assert.equal(detectHeroDeviceModelFromUuid([0, 0, 0, 0, 0, 0]), null)
  assert.equal(detectHeroDeviceModelFromProductName('HERO 84 HE'), 'hero84')
  assert.equal(detectHeroDeviceModelFromProductName('AULA HERO 75 HE'), 'hero84')
  assert.equal(detectHeroDeviceModelFromProductName('HERO 68 HE'), 'hero68')
  assert.equal(detectHeroDeviceModelFromProductName('Unknown Board'), null)
})

test('HERO84 84-key remap, RGB, and performance hydration round-trip cleanly', async () => {
  const hero84Ids = layouts.heroLayout('hero84').keyIds
  const layers84 = remap.defaultRemapLayers(hero84Ids)
  for (const layer of remap.REMAP_LAYERS) {
    assert.equal(Object.keys(layers84[layer]).length, 84)
    assert.equal(layers84[layer].Backquote, 53)
    assert.equal(layers84[layer].F1, 58)
    assert.equal(layers84[layer].F12, 69)
    assert.equal(layers84[layer].PrintScreen, 70)
    assert.equal(layers84[layer].Home, 74)
    assert.equal(layers84[layer].End, 77)
  }

  // Test 84-key RGB color packets (ceil(84 / 11) = 8 packets)
  const rgb84 = rgb.defaultRgb(hero84Ids)
  assert.equal(Object.keys(rgb84.colors).length, 84)
  const packets = rgb.rgbColorPackets(rgb84.colors, hero84Ids)
  assert.equal(packets.length, 8)

  // Test encoding performance save on HERO84-only keys (F1, Backquote, Home, End)
  const savePackets = encoder.hero68ProtocolEncoder.encodeSave({
    profileSlot: 1,
    tachyon: false,
    keys: ['F1', 'Backquote', 'PrintScreen', 'Home', 'End'].map((keyId) => ({
      keyId,
      matrixKey: 0,
      matrixHex: '0x0000',
      actuationMm: 1.2,
      rapidTriggerEnabled: true,
      splitSensitivity: false,
      rapidSensitivityMm: 0.4,
      pressSensitivityMm: 0.4,
      releaseSensitivityMm: 0.4,
      deadzoneEnabled: true,
      topDeadzoneMm: 0.1,
      bottomDeadzoneMm: 0.1,
      switchProfile: 'white',
    })),
  })
  assert.equal(savePackets.length, 5)
  for (const hex of savePackets) {
    const decoded = codec.decodeReport(Buffer.from(hex, 'hex'))
    assert.equal(decoded.checksumValid, true)
  }
})

test('HERO68 layout is untouched by the shared builder', () => {
  const { keyIds } = layouts.heroLayout('hero68')
  const source = fs.readFileSync('src/keyboard/hero68Layout.ts', 'utf8')
  for (const keyId of keyIds) assert.ok(source.includes(`id: '${keyId}'`), `missing ${keyId} in hero68Layout.ts`)
  assert.equal(keyIds.filter((keyId) => keyId.startsWith('F') && /^F\d+$/.test(keyId)).length, 0)
})

test('every layout key has demo lighting in a real color format', () => {
  for (const model of HERO_DEVICE_MODELS) {
    const layout = layouts.heroLayout(model.id)
    const frame = layout.makeDemoLighting()
    for (const keyId of layout.keyIds) {
      assert.ok(frame[keyId], `${model.id}:${keyId} has no demo color`)
      assert.match(frame[keyId], /^(#[0-9a-f]{6}|hsl\(|linear-gradient\()/i, `${model.id}:${keyId}`)
    }
  }
})

test('unknown models fail loudly', () => {
  assert.throws(() => layouts.heroLayout('hero96'), RangeError)
  assert.throws(() => heroDeviceModel('hero96'), RangeError)
  assert.equal(heroDeviceModel('hero84').layout, '75%')
})
