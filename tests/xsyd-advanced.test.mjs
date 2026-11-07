import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'

const [
  {
    buildDksFrame,
    buildEndFrame,
    buildMtFrame,
    buildMptFrame,
    buildSocdFrame,
    buildSocdReadFrame,
    buildTglFrame,
    decodeDksReply,
    decodeSocdReply,
    decodeXsydDksStateMask,
    encodeXsydDksStateRow,
    XsydDksMask,
    XsydSocdMode,
    XSYD_ADVANCED_DELAY_UNIT_MS,
    XSYD_PROTOCOL_VERSION,
  },
  {decodeXsydFrame, buildXsydFrame, xsydChecksum},
] = await Promise.all([
  (async () => {
    const build = await rolldown({input: 'src/protocol/xsyd/advanced.ts'})
    const {output} = await build.generate({format: 'esm'})
    await build.close()
    return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  })(),
  (async () => {
    const build = await rolldown({input: 'src/protocol/xsyd/codec.ts'})
    const {output} = await build.generate({format: 'esm'})
    await build.close()
    return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  })(),
])

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

test('DKS frame matches dks_keyW_down1.4-3.4_up3.4-1.4_A-hold1_B-hold2_C-hold3_D-end.pcapng byte for byte', () => {
  // #40752 OUT op=0x26 len=0x10(16) ck=0xcc | 01 1a 04 00 05 00 06 00 07 00 03 1c 60 c0 78 05
  const dksByStates = buildDksFrame({
    key: 0x1a,
    actions: [0x04, 0x05, 0x06, 0x07],
    states: [
      [14, 0, 0, 0], // A: Hold: start -> deep press (0x03)
      [0, 14, 0, 0], // B: Hold: deep press -> release from deep (0x1c)
      [0, 0, 14, 0], // C: Hold: release from deep -> end (0x60)
      [0, 0, 0, 10], // D: Tap at end of release (0xc0)
    ],
    actuationUm: 1400,
  })
  assert.equal(hex(dksByStates), '5c1026cc' + '011a0400050006000700031c60c07805')

  const dksByMasks = buildDksFrame({
    key: 0x1a,
    actions: [0x04, 0x05, 0x06, 0x07],
    masks: [0x03, 0x1c, 0x60, 0xc0],
    actuationUm: 1400,
  })
  assert.equal(hex(dksByMasks), '5c1026cc' + '011a0400050006000700031c60c07805')

  // Verify all DKS hold and tap state patterns round-trip through encodeXsydDksStateRow / decodeXsydDksStateMask
  const patternPairs = [
    [[0, 0, 0, 0], XsydDksMask.None],
    [[10, 0, 0, 0], XsydDksMask.TapStart],
    [[0, 10, 0, 0], XsydDksMask.TapDeepPress],
    [[0, 0, 10, 0], XsydDksMask.TapReleaseFromDeep],
    [[0, 0, 0, 10], XsydDksMask.TapEndOfRelease],
    [[14, 0, 0, 0], XsydDksMask.HoldStartToDeepPress],
    [[0, 14, 0, 0], XsydDksMask.HoldDeepPressToRelease],
    [[0, 0, 14, 0], XsydDksMask.HoldReleaseToEnd],
    [[6, 12, 0, 0], XsydDksMask.HoldStartToReleaseFromDeep],
    [[0, 6, 12, 0], XsydDksMask.HoldDeepPressToEnd],
    [[6, 4, 12, 0], XsydDksMask.HoldStartToEnd],
  ]
  for (const [row, expectedMask] of patternPairs) {
    assert.equal(encodeXsydDksStateRow(row), expectedMask)
    assert.deepEqual(decodeXsydDksStateMask(expectedMask), row)
  }

  // Decode #40754 IN op=0xa6 len=0x2e(46) ck=0x64
  const replyPayload = new Uint8Array(0x2e).fill(0xff)
  replyPayload.set([0x00, 0x1a, 0x04, 0x00, 0x05, 0x00, 0x06, 0x00, 0x07, 0x00, 0x03, 0x1c, 0x60, 0xc0, 0x78, 0x05], 0)
  const replyFrame = buildXsydFrame(0x26, replyPayload)
  replyFrame[2] = 0xa6
  replyFrame[3] = xsydChecksum(replyFrame, 'in')
  assert.equal(replyFrame[3], 0x64)
  const decodedDks = decodeDksReply(decodeXsydFrame(replyFrame))
  assert.equal(decodedDks.key, 0x1a)
  assert.deepEqual(decodedDks.actions, [0x04, 0x05, 0x06, 0x07])
  assert.deepEqual(decodedDks.masks, [0x03, 0x1c, 0x60, 0xc0])
  assert.deepEqual(decodedDks.states, [
    [14, 0, 0, 0],
    [0, 14, 0, 0],
    [0, 0, 14, 0],
    [0, 0, 0, 10],
  ])
  assert.equal(decodedDks.actuationUm, 1400)
})

test('SOCD all 4 modes match socd_AD_on and socd_ad_...changes3modein1capture.pcapng byte for byte', () => {
  // Mode 0 (Last input priority): socd_AD_on.pcapng
  assert.equal(
    hex(buildSocdFrame({key1: 0x04, key2: 0x07, mode: XsydSocdMode.LastInputPriority})),
    '5c0b2cc8' + '0104070000000000000000'
  )
  // Mode 1 (Key 1 / red box A takes precedence): #29461
  assert.equal(
    hex(buildSocdFrame({key1: 0x04, key2: 0x07, mode: XsydSocdMode.FirstKeyPriority})),
    '5c0b2cc8' + '0104070000000000010000'
  )
  // Mode 2 (Key 2 / blue box D takes precedence): #59268
  assert.equal(
    hex(buildSocdFrame({key1: 0x04, key2: 0x07, mode: XsydSocdMode.SecondKeyPriority})),
    '5c0b2cc8' + '0104070000000000020000'
  )
  // Mode 3 (Neutral): #86416
  assert.equal(
    hex(buildSocdFrame({key1: 0x04, key2: 0x07, mode: XsydSocdMode.Neutral})),
    '5c0b2cc8' + '0104070000000000030000'
  )
  // Read query #12086 / #47190 / #73090
  assert.equal(hex(buildSocdReadFrame(0x04)), '5c0b2cc8' + '0004000000000000000a00')

  // Decode #86418 IN op=0xac len=0x0b(11) ck=0x48
  const socdReplyFrame = buildXsydFrame(0x2c, [0x00, 0x04, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00])
  socdReplyFrame[2] = 0xac
  socdReplyFrame[3] = xsydChecksum(socdReplyFrame, 'in')
  assert.equal(socdReplyFrame[3], 0x48)
  const decodedSocd = decodeSocdReply(decodeXsydFrame(socdReplyFrame))
  assert.deepEqual(decodedSocd, {
    key1: 0x04,
    key2: 0x07,
    action1: 0,
    action2: 0,
    type: 0,
    mode: 3,
    delay: 0,
  })
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
