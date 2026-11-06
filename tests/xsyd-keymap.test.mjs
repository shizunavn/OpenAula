import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'

const build = await rolldown({input: 'src/protocol/xsyd/keymap.ts'})
const {output} = await build.generate({format: 'esm'})
await build.close()
const {XSYD_KEYS, XSYD_KEYS_BY_INDEX} =
  await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)

test('covers exactly the 68 keys the firmware reports', () => {
  assert.equal(XSYD_KEYS.length, 68)
  assert.equal(XSYD_KEYS_BY_INDEX.size, 68)
})

test('wire indices follow the firmware row layout (row start 21 + 21n, 15 wide)', () => {
  for (const key of XSYD_KEYS) {
    const lane = key.index - 21
    assert.ok(lane >= 0 && lane <= 98, `index ${key.index} outside 21..119`)
    assert.ok(lane % 21 < 15, `index ${key.index} lands in a dead lane`)
  }
  const rowStarts = XSYD_KEYS.filter(key => (key.index - 21) % 21 === 0).map(key => key.index)
  assert.deepEqual(rowStarts, [21, 42, 63, 84, 105])
})

test('row 1 is Esc, 1..9, 0, -, =, Backspace, Insert', () => {
  const row = XSYD_KEYS.filter(key => key.index >= 21 && key.index <= 35)
  assert.deepEqual(
    row.map(key => key.usage),
    [0x29, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x2d, 0x2e, 0x2a, 0x49]
  )
  assert.equal(row[0].code, 'Escape')
  assert.equal(row[14].code, 'Insert')
})

test('letters and the bottom-right cluster match the firmware', () => {
  const at = index => XSYD_KEYS_BY_INDEX.get(index)
  assert.equal(at(64).code, 'KeyA')
  assert.equal(at(72).code, 'KeyL')
  assert.equal(at(86).code, 'KeyZ')
  assert.equal(at(92).code, 'KeyM')
  assert.equal(at(96).code, 'ShiftRight')
  assert.equal(at(97).code, 'ArrowUp')
  assert.equal(at(98).code, 'PageDown')
  assert.equal(at(119).code, 'ArrowRight')
})

test('modifier block carries real HID modifier usages', () => {
  const mods = XSYD_KEYS.filter(key => key.usage >= 0xe0 && key.usage <= 0xe7)
  assert.deepEqual(
    mods.map(key => [key.code, key.usage]),
    [
      ['ShiftLeft', 0xe1],
      ['ShiftRight', 0xe5],
      ['ControlLeft', 0xe0],
      ['MetaLeft', 0xe3],
      ['AltLeft', 0xe2],
      ['AltRight', 0xe6],
      ['ControlRight', 0xe4]
    ]
  )
})

test('every key has a unique code and a non-zero usage', () => {
  assert.equal(new Set(XSYD_KEYS.map(key => key.code)).size, 68)
  for (const key of XSYD_KEYS) assert.notEqual(key.usage, 0)
})
