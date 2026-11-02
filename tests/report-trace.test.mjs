import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

async function bundle(path) {
  const build = await rolldown({ input: path })
  try {
    const { output } = await build.generate({ format: 'esm', codeSplitting: false })
    return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  } finally {
    await build.close()
  }
}

const { ReportTrace } = await bundle('src/protocol/hero68/reportTrace.ts')
const { buildReport } = await bundle('src/protocol/hero68/codec.ts')

const report = (command, zone = 0, data = []) => Uint8Array.from(buildReport({ command, zone, data }))

test('buildReport produces complete report-id-9 packets', () => {
  const packet = report(0x93, 0, [0, 1])
  assert.equal(packet.length, 64)
  assert.equal(packet[0], 0x09)
  assert.equal(packet[1], 0x93)
})

test('the trace records only while recording', () => {
  const trace = new ReportTrace()
  trace.add('out', 9, report(0x93, 0, [0, 1]))
  assert.equal(trace.count, 0)
  trace.start()
  trace.add('out', 9, report(0x93, 0, [0, 1]))
  assert.equal(trace.count, 1)
  trace.stop()
  trace.add('out', 9, report(0x93, 0, [0, 2]))
  assert.equal(trace.count, 1)
})

test('lighting frames and foreign report IDs stay out of the trace', () => {
  const trace = new ReportTrace()
  trace.start()
  trace.add('out', 9, report(0x08, 1, [0, 1, 2]))
  trace.add('in', 9, report(0x05, 0, [1, 2]))
  trace.add('in', 1, report(0x13, 0, [0, 1]))
  trace.add('in', 9, report(0x93, 0, [0, 1, 0, 80]))
  assert.equal(trace.count, 1)
})

test('export keeps direction and order, and start resets the log', () => {
  const trace = new ReportTrace()
  trace.start()
  trace.add('out', 9, report(0x82, 1))
  trace.add('in', 9, report(0x82, 1, [0x11, 0, 0, 0, 0, 3]))
  const doc = trace.export()
  assert.equal(doc.format, 'openhero68-trace')
  assert.deepEqual(doc.entries.map((entry) => entry.direction), ['out', 'in'])
  assert.equal(doc.entries[1].hex, Buffer.from(report(0x82, 1, [0x11, 0, 0, 0, 0, 3])).toString('hex'))
  assert.ok(doc.entries.every((entry) => Number.isFinite(entry.at) && entry.at >= 0))
  trace.start()
  assert.equal(trace.count, 0)
})

test('a long recording is bounded and reports what it dropped', () => {
  const trace = new ReportTrace()
  trace.start()
  for (let index = 0; index < 4200; index++) trace.add('out', 9, report(0x93, 0, [0, index & 0xff]))
  assert.equal(trace.count, 4000)
  assert.equal(trace.dropped, 200)
})
