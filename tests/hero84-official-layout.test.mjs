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
const { heroLayout } = await bundle('src/keyboard/layout.ts')
const { HERO68_KEY_POSITIONS, HERO84_KEY_POSITIONS } = await bundle('src/protocol/hero68/keyPositions.ts')
const { HERO84_ONLY_KEYS } = await bundle('src/keyboard/hero84Layout.ts')
const HERO84_LAYOUT = heroLayout('hero84')

// AULA_2829 (HERO 84 HE), "default_key_layer" 0 / WIN, from the official AULA web
// driver. `pos` = protocol key position, `keyCode` = raw remap value, `lightPos` =
// official per-key LED index (60 distinct LEDs for the 84 keys).
const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/hero84-official-layout.json', import.meta.url), 'utf8'))
const official = rows.flat()
const officialById = new Map(official.map((key) => [key.id, key]))

test('official table covers exactly the 84 HERO84 keys, once each', () => {
  assert.deepEqual(rows.map((row) => row.length), [16, 15, 15, 14, 14, 10])
  assert.equal(officialById.size, 84)
  assert.deepEqual([...officialById.keys()].sort(), Object.keys(HERO84_KEY_POSITIONS).sort())
})

test('HERO84_KEY_POSITIONS matches the official "pos" of every key', () => {
  for (const [keyId, key] of officialById) assert.equal(HERO84_KEY_POSITIONS[keyId], key.pos, keyId)
})

test('HERO68 and HERO84 address the 68 shared keys with the same "pos"', () => {
  for (const [keyId, pos] of Object.entries(HERO68_KEY_POSITIONS)) {
    assert.equal(HERO84_KEY_POSITIONS[keyId], pos, keyId)
  }
})

test('HERO84-only keys are the 16 the official layout adds', () => {
  const shippedOnly = HERO84_ONLY_KEYS.map((key) => key.id).sort()
  const officialOnly = Object.keys(HERO84_KEY_POSITIONS)
    .filter((keyId) => !(keyId in HERO68_KEY_POSITIONS))
    .sort()
  assert.deepEqual(shippedOnly, officialOnly)
  assert.equal(shippedOnly.length, 16)
})

test('HERO84 layout rows and order follow the official table', () => {
  assert.deepEqual(HERO84_LAYOUT.rows.map((row) => row.length), rows.map((row) => row.length))
  const shipped = HERO84_LAYOUT.rows.map((row) => row.filter((key) => !key.spacer).map((key) => key.id))
  const expected = rows.map((row) => row.map((key) => key.id))
  // Bottom-right nav cluster: the driver lists Left/Down/Right before R_Ctrl, so
  // that one row is compared as a set; every other row is compared in order.
  assert.deepEqual(shipped.slice(0, -1), expected.slice(0, -1))
  assert.deepEqual(new Set(shipped.at(-1)), new Set(expected.at(-1)))
})

test('HERO84 matrixKey rows still follow the guessed grid', () => {
  // matrixKey is (row << 8 | column), used by key input and gamepad remapping.
  // The official 84-key board does not fit a 15-cell window (0.75U keys, a 6.25U
  // Space), so these columns are still guesses and only a real remap dump replaces
  // them; this test pins the current guess so any change stays deliberate.
  const matrixRows = HERO84_LAYOUT.rows
    .map((row) => row.filter((key) => !key.spacer).map((key) => key.matrixKey >> 8))
  const distinctRows = matrixRows.map((row) => [...new Set(row)])
  const expected = [[1, 9, 2], [0, 1], [2, 3], [3], [4], [5]]
  for (const [index, lives] of expected.entries()) {
    assert.deepEqual(distinctRows[index], lives, `row ${index}`)
  }
  assert.deepEqual(matrixRows.map((row) => row[0]), [1, 0, 2, 3, 4, 5])
})

