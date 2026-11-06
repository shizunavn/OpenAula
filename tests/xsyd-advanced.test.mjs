import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'

const build = await rolldown({input: 'src/protocol/xsyd/advanced.ts'})
const {output} = await build.generate({format: 'esm'})
await build.close()
const {
  buildEndFrame,
  buildMtFrame,
  buildMptFrame,
  buildTglFrame,
  XSYD_ADVANCED_DELAY_UNIT_MS,
  XSYD_PROTOCOL_VERSION,
} = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)

/** Header + declared payload, lowercase hex. */
const hex = frame => [...frame.slice(0, 4 + frame[1])].map(b => b.toString(16).padStart(2, '0')).join('')

test('device announced 1.0.9 in the handshake', () => {
  // connect_keyboard_to_webhidofficial.pcapng: 5c 05 80 15 | 00 01 09 01
  assert.equal(XSYD_PROTOCOL_VERSION, '1.0.9')
})

test('MT frame matches the capture byte for byte', () => {
  // W_MT_holdZ_ClickE_longpresstrigger200ms.pcapng@18
  // App state for W: keyValue 26, advanceKeyType 3, MTInfo{DKS:[29,8], Delay:200}
  assert.equal(
    hex(buildMtFrame({key: 26, hold: 29, tap: 8, delayMs: 200})),
    '5c0724d0' + '011a1d00080014'
  )
  // set_MT_at_W-holdZ-clickE-setMPT_A-...pcapng@18: same key, Delay 300.
  assert.equal(
    hex(buildMtFrame({key: 26, hold: 29, tap: 8, delayMs: 300})),
    '5c0724da' + '011a1d0008001e'
  )
  assert.equal(XSYD_ADVANCED_DELAY_UNIT_MS, 10)
})

test('MPT frame matches the capture byte for byte', () => {
  // set_MT_at_W-holdZ-clickE-setMPT_A-0.5mmA,1mmM,1.5mmN.pcapng@22
  // App state for A: MPTInfo{DKS:[4,0,16], DB:[0.5,1,1.5]}. On the wire the key
  // repeats as its own first step, then a constant 0x11, then the three steps:
  // count 4, codes 04 00 10 00 11 00, depths 500 1000 1500 um.
  assert.equal(
    hex(buildMptFrame({key: 4, steps: [4, 16, 17], depthsUm: [500, 1000, 1500]})),
    '5c0e27cb' + '0104040010001100f401e803dc05'
  )
})

test('TGL frame matches the capture byte for byte', () => {
  // TGL_V_setZ_logpresstriggerdelay200ms.pcapng@18
  // App state for V: keyValue 25, advanceKeyType 4, TGLInfo{DKS:29, Delay:200}
  assert.equal(
    hex(buildTglFrame({key: 25, toggle: 29, delayMs: 200})),
    '5c0525cf' + '01191d0014'
  )
})

test('END frame matches the capture byte for byte', () => {
  // S_END_P.pcapng@18. The user confirmed S was selected and its END action
  // was P, so 0x16 (22) is S and 0x13 (19) is P.
  assert.equal(hex(buildEndFrame({key: 22, action: 19})), '5c0428bd' + '01161300')
})

test('MT rejects out-of-range input', () => {
  assert.throws(() => buildMtFrame({key: 0x100, hold: 29, tap: 8, delayMs: 200}), RangeError)
  assert.throws(() => buildMtFrame({key: 26, hold: 29, tap: 8, delayMs: -10}), RangeError)
  assert.throws(() => buildMtFrame({key: 26, hold: 29, tap: 8, delayMs: 5000}), RangeError)
})

test('MPT rejects mismatched steps and depths', () => {
  assert.throws(() => buildMptFrame({key: 4, steps: [0, 16], depthsUm: [500]}), RangeError)
  assert.throws(() => buildMptFrame({key: 4, steps: [], depthsUm: []}), RangeError)
  assert.throws(
    () => buildMptFrame({key: 4, steps: [0], depthsUm: [70000]}),
    RangeError
  )
})
