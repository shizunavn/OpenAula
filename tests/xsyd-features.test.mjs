import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'

const build = await rolldown({input: 'src/protocol/xsyd/features.ts'})
const {output} = await build.generate({format: 'esm'})
await build.close()
const {
  buildFieldWriteFrame,
  buildFieldWritePayload,
  buildGlobalActuationReadFrame,
  buildGlobalActuationWriteFrame,
  decodeFieldWritePayload,
  decodeGlobalActuationReply,
  chunkFieldWrites,
  XsydFeatureField,
  XSYD_FEATURE_SLOTS,
  umToMm,
  mmToUm,
  wirePosForCode,
  XSYD_KEYS,
} = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)

/** Header + declared payload, lowercase hex. */
const hex = frame => [...frame.slice(0, 4 + frame[1])].map(b => b.toString(16).padStart(2, '0')).join('')

const capture = file => hex(buildFieldWriteFrame(file))

// Every expectation below is a frame captured on real hardware. The app always
// sends flag 1 (14 slots); unused slots are padded with `ff ff 00 00`.
test('S/D/F remap frames match the capture byte for byte', () => {
  // S_D_F_to-B_C_D_and_revert.pcapng, first three writes.
  assert.equal(
    capture([{pos: 0x16, field: XsydFeatureField.Remap, value: 0x05}]),
    '5c3923ed' + '01' + '16000500' + 'ffff0000'.repeat(13)
  )
  assert.equal(
    capture([{pos: 0x07, field: XsydFeatureField.Remap, value: 0x06}]),
    '5c3923ed' + '01' + '07000600' + 'ffff0000'.repeat(13)
  )
  assert.equal(
    capture([{pos: 0x09, field: XsydFeatureField.Remap, value: 0x07}]),
    '5c3923ed' + '01' + '09000700' + 'ffff0000'.repeat(13)
  )
})

test('switching one key type (yongchun capture) round-trips', () => {
  assert.equal(
    capture([{pos: 0x04, field: XsydFeatureField.SwitchType, value: 1}]),
    '5c3923ed' + '01' + '04190100' + 'ffff0000'.repeat(13)
  )
  assert.equal(
    capture([{pos: 0x08, field: XsydFeatureField.SwitchType, value: 0}]),
    '5c3923ed' + '01' + '08190000' + 'ffff0000'.repeat(13)
  )
})

