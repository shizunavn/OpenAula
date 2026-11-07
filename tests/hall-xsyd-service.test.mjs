import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'

// service/native/hid_bridge.cpp polls a HERO68 Hall key in one round trip but
// an XSYD key in two (travel + pressed), each split over three 64-byte HID
// reports. The 200 Hz demand only holds if a missed read costs one cycle, so
// the budgets and the recovery rules below are pinned here.
const hall = await readFile('service/native/hall_core.h', 'utf8')
const bridge = await readFile('service/native/hid_bridge.cpp', 'utf8')

test('XSYD Hall round trips stay inside the 5 ms budget of 200 Hz', () => {
  const value = name => {
    const match = hall.match(new RegExp(`constexpr \\w+ ${name} = (\\d+);`))
    assert.ok(match, `${name} missing`)
    return Number(match[1])
  }
  // Two round trips per cycle, so each pair must fit one 5 ms period.
  assert.ok(value('XsydWriteTimeoutMs') + value('XsydReplyBudgetMs') <= 25,
    'one round trip must not exceed a quarter of the 200 Hz period')
})

test('a failed XSYD Hall read keeps the handle instead of reopening it', () => {
  const start = bridge.indexOf('if (device->xsyd) {', bridge.indexOf('void pollHallStep'))
  assert.ok(start > 0)
  const end = bridge.indexOf('std::vector<uint8_t> positions;', start)
  assert.ok(end > start)
  const xsyd = bridge.slice(start, end)
  assert.doesNotMatch(xsyd, /device\.reset\(\)/,
    'reset() drops a working handle and pays a 250-2000 ms scheduler backoff')
})

test('travel and pressed replies are accepted independently', () => {
  assert.match(hall, /constexpr uint8_t XsydReadOk = 0;/)
  assert.match(bridge, /travelResult == hall::XsydReadOk/)
  assert.match(bridge, /pressedResult == hall::XsydReadOk/)
  // A missed pressed reply reuses the last good one for that matrix half.
  assert.match(bridge, /std::copy\(pressedFrame\.begin\(\), pressedFrame\.end\(\), xsydPressedFrame\.begin\(\)\)/)
})
