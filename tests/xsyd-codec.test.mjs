import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'

const build = await rolldown({input: 'src/protocol/xsyd/codec.ts'})
const {output} = await build.generate({format: 'esm'})
await build.close()
const {buildXsydFrame, xsydReports, decodeXsydFrame, XsydFrameAssembler, xsydChecksum} =
  await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)

/** Hex of the meaningful part of a frame (header + declared payload). */
const hex = frame => [...frame.slice(0, 4 + frame[1])].map(b => b.toString(16).padStart(2, '0')).join('')

// Every expectation below is a frame captured on real hardware (9 USBPcap
// sessions, 4316 frames). The firmware routine at VA 0xCF48 adds only the last
// payload byte, so these values are the ground truth to hold the codec to.
test('checksum adds only the last payload byte', () => {
  // out 0x00 LEN=3: three different first bytes, same 0xFF tail -> same CK.
  for (const first of [0x0c, 0x0d, 0x01]) {
    assert.equal(hex(buildXsydFrame(0x00, [first, 0xff, 0xff])), `5c030093${first.toString(16).padStart(2, '0')}ffff`)
  }
  assert.equal(hex(buildXsydFrame(0x00, [0x70, 0x04, 0xff, 0xff])), '5c0400947004ffff')
  assert.equal(hex(buildXsydFrame(0x29, [...[0x01], ...Array(14).fill(0x00)])), '5c0f29c901' + '00'.repeat(14))
  assert.equal(hex(buildXsydFrame(0x2b, [0x00, 0x00, 0x01])), '5c032bc0000001')
})

test('Hall request CK ignores table_id because the addend is the last payload byte', () => {
  for (const tableId of [0x02, 0x03, 0x04, 0x05, 0x07, 0x08, 0x09]) {
    const room = tableId.toString(16).padStart(2, '0')
    assert.equal(hex(buildXsydFrame(0x12, [tableId, 0x01, 0xff, 0xff])), `5c0412a6${room}01ffff`)
  }
})

test('frames fill whole reports', () => {
  const hall = buildXsydFrame(0x12, [0x07, 0x01])
  assert.equal(hall.length, 64)
  assert.equal(hall[6], 0)
  assert.equal(xsydReports(hall).length, 1)

  const full = buildXsydFrame(0x17, new Array(56).fill(0xff))
  assert.equal(full.length, 64)
  // 0x5C + 56 + 0x17 + 0x35 + pack[59]=0xFF = 0xDF.
  assert.equal(full[3], 0xdf)
  assert.equal(full[3], xsydChecksum(full))
})

test('rejects impossible payloads', () => {
  assert.throws(() => buildXsydFrame(0x17, new Uint8Array(253)), RangeError)
  assert.throws(() => buildXsydFrame(0x100), RangeError)
  assert.throws(() => buildXsydFrame(0x12, [0x07, 300]), RangeError)
})

test('special families: travel slot, rejected reply, out-of-report addend', () => {
  // out 0x30: byte 1 is a parameter, the offset is a fixed 0x43-byte slot.
  const sweep = buildXsydFrame(0x30, [0x00, 0x05, 0xca, 0x02])
  sweep[1] = 0x04
  assert.equal(xsydChecksum(sweep), 0x04)

  // in 0x01 < 0x80: no reply packing, so no checksum.
  const rejected = new Uint8Array(64)
  rejected[0] = 0x5c
  rejected[1] = 0x0b
  rejected[2] = 0x01
  rejected.fill(0xff, 4)
  assert.equal(xsydChecksum(rejected, 'in'), 0x00)

  // in 0x92: the addend sits past the 64-byte report.
  for (const [length, expected] of [
    [0x80, 0xa3],
    [0x82, 0xa4]
  ]) {
    const reply = new Uint8Array(192)
    reply[0] = 0x5c
    reply[1] = length
    reply[2] = 0x92
    assert.equal(xsydChecksum(reply, 'in'), expected)
  }
})

test('reassembles a 132-byte Hall reply from three reports', () => {
  // Reply layout: 5C 80 92 <chk> <status> <table_id> <126 data bytes>
  const frame = new Uint8Array(192)
  frame[0] = 0x5c
  frame[1] = 0x80
  frame[2] = 0x92
  frame[4] = 0x00
  frame[5] = 0x07
  for (let i = 0; i < 126; i++) frame[6 + i] = i & 0xff
  frame[3] = xsydChecksum(frame, 'in')
  const assembler = new XsydFrameAssembler()
  const reports = xsydReports(frame)
  assert.equal(reports.length, 3)
  assert.equal(assembler.push(reports[0]), null)
  assert.equal(assembler.push(reports[1]), null)
  const reply = assembler.push(reports[2])
  assert.ok(reply)
  assert.equal(reply.opcode, 0x92)
  assert.equal(reply.requestOpcode, 0x12)
  assert.equal(reply.checksumValid, true)
  assert.equal(reply.payload.length, 0x80)
  assert.equal(reply.payload[0], 0x00)
  assert.equal(reply.payload[1], 0x07)
  assert.equal(reply.payload[2], 0)
  assert.equal(reply.payload[127], 125)
})

test('drops a stray report and resynchronises on the next magic byte', () => {
  const assembler = new XsydFrameAssembler()
  const stray = new Uint8Array(64)
  stray[0] = 0x00
  assert.equal(assembler.push(stray), null)
  const frame = buildXsydFrame(0x0a, [0xff, 0xff])
  frame[2] = 0x8a
  frame[3] = xsydChecksum(frame, 'in')
  const reply = assembler.push(frame)
  assert.ok(reply)
  assert.equal(reply.requestOpcode, 0x0a)
  assert.equal(reply.checksumValid, true)
  assert.equal(reply.status, 0xff)
})

test('flags a corrupted checksum instead of throwing', () => {
  const frame = buildXsydFrame(0x12, [0x07, 0x01])
  frame[3] ^= 0xff
  assert.equal(decodeXsydFrame(frame).checksumValid, false)
  assert.throws(() => decodeXsydFrame(Uint8Array.of(0x5d, 0, 0, 0)), /magic/)
})