test('actuation travel frame and 0x29 global actuation match capture byte for byte', () => {
  // actutation2.0global_wasd1.0RT..., frame 0: Global actuation 2.0 mm (2000 um = 0x07d0)
  assert.equal(
    hex(buildGlobalActuationWriteFrame(2000)),
    '5c0f29c9' + '010000d007' + '00'.repeat(10)
  )
  assert.equal(
    hex(buildGlobalActuationReadFrame()),
    '5c0f29c9' + '00'.repeat(15)
  )
  assert.equal(
    decodeGlobalActuationReply({
      opcode: 0xa9,
      checksumValid: true,
      payload: Uint8Array.from([0x00, 0x00, 0x00, 0xf4, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    }),
    500
  )

  // actutation2.0global_wasd1.0RT..., frame 1: W/A/S/D 1.0 mm plus the 0x20 header.
  const frame = buildFieldWriteFrame([
    {pos: 0x1a, field: XsydFeatureField.Header, value: 0x20},
    {pos: 0x1a, field: XsydFeatureField.Travel, value: 1000},
    {pos: 0x04, field: XsydFeatureField.Header, value: 0x20},
    {pos: 0x04, field: XsydFeatureField.Travel, value: 1000},
    {pos: 0x16, field: XsydFeatureField.Header, value: 0x20},
    {pos: 0x16, field: XsydFeatureField.Travel, value: 1000},
    {pos: 0x07, field: XsydFeatureField.Header, value: 0x20},
    {pos: 0x07, field: XsydFeatureField.Travel, value: 1000},
  ])
  assert.equal(
    hex(frame),
    '5c3923ed01' +
      '1a0820001a04e803040820000404e803160820001604e803070820000704e803' +
    // The vendor app zero-fills the unused slots in this capture.
    'ffff0000'.repeat(6)
  )
  // Space 1.51 mm (capture frame 2: header + travel, 13 zero slots).
  assert.equal(
    hex(
      buildFieldWriteFrame([
        {pos: 0x2c, field: XsydFeatureField.Header, value: 0x20},
        {pos: 0x2c, field: XsydFeatureField.Travel, value: 1510},
      ])
    ).slice(0, '5c3923ed01'.length + 8 * 2),
    '5c3923ed01' + '2c0820002c04e605'
  )
})

test('verified 0x23 field IDs match firmware VA 0x1C6DC / 0x1C744', () => {
  assert.equal(XsydFeatureField.Remap, 0x00)
  assert.equal(XsydFeatureField.Travel, 0x04)
  assert.equal(XsydFeatureField.MptDepth1, 0x05)
  assert.equal(XsydFeatureField.MptDepth2, 0x06)
  assert.equal(XsydFeatureField.MptDepth3, 0x07)
  assert.equal(XsydFeatureField.Header, 0x08)
  assert.equal(XsydFeatureField.RapidTriggerPress, 0x14)
  assert.equal(XsydFeatureField.RapidTriggerRelease, 0x15)
  assert.equal(XsydFeatureField.TopDeadzone, 0x16)
  assert.equal(XsydFeatureField.BottomDeadzone, 0x17)
  assert.equal(XsydFeatureField.SwitchType, 0x19)
})

test('mm and um helpers keep the capture values', () => {
  assert.equal(mmToUm(1), 1000)
  assert.equal(mmToUm(1.51), 1510)
  assert.equal(mmToUm(0.2), 200)
  assert.equal(mmToUm(0.15), 150)
  assert.equal(mmToUm(0.02), 20)
  assert.equal(umToMm(1510), 1.51)
})

test('the payload is always 57 bytes, padding is ff ff 00 00', () => {
  const payload = buildFieldWritePayload([{pos: 0x16, field: 0, value: 5}])
  assert.equal(payload.length, 1 + 4 * XSYD_FEATURE_SLOTS)
  assert.equal(payload[0], 0x01)
  assert.deepEqual([...payload.slice(5, 9)], [0xff, 0xff, 0x00, 0x00])
})

test('decode drops padding and restores values', () => {
  const writes = [
    {pos: 0x11, field: XsydFeatureField.RapidTriggerPress, value: 150},
    {pos: 0x11, field: XsydFeatureField.RapidTriggerRelease, value: 150},
    {pos: 0x10, field: XsydFeatureField.TopDeadzone, value: 1000},
    {pos: 0x10, field: XsydFeatureField.BottomDeadzone, value: 300},
  ]
  assert.deepEqual(decodeFieldWritePayload(buildFieldWritePayload(writes)), writes)
})

test('more than 14 writes are split into frames', () => {
  const writes = Array.from({length: 30}, (_, i) => ({pos: i, field: 0, value: i}))
  const frames = chunkFieldWrites(writes)
  assert.deepEqual(frames.map(f => f.length), [14, 14, 2])
  assert.deepEqual(frames.flat(), writes)
})

test('wirePosForCode maps layout codes to capture positions', () => {
  // pos in a `0x23` frame is the full wire index (keymap.ts `index`),
  // not the low 5 bits used inside the firmware cell address.
  assert.equal(wirePosForCode('KeyA'), 0x40)
  assert.equal(wirePosForCode('KeyZ'), 0x56)
  assert.equal(wirePosForCode('KeyQ'), 0x2b)
  assert.equal(wirePosForCode('KeyW'), 0x2c)
  assert.equal(wirePosForCode('KeyE'), 0x2d)
  assert.equal(wirePosForCode('Space'), 0x6f)
  assert.equal(wirePosForCode('NotAKey'), undefined)
})

test('wire pos decodes to the firmware cell', () => {
  const cell = pos => (pos >> 5) * 0x15 + (pos & 0x1f)
  const rows = [
    ['KeyA', 0x40, 0x00, 0x00],
    ['KeyS', 0x41, 0x01, 0x01],
    ['KeyZ', 0x56, 0x16, 0x16],
    ['KeyQ', 0x2b, 0x0b, 0x0b],
    ['KeyW', 0x2c, 0x0c, 0x0c],
    ['KeyE', 0x2d, 0x0d, 0x0d],
    ['Space', 0x6f, 0x10, 0x10],
  ]
  for (const [code, wire, capturePos, expectedCell] of rows) {
    assert.equal(wirePosForCode(code), wire, code)
    assert.equal(cell(capturePos), expectedCell, `${code}: cell`)
  }
  assert.equal(wirePosForCode('KeyN'), 0x5b)
  assert.equal(wirePosForCode('KeyM'), 0x5c)
  for (const key of XSYD_KEYS) assert.ok(key.index - 1 < 126, key.code)
})

test('bad input is rejected', () => {
  assert.throws(() => buildFieldWritePayload(Array(15).fill({pos: 1, field: 0, value: 0})), RangeError)
  assert.throws(() => buildFieldWritePayload([{pos: 0xff, field: 0, value: 0}]), RangeError)
  assert.throws(() => buildFieldWritePayload([{pos: 1, field: 0, value: 0x10000}]), RangeError)
})
