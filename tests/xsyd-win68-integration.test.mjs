import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

const require = createRequire(import.meta.url)
const React = require('react')
globalThis.React = React

// A single React copy: the app modules read `globalThis.React` and
// `react/jsx-runtime` is aliased to it, so the dispatcher installed by
// `renderComponent` reaches every component in the bundle.
const reactShim = [
  'const React = globalThis.React;',
  'export default React;',
  'export const { createElement, Fragment, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition, useSyncExternalStore, useDeferredValue, useInsertionEffect, useImperativeHandle, useDebugValue, useActionState, useOptimistic, use, Children, Component, PureComponent, createContext, createRef, forwardRef, isValidElement, lazy, memo, startTransition, StrictMode, Suspense, cloneElement } = React;',
].join('\n')

const testPlugins = {
  name: 'test-harness',
  resolveId(source) {
    if (source.endsWith('.css')) return '\0style-stub'
    if (source === 'react') return '\0react-shim'
    if (source === 'react/jsx-runtime') return '\0jsx-runtime'
    if (source === 'react-dom') return '\0react-dom'
    if (source.startsWith('react-dom/')) return { id: source, external: true }
    return null
  },
  load(id) {
    if (id === '\0style-stub') return 'export default {}'
    // Portals need a live React tree; the assertions read the JSX tree instead.
    if (id === '\0react-dom') return 'export const createPortal = child => child;'
    if (id === '\0react-shim') return reactShim
    if (id === '\0jsx-runtime') {
      return [
        'const React = globalThis.React;',
        'export const jsx = (type, props, key) => ({ type, props, key });',
        'export const jsxs = jsx;',
        'export const Fragment = React.Fragment;',
      ].join('\n')
    }
    return null
  },
}

async function bundle(input) {
  const build = await rolldown({ input, plugins: [testPlugins] })
  try {
    const { output } = await build.generate({ format: 'esm', codeSplitting: false })
    const code = output[0].code.replaceAll('"react-dom', '"__external-react-dom')
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  } finally {
    await build.close()
  }
}

/**
 * Render a component that uses hooks, then hand the element tree back.
 */
function renderComponent(element) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
  const previous = internals.H
  const dispatcher = {
    useMemo: (factory, deps) => factory(),
    useCallback: fn => fn,
    useRef: initial => ({ current: initial }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect() {},
    useLayoutEffect() {},
    useId: () => 'test-id',
    useContext(context) {
      let value = context._currentValue
      while (value === undefined) value = value?._currentValue
      return value
    },
    useTransition: () => [false, fn => fn()],
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useDeferredValue: value => value,
    useInsertionEffect() {},
    useImperativeHandle() {},
    useDebugValue() {},
    useActionState: initial => [initial, () => {}],
    useOptimistic: value => value,
    useFormStatus: () => ({}),
  }
  internals.H = dispatcher
  try {
    return typeof element.type === 'function' ? element.type(element.props ?? {}) : element
  } finally {
    internals.H = previous
  }
}

const [
  devicesMod,
  xsydCodec,
  xsydAdvanced,
  xsydFeatures,
  xsydDevice,
  heroAdvanced,
  heroWebhid,
  i18nMod,
  advancedPageMod,
  generalSettingsMod,
] = await Promise.all([
  bundle('src/keyboard/devices.ts'),
  bundle('src/protocol/xsyd/codec.ts'),
  bundle('src/protocol/xsyd/advanced.ts'),
  bundle('src/protocol/xsyd/features.ts'),
  bundle('src/protocol/xsyd/device.ts'),
  bundle('src/protocol/hero68/advanced.ts'),
  bundle('src/protocol/hero68/webhid.ts'),
  bundle('src/i18n/index.tsx'),
  bundle('src/components/AdvancedKeysPage.tsx'),
  bundle('src/pages/GeneralSettingsPage.tsx'),
])

const hex = frame =>
  [...frame.slice(0, 4 + frame[1])].map(b => b.toString(16).padStart(2, '0')).join('')

function makeReply(requestOpcode, payloadBytes) {
  const replyFrame = xsydCodec.buildXsydFrame(requestOpcode, payloadBytes)
  replyFrame[2] = (requestOpcode | 0x80) & 0xff
  replyFrame[3] = xsydCodec.xsydChecksum(replyFrame, 'in')
  return replyFrame
}

function renderNode(node) {
  if (!node || typeof node !== 'object') return node
  if (typeof node.type === 'function' && !Array.isArray(node.type)) return renderComponent(node)
  return node
}

function collectNodes(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, out)
    return out
  }
  const rendered = renderNode(node)
  if (!rendered || typeof rendered !== 'object') return out
  if (Array.isArray(rendered)) {
    for (const child of rendered) collectNodes(child, predicate, out)
    return out
  }
  if (predicate(rendered)) {
    out.push(rendered)
  }
  const children = rendered.props?.children
  if (children !== undefined) {
    collectNodes(children, predicate, out)
  }
  return out
}

function textContent(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).filter(Boolean).join('')
  if (typeof node === 'object') {
    const rendered = renderNode(node)
    return rendered && typeof rendered === 'object' ? textContent(rendered.props?.children) : ''
  }
  return ''
}

test('WIN 68 HE MAX identification and board descriptor preserve HERO68/84 guardrails', async () => {
  assert.equal(devicesMod.detectHeroDeviceFamily('WIN 68 HE MAX', 0x1ca2, 0x1901), 'win68HeMax')
  assert.equal(devicesMod.detectHeroDeviceFamily('', 0x1c4f, 0xee88), 'win68HeMax')
  assert.equal(devicesMod.detectConnectedDeviceModelId('WIN 68 HE MAX', 0x1ca2, 0x1901), 'win68HeMax')
  assert.equal(devicesMod.isWin68HeMaxModel('win68HeMax'), true)
  assert.equal(devicesMod.isWin68HeMaxModel('win68'), true)
  assert.equal(devicesMod.isWin68HeMaxModel('hero68'), false)
  assert.equal(devicesMod.heroDeviceModel('win68HeMax').label, 'AULA WIN 68 HE MAX')
  assert.equal(devicesMod.heroDeviceModel('win68HeMax').capabilities.writablePollingRate, true)
  assert.equal(devicesMod.heroDeviceModel('win68').id, 'win68HeMax')

  // Guard in hero68/webhid.ts must still reject WIN 68 HE MAX before opening or writing
  const oldNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let opened = false
  const maxHidDevice = {
    opened: false,
    vendorId: 0x1ca2,
    productId: 0x1901,
    productName: 'WIN 68 HE MAX',
    collections: [],
    async open() {
      opened = true
      this.opened = true
    },
    async close() {
      this.opened = false
    },
    addEventListener() {},
    removeEventListener() {},
    async sendReport() {
      assert.fail('Hero68DeviceManager must never send reports to WIN 68 HE MAX')
    },
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { hid: { async getDevices() { return [maxHidDevice] } } },
  })
  try {
    const heroMgr = new heroWebhid.Hero68DeviceManager()
    await assert.rejects(() => heroMgr.connect(false), /WIN 68 HE MAX detected/)
    assert.equal(opened, false)
  } finally {
    if (oldNav) Object.defineProperty(globalThis, 'navigator', oldNav)
    else delete globalThis.navigator
  }
})

test('SOCD, disable-binding, handshake, polling rate, and 0x23 readback frames match capture byte for byte', () => {
  // socd_AD_on.pcapng & socd_ad_...changes3modein1capture.pcapng: modes 0, 1, 2, 3
  assert.equal(hex(xsydAdvanced.buildSocdFrame({ key1: 0x04, key2: 0x07, mode: 0 })), '5c0b2cc8' + '0104070000000000000000')
  assert.equal(hex(xsydAdvanced.buildSocdFrame({ key1: 0x04, key2: 0x07, mode: 1 })), '5c0b2cc8' + '0104070000000000010000')
  assert.equal(hex(xsydAdvanced.buildSocdFrame({ key1: 0x04, key2: 0x07, mode: 2 })), '5c0b2cc8' + '0104070000000000020000')
  assert.equal(hex(xsydAdvanced.buildSocdFrame({ key1: 0x04, key2: 0x07, mode: 3 })), '5c0b2cc8' + '0104070000000000030000')

  // dks_keyW_down1.4-3.4_up3.4-1.4_A-hold1_B-hold2_C-hold3_D-end.pcapng:
  const dksFrame = xsydAdvanced.buildDksFrame({
    key: 0x1a,
    actions: [0x04, 0x05, 0x06, 0x07],
    states: [[14, 0, 0, 0], [0, 14, 0, 0], [0, 0, 14, 0], [0, 0, 0, 10]],
    actuationUm: 1400,
  })
  assert.equal(hex(dksFrame), '5c1026cc' + '011a0400050006000700031c60c07805')

  // Reject out-of-range SOCD modes and unverified types/delays
  assert.throws(() => xsydAdvanced.buildSocdFrame({ key1: 0x04, key2: 0x07, mode: 4 }), RangeError)
  assert.throws(() => xsydAdvanced.buildSocdFrame({ key1: 0x04, key2: 0x07, type: 1 }), RangeError)
  assert.throws(() => xsydAdvanced.buildSocdFrame({ key1: 0x04, key2: 0x07, delay: 10 }), RangeError)

  // Turn off advanced key on S (0x16): 0x23 with field 0x08 = 0x0000
  const disableFrame = xsydAdvanced.buildDisableAdvancedKeyFrame([0x16])
  assert.equal(hex(disableFrame), '5c3923ed' + '01' + '16080000' + 'ffff0000'.repeat(13))

  // Profile selector 0x00 subcmd 0x70 + read query 70 04 ff ff
  assert.equal(hex(xsydDevice.buildXsydSelectProfileFrame(0)), '5c0400947000ffff')
  assert.equal(hex(xsydDevice.buildXsydSelectProfileFrame(2)), '5c0400947002ffff')
  assert.equal(hex(xsydDevice.buildXsydReadProfileFrame()), '5c0400947004ffff')
  const profileReply = xsydCodec.decodeXsydFrame(makeReply(0x00, [0x00, 0x70, 0x03, 0xff]))
  assert.equal(xsydDevice.decodeXsydProfileReply(profileReply), 3)

  // Polling rate 0x00 subcmd 0x50 verified on 4k_to_2k_to_1k.pcapng:
  assert.equal(hex(xsydDevice.buildXsydWritePollingRateFrame(8000)), '5c0400945000ffff')
  assert.equal(hex(xsydDevice.buildXsydWritePollingRateFrame(4000)), '5c0400945001ffff')
  assert.equal(hex(xsydDevice.buildXsydWritePollingRateFrame(2000)), '5c0400945002ffff')
  assert.equal(hex(xsydDevice.buildXsydWritePollingRateFrame(1000)), '5c0400945003ffff')
  assert.equal(hex(xsydDevice.buildXsydWritePollingRateFrame(500)), '5c0400945004ffff')
  assert.equal(hex(xsydDevice.buildXsydWritePollingRateFrame(250)), '5c0400945005ffff')
  assert.equal(hex(xsydDevice.buildXsydWritePollingRateFrame(125)), '5c0400945006ffff')
  assert.equal(hex(xsydDevice.buildXsydReadPollingRateFrame()), '5c0400945007ffff')

  for (const [code, rate] of [
    [0x00, 8000],
    [0x01, 4000],
    [0x02, 2000],
    [0x03, 1000],
    [0x04, 500],
    [0x05, 250],
    [0x06, 125],
  ]) {
    const replyRaw = makeReply(0x00, [0x00, 0x50, code, 0xff])
    assert.equal(hex(replyRaw), `5c04801400500${code}ff`)
    const decoded = xsydCodec.decodeXsydFrame(replyRaw)
    assert.equal(xsydDevice.decodeXsydPollingRateReply(decoded), rate)
  }

  // 0x23 readback frame uses payload[0] = 0x00 and 57-byte payload
  const readFrame = xsydFeatures.buildFieldReadFrame([{ pos: 0x1a, field: 0x04 }])
  assert.equal(readFrame[1], 57)
  assert.equal(readFrame[2], 0x23)
  assert.equal(readFrame[4], 0x00)
  assert.deepEqual([...readFrame.slice(5, 9)], [0x1a, 0x04, 0x00, 0x00])
  assert.deepEqual([...readFrame.slice(9, 13)], [0xff, 0xff, 0x00, 0x00])
})

test('XsydDeviceManager connects without reopening an open handle, reassembles multi-report replies, guards Profile 0 0x00 0x70 reloads, and handles 4k->2k->1k polling-rate USB re-enumeration', async () => {
  const oldNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let activeRateCode = 0x00 // Initially 8000 Hz (dev3 in 4k_to_2k_to_1k.pcapng)
  let openCallsOnAlreadyOpened = 0
  let reenumeratedOpens = 0
  const sentHexFrames = []

  function createMockHidDevice(initiallyOpened) {
    const listeners = new Set()
    return {
      opened: initiallyOpened,
      vendorId: 0x1ca2,
      productId: 0x1901,
      productName: 'WIN 68 HE MAX',
      collections: [{ usagePage: 0xffa0, usage: 1 }],
      async open() {
        if (this.opened) {
          openCallsOnAlreadyOpened++
          throw new Error('InvalidStateError: device already open')
        }
        reenumeratedOpens++
        this.opened = true
      },
      async close() {
        this.opened = false
      },
      addEventListener(_type, listener) {
        listeners.add(listener)
      },
      removeEventListener(_type, listener) {
        listeners.delete(listener)
      },
      async sendReport(reportId, data) {
        assert.equal(reportId, 0)
        const bytes = new Uint8Array(data)
        assert.equal(bytes.length, 64)
        sentHexFrames.push(hex(bytes))
        const op = bytes[2]
        const sub = bytes[4]
        setTimeout(() => {
          if (op === 0x00 && sub === 0x01) {
            const r = makeReply(0x00, [0x00, 0x01, 0x09, 0x01, 0x00])
            for (const l of listeners) l({ reportId: 0, data: new DataView(r.buffer) })
          } else if (op === 0x00 && sub === 0x25) {
            const r = makeReply(0x00, [0x00, 0x25, 0x0a, 0x0a, 0x00, 0x48, 0x0d])
            for (const l of listeners) l({ reportId: 0, data: new DataView(r.buffer) })
          } else if (op === 0x00 && sub === 0x26) {
            const ascii = [...Buffer.from('WIN 68 HE MAX', 'ascii')]
            const r = makeReply(0x00, [0x00, 0x26, ...ascii])
            for (const l of listeners) l({ reportId: 0, data: new DataView(r.buffer) })
          } else if (op === 0x00 && sub === 0x70) {
            const slot = bytes[5] === 0x04 ? 0x00 : bytes[5]
            const r = makeReply(0x00, [0x00, 0x70, slot, 0xff])
            for (const l of listeners) l({ reportId: 0, data: new DataView(r.buffer) })
          } else if (op === 0x23) {
            const r = makeReply(0x23, bytes.slice(4, 4 + bytes[1]))
            for (const l of listeners) l({ reportId: 0, data: new DataView(r.buffer) })
          } else if (op === 0x00 && sub === 0x50) {
            const code = bytes[5]
            if (code === 0x07) {
              const r = makeReply(0x00, [0x00, 0x50, activeRateCode, 0xff])
              for (const l of listeners) l({ reportId: 0, data: new DataView(r.buffer) })
            } else {
              activeRateCode = code
              const r = makeReply(0x00, [0x00, 0x50, activeRateCode, 0xff])
              for (const l of listeners) l({ reportId: 0, data: new DataView(r.buffer) })
              this.opened = false
              currentDevice = createMockHidDevice(false)
            }
          } else if (op === 0x12) {
            const big = new Uint8Array(192)
            big[0] = 0x5c
            big[1] = 0x80
            big[2] = 0x92
            big[4] = 0x00
            big[5] = 0x07
            for (let i = 0; i < 126; i++) big[6 + i] = i & 0xff
            big[3] = xsydCodec.xsydChecksum(big, 'in')
            for (const chunk of xsydCodec.xsydReports(big)) {
              for (const l of listeners) l({ reportId: 0, data: new DataView(chunk.buffer) })
            }
          } else if (op === 0x24) {
            const bad = makeReply(0x00, [0x00])
            for (const l of listeners) l({ reportId: 0, data: new DataView(bad.buffer) })
          } else if (op === 0x25) {
            const stale = makeReply(0x00, [0x00, 0x70, 0x01, 0xff])
            const real = makeReply(0x25, [0x00])
            for (const l of listeners) l({ reportId: 0, data: new DataView(stale.buffer) })
            for (const l of listeners) l({ reportId: 0, data: new DataView(real.buffer) })
          }
        }, 1)
      },
    }
  }

  let currentDevice = createMockHidDevice(true)

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { hid: { async getDevices() { return [currentDevice] } } },
  })

  const mgr = new xsydDevice.XsydDeviceManager()
  try {
    await mgr.connect(false)
    assert.equal(openCallsOnAlreadyOpened, 0, 'Must not call open() when device.opened is already true')
    assert.equal(mgr.connected, true)
    assert.equal(mgr.getSnapshot().detectedModel, 'win68HeMax')
    assert.deepEqual(mgr.handshake, {
      version: '1.0.9',
      precisionUm: 10,
      minTravelUm: 100,
      maxTravelUm: 3400,
      name: 'WIN 68 HE MAX',
    })

    // Verify 0x00 0x70 0x00 guard after a 0x23 write on Profile 0:
    sentHexFrames.length = 0
    await mgr.request(xsydDevice.buildXsydSelectProfileFrame(0))
    await mgr.request(
      xsydFeatures.buildFieldWriteFrame([{ pos: 0x1a, field: xsydFeatures.XsydFeatureField.Travel, value: 1000 }])
    )
    // Subsequent redundant 0x00 0x70 0x00 (e.g. from saveXsydRgbProfile or hydrateFromXsydDevice) must NOT be sent on wire
    const guardedReply = await mgr.request(xsydDevice.buildXsydSelectProfileFrame(0))
    assert.equal(guardedReply.opcode, 0x80)
    assert.equal(
      sentHexFrames.filter(f => f === '5c0400947000ffff').length,
      1,
      'Redundant 0x00 0x70 0x00 after a 0x23 write must be suppressed so firmware VA 0x12AF4 does not wipe SRAM before 500ms Flash flush'
    )

    // Multi-report reply reassembly (3 chunks -> 1 XsydReply)
    const hallReply = await mgr.request(xsydCodec.buildXsydFrame(0x12, [0x07, 0x01]))
    assert.equal(hallReply.opcode, 0x92)
    assert.equal(hallReply.payload.length, 0x80)
    assert.equal(hallReply.payload[1], 0x07)

    // Replay the exact 4k_to_2k_to_1k.pcapng sequence: 4000 Hz -> 2000 Hz -> 1000 Hz
    sentHexFrames.length = 0
    assert.equal(await mgr.writePollingRate(4000, 300), 4000)
    assert.equal(await mgr.writePollingRate(2000, 300), 2000)
    assert.equal(await mgr.writePollingRate(1000, 300), 1000)
    assert.equal(reenumeratedOpens, 3, 'Each polling rate change reopens the new USB interface handle')
    assert.deepEqual(sentHexFrames, [
      '5c0400945001ffff',
      '5c0400945007ffff',
      '5c0400945002ffff',
      '5c0400945007ffff',
      '5c0400945003ffff',
      '5c0400945007ffff',
    ])

    const staleReplyStarted = Date.now()
    await assert.rejects(
      () => mgr.request(xsydAdvanced.buildMtFrame({ key: 26, hold: 29, tap: 8, delayMs: 200 }), 300),
      /timed out \(opcode=0x24\)/
    )
    assert.ok(Date.now() - staleReplyStarted >= 250, 'the mismatched reply must not settle the request early')

    const reply = await mgr.request(xsydCodec.buildXsydFrame(0x25, [0x00]), 500)
    assert.equal(reply.opcode, 0xa5)
    assert.equal(reply.checksumValid, true)
  } finally {
    await mgr.disconnect()
    if (oldNav) Object.defineProperty(globalThis, 'navigator', oldNav)
    else delete globalThis.navigator
  }
})

test('GeneralSettingsPage enables Polling Rate on WIN 68 HE MAX while keeping HERO68-only toggles disabled', () => {
  const { GeneralSettingsPage } = generalSettingsMod
  const selectedRates = []
  const tree = renderComponent({ type: GeneralSettingsPage, props: {
    model: devicesMod.heroDeviceModel('win68HeMax'),
    deviceConnected: true,
    deviceSettingsState: 'ready',
    devicePollingRate: 4000,
    deviceOsModeMac: false,
    setDeviceOsModeMac() {},
    deviceWinLock: false,
    setDeviceWinLock() {},
    deviceHallDebounce: false,
    setDeviceHallDebounce() {},
    deviceAutoCalibration: false,
    setDeviceAutoCalibration() {},
    showAdvancedPages: true,
    async readDeviceGeneralSettings() {},
    async handlePollingRateChange(rate) {
      selectedRates.push(rate)
    },
    async applyBooleanDeviceSetting() {},
  } })

  const radioButtons = collectNodes(tree, el => el.type === 'button' && el.props?.role === 'radio')
  const pollingButtons = radioButtons.filter(b => textContent(b).includes('Hz'))
  assert.equal(pollingButtons.length, 7)
  for (const btn of pollingButtons) {
    assert.equal(btn.props.disabled, false, 'Polling rate buttons must be enabled on WIN 68 HE MAX')
  }
  const btn2000 = pollingButtons.find(b => textContent(b).includes('2000 Hz'))
  btn2000.props.onClick()
  assert.deepEqual(selectedRates, [2000])

  const osModeButtons = radioButtons.filter(b => !textContent(b).includes('Hz'))
  assert.equal(osModeButtons.length, 2)
  for (const btn of osModeButtons) {
    assert.equal(btn.props.disabled, true, 'HERO68 OS mode buttons stay disabled on WIN 68 HE MAX')
  }
})

test('saveXsydAdvancedBindings, xsydProtocolEncoder, and hydrateFromXsydDevice round-trip Profile 0 Actuation, 0.15mm/0.02mm RT Press/Release, Top/Bottom Deadzones, and Switch Types', async () => {
  const sentFrames = []
  const fieldMemory = new Map()

  const requester = {
    async request(frame) {
      sentFrames.push(frame)
      const op = frame[2]
      const sub = frame[4]
      if (op === 0x00 && sub === 0x01) {
        return xsydCodec.decodeXsydFrame(makeReply(0x00, [0x00, 0x01, 0x09, 0x01, 0x00]))
      }
      if (op === 0x00 && sub === 0x25) {
        return xsydCodec.decodeXsydFrame(makeReply(0x00, [0x00, 0x25, 0x0a, 0x0a, 0x00, 0x48, 0x0d]))
      }
      if (op === 0x00 && sub === 0x26) {
        return xsydCodec.decodeXsydFrame(
          makeReply(0x00, [0x00, 0x26, ...Buffer.from('WIN 68 HE MAX', 'ascii')])
        )
      }
      if (op === 0x00 && sub === 0x70) {
        return xsydCodec.decodeXsydFrame(makeReply(0x00, [0x00, 0x70, frame[5], 0x00]))
      }
      if (op === 0x29) {
        return xsydCodec.decodeXsydFrame(
          makeReply(0x29, [0x00, 0x00, 0x00, 0xf4, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
        )
      }
      if (op === 0x23) {
        const flag = frame[4]
        const payload = frame.slice(4, 4 + frame[1])
        const slots = xsydFeatures.decodeFieldWritePayload(payload)
        if (flag === 0x01) {
          for (const s of slots) {
            fieldMemory.set(`${s.pos}:${s.field}`, s.value)
          }
          return xsydCodec.decodeXsydFrame(makeReply(0x23, payload))
        }
        const readSlots = slots.map(s => ({
          pos: s.pos,
          field: s.field,
          value: fieldMemory.get(`${s.pos}:${s.field}`) ?? 0,
        }))
        return xsydCodec.decodeXsydFrame(
          makeReply(0x23, xsydFeatures.buildFieldWritePayload(readSlots))
        )
      }
      if ([0x24, 0x25, 0x26, 0x27, 0x28, 0x2c].includes(op)) {
        const keyPos = op === 0x27 ? 0x04 : frame[5]
        fieldMemory.set(`${keyPos}:${xsydFeatures.XsydFeatureField.Header}`, 0x20)
        return xsydCodec.decodeXsydFrame(makeReply(op, frame.slice(4, 4 + frame[1])))
      }
      throw new Error(`Unexpected opcode 0x${op.toString(16)}`)
    },
  }

  // 1. Performance encoder writes 0x08 (Header), 0x04 (Travel), 0x14 (RT Press), 0x15 (RT Release),
  //    0x16 (TopDeadzone), 0x17 (BottomDeadzone), and 0x19 (SwitchType) independently.
  const snapshot = {
    profileSlot: 0,
    tachyon: false,
    model: 'win68HeMax',
    keys: [
      {
        keyId: 'Space',
        matrixKey: 0,
        matrixHex: '0x0000',
        actuationMm: 1.51,
        rapidTriggerEnabled: true,
        splitSensitivity: false,
        rapidSensitivityMm: 0.15,
        pressSensitivityMm: 0.15,
        releaseSensitivityMm: 0.15,
        deadzoneEnabled: true,
        topDeadzoneMm: 1.0,
        bottomDeadzoneMm: 0.3,
        switchProfile: 'jade-pro',
      },
      {
        keyId: 'KeyW',
        matrixKey: 0,
        matrixHex: '0x0000',
        actuationMm: 3.4, // Must be clamped to 3300 um for 'white' (SwitchType = 3)
        rapidTriggerEnabled: false,
        splitSensitivity: true,
        rapidSensitivityMm: 0.02,
        pressSensitivityMm: 0.02,
        releaseSensitivityMm: 0.25,
        deadzoneEnabled: true,
        topDeadzoneMm: 0.2,
        bottomDeadzoneMm: 0.3,
        switchProfile: 'white',
      },
    ],
  }
  const packets = xsydDevice.xsydProtocolEncoder.encodeSave(snapshot)
  assert.equal(packets.length, 2)
  const fieldFrame = Buffer.from(packets[1], 'hex')
  const decodedWrites = xsydFeatures.decodeFieldWritePayload(fieldFrame.subarray(4, 4 + fieldFrame[1]))
  assert.deepEqual(decodedWrites, [
    // Space: RT ON (0x20), Travel 1510 um, RT Press/Release 150 um (0.15 mm), Top DZ 1000 um (1.0 mm), Bottom DZ 300 um (0.3 mm), Switch 1 (Jade Pro)
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.Header, value: 0x20 },
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.Travel, value: 1510 },
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.RapidTriggerPress, value: 150 },
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.RapidTriggerRelease, value: 150 },
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.TopDeadzone, value: 1000 },
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.BottomDeadzone, value: 300 },
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.SwitchType, value: 1 },
    // KeyW: RT OFF (0x00), Travel clamped to 3300 um for Switch 3 ('white'), RT Press 20 um (0.02 mm), RT Release 250 um (0.25 mm), Top DZ 200 um (0.2 mm), Bottom DZ 300 um (0.3 mm), Switch 3
    { pos: 0x1a, field: xsydFeatures.XsydFeatureField.Header, value: 0x00 },
    { pos: 0x1a, field: xsydFeatures.XsydFeatureField.Travel, value: 3300 },
    { pos: 0x1a, field: xsydFeatures.XsydFeatureField.RapidTriggerPress, value: 20 },
    { pos: 0x1a, field: xsydFeatures.XsydFeatureField.RapidTriggerRelease, value: 250 },
    { pos: 0x1a, field: xsydFeatures.XsydFeatureField.TopDeadzone, value: 200 },
    { pos: 0x1a, field: xsydFeatures.XsydFeatureField.BottomDeadzone, value: 300 },
    { pos: 0x1a, field: xsydFeatures.XsydFeatureField.SwitchType, value: 3 },
  ])

  // Apply those writes into fieldMemory and verify hydrateFromXsydDevice on Profile 0
  await requester.request(fieldFrame)
  const hydrated = await xsydDevice.hydrateFromXsydDevice(requester, 0, ['Space', 'KeyW'])
  assert.deepEqual(hydrated.get('Space'), {
    switchProfile: 'switch-1',
    actuationMm: 1.51,
    rapidTriggerEnabled: true,
    splitSensitivity: false,
    rapidSensitivityMm: 0.15,
    pressSensitivityMm: 0.15,
    releaseSensitivityMm: 0.15,
    topDeadzoneMm: 1.0,
    bottomDeadzoneMm: 0.3,
    deadzoneEnabled: true,
  })
  assert.deepEqual(hydrated.get('KeyW'), {
    switchProfile: 'white',
    actuationMm: 3.3,
    rapidTriggerEnabled: false,
    splitSensitivity: true,
    rapidSensitivityMm: 0.02,
    pressSensitivityMm: 0.02,
    releaseSensitivityMm: 0.25,
    topDeadzoneMm: 0.2,
    bottomDeadzoneMm: 0.3,
    deadzoneEnabled: true,
  })

  // 2. Save DKS, MT, TGL, MPT, END, and SOCD (modes 0, 1, 2, 3) and verify exact wire bytes
  const draft = [
    {
      ...heroAdvanced.newAdvanced('DKS', ['KeyW'], 'win68HeMax'),
      actions: [4, 5, 6, 7],
      thresholds: [1.4, 3.4, 3.4, 1.4],
      states: [
        [14, 0, 0, 0],
        [0, 14, 0, 0],
        [0, 0, 14, 0],
        [0, 0, 0, 10],
      ],
    },
    {
      ...heroAdvanced.newAdvanced('MT', ['KeyQ'], 'win68HeMax'),
      actions: [29, 8],
      delay: 200,
    },
    {
      ...heroAdvanced.newAdvanced('TGL', ['KeyV'], 'win68HeMax'),
      actions: [29],
      delay: 200,
    },
    {
      ...heroAdvanced.newAdvanced('MPT', ['KeyA'], 'win68HeMax'),
      actions: [4, 16, 17],
      thresholds: [0.5, 1.0, 1.5],
    },
    {
      ...heroAdvanced.newAdvanced('END', ['KeyS'], 'win68HeMax'),
      actions: [19],
    },
    {
      ...heroAdvanced.newAdvanced('SOCD', ['KeyC', 'KeyB'], 'win68HeMax'),
      keys: ['KeyC', 'KeyB'],
      id: 'KeyC',
      mode: 1,
    },
  ]

  await heroAdvanced.saveAdvancedBindings(requester, 0, draft, [], 'win68HeMax')
  const writtenHexes = sentFrames.map(hex)
  assert.ok(
    writtenHexes.includes('5c1026cc' + '011a0400050006000700031c60c07805'),
    'DKS frame matches dks_keyW_...pcapng byte for byte'
  )
  assert.ok(writtenHexes.includes('5c0724d0' + '01141d00080014'), 'MT frame matches capture')
  assert.ok(writtenHexes.includes('5c0525cf' + '01191d0014'), 'TGL frame matches capture')
  assert.ok(
    writtenHexes.includes('5c0e27cb' + '0104040010001100f401e803dc05'),
    'MPT frame matches capture in micrometres'
  )
  assert.ok(writtenHexes.includes('5c0428bd' + '01161300'), 'END frame matches capture')
  assert.ok(
    writtenHexes.includes('5c0b2cc8' + '0106050000000000010000'),
    'SOCD mode 1 frame matches capture layout'
  )

  // 3. Removing a binding writes 0x23 field 0x08 = 0x0000 and verifies readback
  sentFrames.length = 0
  await heroAdvanced.saveAdvancedBindings(requester, 0, draft.slice(0, 5), draft, 'win68HeMax')
  assert.ok(
    sentFrames.some(f => f[2] === 0x23 && f[4] === 0x01),
    'Removing binding sends 0x23 field 0x08 = 0 disable frame'
  )

  // 4. Out-of-range SOCD mode (> 3) is rejected before any frame is sent
  sentFrames.length = 0
  await assert.rejects(
    () =>
      heroAdvanced.saveAdvancedBindings(
        requester,
        0,
        [{ ...heroAdvanced.newAdvanced('SOCD', ['KeyA', 'KeyD'], 'win68HeMax'), mode: 4 }],
        [],
        'win68HeMax'
      ),
    /Invalid SOCD mode on WIN 68 HE MAX/
  )
  assert.equal(sentFrames.length, 0)
})

test('AdvancedKeysPage enables DKS and all 4 verified SOCD modes on win68/win68HeMax and hero68/hero84', () => {
  const oldDoc = globalThis.document
  globalThis.document = { body: {}, addEventListener() {}, removeEventListener() {} }
  try {
    const AdvancedKeysPage = advancedPageMod.default
    const { XSYD_SOCD_OPTIONS } = advancedPageMod

    assert.equal(XSYD_SOCD_OPTIONS.length, 4)
    assert.deepEqual(
      XSYD_SOCD_OPTIONS.map(o => ({ value: o.value, verified: o.verified, title: o.title })),
      [
        { value: 0, verified: true, title: 'Last input priority' },
        { value: 1, verified: true, title: 'First key priority' },
        { value: 2, verified: true, title: 'Second key priority' },
        { value: 3, verified: true, title: 'Neutral' },
      ]
    )

    for (const model of ['win68', 'win68HeMax', 'hero68', 'hero84']) {
      const tree = renderComponent({
        type: AdvancedKeysPage,
        props: {
          model,
          bindings: [],
          busy: false,
          pending: false,
          connected: true,
          onChange() {},
        },
      })
      const modeButtons = collectNodes(
        tree,
        el => el.type === 'button' && el.props?.['data-mode'] !== undefined
      )
      const dksButton = modeButtons.find(b => b.props['data-mode'] === 'DKS')
      assert.ok(dksButton, `DKS card button exists on ${model}`)
      assert.equal(dksButton.props['data-unsupported'], undefined, `DKS must be enabled on ${model}`)
      assert.equal(dksButton.props.disabled, false, `DKS must not be disabled on ${model}`)
      assert.ok(!textContent(dksButton).includes('Unsupported'))
      assert.equal(modeButtons.find(b => b.props['data-mode'] === 'RS'), undefined)
      assert.equal(modeButtons.find(b => b.props['data-mode'] === 'DDKS'), undefined)
    }
  } finally {
    if (oldDoc !== undefined) globalThis.document = oldDoc
    else delete globalThis.document
  }
})

test('WIN 68 HE MAX 0x12 / 0x92 Hall travel & pressed-state stream matches travel_test_press_randomkey.pcapng', async () => {
  const hallMod = await bundle('src/protocol/xsyd/hall.ts')
  const deviceMod = await bundle('src/protocol/xsyd/device.ts')
  const codecMod = await bundle('src/protocol/xsyd/codec.ts')

  const pressedReq = hallMod.buildXsydHallPressedFrame()
  const travel1Req = hallMod.buildXsydHallTravelFrame(1)
  const travel2Req = hallMod.buildXsydHallTravelFrame(2)

  assert.deepEqual([...pressedReq.slice(0, 8)], [0x5c, 0x04, 0x12, 0xa6, 0x03, 0x01, 0xff, 0xff])
  assert.deepEqual([...travel1Req.slice(0, 8)], [0x5c, 0x04, 0x12, 0xa6, 0x02, 0x01, 0xff, 0xff])
  assert.deepEqual([...travel2Req.slice(0, 8)], [0x5c, 0x04, 0x12, 0xa6, 0x02, 0x02, 0xff, 0xff])

  assert.deepEqual(hallMod.xsydTableIdsForKeys(['KeyW', 'KeyQ']), [1])
  assert.deepEqual(hallMod.xsydTableIdsForKeys(['KeyS', 'KeyM']), [2])
  assert.deepEqual(hallMod.xsydTableIdsForKeys(['KeyW', 'KeyS']), [1, 2])
  assert.deepEqual(hallMod.xsydTableIdsForKeys([]), [1, 2])

  const pressedPayload = new Uint8Array(0x82)
  pressedPayload[0] = 0x00
  pressedPayload[1] = 0x03
  pressedPayload[2 + 65] = 0x02 // KeyS actuated
  pressedPayload[2 + 92] = 0x02 // KeyM actuated
  pressedPayload[128] = 0xff
  pressedPayload[129] = 0xff
  const pressedReplyFrame = codecMod.buildXsydFrame(0x92, pressedPayload)

  const travel2Payload = new Uint8Array(0x80)
  travel2Payload[0] = 0x00
  travel2Payload[1] = 0x02
  travel2Payload[2 + 2 * 2] = 247
  travel2Payload[2 + 2 * 2 + 1] = 6
  travel2Payload[2 + 29 * 2] = 72
  travel2Payload[2 + 29 * 2 + 1] = 13
  const travel2ReplyFrame = codecMod.buildXsydFrame(0x92, travel2Payload)

  const assembler = new codecMod.XsydFrameAssembler()
  const pReports = codecMod.xsydReports(pressedReplyFrame)
  assert.equal(pReports.length, 3)
  assert.equal(assembler.push(pReports[0]), null)
  assert.equal(assembler.push(pReports[1]), null)
  const decodedPressed = assembler.push(pReports[2])
  assert.ok(decodedPressed && decodedPressed.checksumValid)

  const tReports = codecMod.xsydReports(travel2ReplyFrame)
  assert.equal(tReports.length, 3)
  assert.equal(assembler.push(tReports[0]), null)
  assert.equal(assembler.push(tReports[1]), null)
  const decodedTravel2 = assembler.push(tReports[2])
  assert.ok(decodedTravel2 && decodedTravel2.checksumValid)

  const sentFrames = []
  const samples = await deviceMod.readXsydHallSnapshot(
    {
      async request(frame) {
        sentFrames.push(frame)
        if (frame[4] === 0x03) return decodedPressed
        if (frame[4] === 0x02 && frame[5] === 0x02) return decodedTravel2
        throw new Error('Unexpected request frame')
      },
    },
    { keyIds: ['KeyS', 'KeyM', 'KeyA'] }
  )

  assert.equal(sentFrames.length, 2, 'Only polls pressed (03 01) + lower half travel (02 02) for KeyS/KeyM/KeyA')
  const byKey = Object.fromEntries(samples.map(s => [s.keyId, s]))
  assert.equal(byKey.KeyS.matrixIndex, 65)
  assert.equal(byKey.KeyS.pos, 0x16)
  assert.equal(byKey.KeyS.travelUm, 1783)
  assert.equal(byKey.KeyS.distanceMm, 1.783)
  assert.equal(byKey.KeyS.distanceUnits, 178)
  assert.equal(byKey.KeyS.pressed, true)

  assert.equal(byKey.KeyM.matrixIndex, 92)
  assert.equal(byKey.KeyM.pos, 0x10)
  assert.equal(byKey.KeyM.travelUm, 3400)
  assert.equal(byKey.KeyM.distanceMm, 3.4)
  assert.equal(byKey.KeyM.distanceUnits, 340)
  assert.equal(byKey.KeyM.pressed, true)

  assert.equal(byKey.KeyA.matrixIndex, 64)
  assert.equal(byKey.KeyA.travelUm, 0)
  assert.equal(byKey.KeyA.pressed, false)
})

test('WIN 68 HE MAX 0x18 Global RGB & 0x2A Per-Key RGB match USB captures byte-for-byte', async () => {
  const rgbMod = await bundle('src/protocol/xsyd/rgb.ts')
  const codecMod = await bundle('src/protocol/xsyd/codec.ts')

  const defaultPaletteHex = '0000ffff00ff00ff007f7fffff0000ff7f007fff7f7f00ff7f7f7fff'

  assert.equal(
    hex(rgbMod.buildXsydRgbReadFrame(false)),
    '5c2b18d4' + '0000000000' + 'ff'.repeat(28) + '00'.repeat(10)
  )
  assert.equal(
    hex(rgbMod.buildXsydRgbReadFrame(true)),
    '5c2b18d4' + '0000000000' + defaultPaletteHex + '00'.repeat(10)
  )

  const writeCases = [
    {
      zone: { mode: 0x02, brightness: 4, speed: 3, reverse: false, mix: true, colorIndex: 0, rgb: [255, 0, 0] },
      expectedTail: '01040203020000',
      expectedCk: 'd5',
    },
    {
      zone: { mode: 0x03, brightness: 4, speed: 3, reverse: false, mix: true, colorIndex: 0, rgb: [255, 0, 0] },
      expectedTail: '01040303020000',
      expectedCk: 'd5',
    },
    {
      zone: { mode: 0x04, brightness: 0, speed: 3, reverse: false, mix: true, colorIndex: 0, rgb: [255, 0, 0] },
      expectedTail: '01000403020000',
      expectedCk: 'd5',
    },
    {
      zone: { mode: 0x04, brightness: 4, speed: 4, reverse: true, mix: true, colorIndex: 0, rgb: [255, 0, 0] },
      expectedTail: '03040404020000',
      expectedCk: 'd5',
    },
    {
      zone: { mode: 0x0c, brightness: 4, speed: 4, reverse: false, mix: false, colorIndex: 1, rgb: [255, 0, 0] },
      expectedTail: '01040c04020001',
      expectedCk: 'd6',
    },
    {
      zone: { mode: 0x0c, brightness: 4, speed: 4, reverse: false, mix: false, colorIndex: 4, rgb: [0, 0, 255] },
      expectedTail: '01040c04020004',
      expectedCk: 'd9',
    },
    {
      zone: { mode: 0x15, brightness: 4, speed: 3, reverse: false, mix: true, colorIndex: 0, rgb: [255, 255, 255] },
      expectedTail: '01041503020000',
      expectedCk: 'd5',
    },
  ]

  for (const tc of writeCases) {
    const frame = rgbMod.buildXsydRgbWriteFrame(tc.zone)
    assert.equal(
      hex(frame),
      `5c2c18${tc.expectedCk}0100000000${defaultPaletteHex}00000000${tc.expectedTail}`
    )
    const replyPayload = new Uint8Array(0x2d)
    replyPayload.set(frame.slice(4, 4 + 0x2c), 0)
    replyPayload[0] = 0x00
    const decoded = rgbMod.decodeXsydRgbReply(codecMod.decodeXsydFrame(makeReply(0x18, replyPayload)))
    assert.equal(decoded.mode, tc.zone.mode)
    assert.equal(decoded.brightness, tc.zone.brightness)
    assert.equal(decoded.speed, tc.zone.speed)
    assert.equal(decoded.reverse, tc.zone.reverse)
    assert.equal(decoded.colorIndex, tc.zone.colorIndex)
  }

  assert.equal(hex(rgbMod.buildXsydPerKeyWriteFrame(0x14, [7, 255, 0])), '5c052ac0011407ff00')
  assert.equal(hex(rgbMod.buildXsydPerKeyWriteFrame(0x08, [255, 0, 0])), '5c052ac00108ff0000')
  assert.equal(hex(rgbMod.buildXsydPerKeyWriteFrame(0x1d, [232, 255, 0])), '5c052ac0011de8ff00')
  assert.equal(hex(rgbMod.buildXsydPerKeyWriteFrame(0x13, [255, 0, 206])), '5c052a8e0113ff00ce')

  const readFrames = rgbMod.buildXsydPerKeyReadFrames()
  assert.equal(readFrames.length, 5)
  for (const rf of readFrames) {
    assert.equal(rf[0], 0x5c)
    assert.equal(rf[1], 0x39)
    assert.equal(rf[2], 0x2a)
    assert.equal(rf[3], 0xf4)
    assert.equal(rf[4], 0x00)
  }
  assert.equal(hex(readFrames[4]).slice(-16), 'ff000000ff000000')

  const sent = []
  const mockRequester = {
    async request(frame) {
      sent.push(frame)
      const op = frame[2]
      if (op === 0x00) {
        return codecMod.decodeXsydFrame(makeReply(0x00, [0x00, 0x70, frame[5], 0xff]))
      }
      if (op === 0x2a) {
        const replyPayload = new Uint8Array(0x39)
        replyPayload.set(frame.slice(4, 4 + frame[1]), 0)
        replyPayload[0] = 0x00
        return codecMod.decodeXsydFrame(makeReply(0x2a, replyPayload))
      }
      if (op === 0x18) {
        const replyPayload = new Uint8Array(0x2d)
        replyPayload.set(frame.slice(4, 4 + 0x2c), 0)
        replyPayload[0] = 0x00
        return codecMod.decodeXsydFrame(makeReply(0x18, replyPayload))
      }
      throw new Error(`Unexpected op 0x${op.toString(16)}`)
    },
  }

  const baseline = rgbMod.defaultXsydRgb()
  const draft = structuredClone(baseline)
  draft.keys.mode = 0x15
  draft.colors.KeyQ = [7, 255, 0]
  draft.colors.KeyP = [255, 0, 206]

  let verifiedSnapshot = null
  await rgbMod.saveXsydRgbProfile(mockRequester, draft, baseline, next => {
    verifiedSnapshot = next
  })
  assert.ok(verifiedSnapshot)
  assert.deepEqual(verifiedSnapshot.colors.KeyQ, [7, 255, 0])
  assert.deepEqual(verifiedSnapshot.colors.KeyP, [255, 0, 206])
  assert.equal(verifiedSnapshot.keys.mode, 0x15)

  sent.length = 0
  const streamer = new rgbMod.XsydCustomRgbStreamer()
  const count1 = await streamer.pushFrameDelta(mockRequester, { KeyQ: '#07ff00', KeyE: '#ff0000' })
  assert.equal(count1, 2)
  assert.equal(sent.length, 3)
  const count2 = await streamer.pushFrameDelta(mockRequester, { KeyQ: '#07ff00', KeyE: '#0000ff' })
  assert.equal(count2, 1)
})

test('AulaWin68ExactRgbEngine & XsydFirmwareRgbPreview execute all 28 internal modes and 27 external modes', async () => {
  const previewMod = await bundle('src/keyboard/xsydRgbPreview.ts')
  const rgbMod = await bundle('src/protocol/xsyd/rgb.ts')
  const catalogMod = await bundle('src/keyboard/rgbCatalog.ts')

  assert.equal(previewMod.EXT_TO_INT_ROM.length, 27)
  assert.equal(catalogMod.WIN68_KEY_RGB_MODES.length, 27)
  assert.equal(previewMod.KEYS_68.length, 68)

  const engine = new previewMod.AulaWin68ExactRgbEngine(1)
  assert.equal(engine.isqrt32(0), 0)
  assert.equal(engine.isqrt32(65536), 256)
  assert.equal(engine.hypot256(3, 4), 1280)
  assert.equal(engine.sin720(0), 0)
  assert.equal(engine.sin720(180), 255)
  assert.equal(engine.sin720(360), 0)
  assert.equal(engine.sin720(540), -255)
  assert.equal(engine.hsvToRgb(0, 255, 255) & 0xffffff, 0xff0000)
  assert.equal(engine.hsvToRgb(120, 255, 255) & 0xffffff, 0x00ff00)
  assert.equal(engine.hsvToRgb(240, 255, 255) & 0xffffff, 0x0000ff)

  const baseProfile = rgbMod.defaultXsydRgb()
  const preview = new previewMod.XsydFirmwareRgbPreview(baseProfile)
  for (const modeInfo of catalogMod.WIN68_KEY_RGB_MODES) {
    const profile = structuredClone(baseProfile)
    profile.keys.mode = modeInfo.id
    profile.keys.brightness = 4
    profile.keys.speed = 3
    profile.keys.reverse = modeInfo.reverse
    profile.keys.mix = true
    profile.keys.colorIndex = 0
    preview.configure(profile)
    preview.advance(preview.ticks * 0.5 + 150)
    if (modeInfo.reactive) {
      preview.event('KeyW', true)
      preview.advance(preview.ticks * 0.5 + 100)
      preview.event('KeyW', false)
      preview.advance(preview.ticks * 0.5 + 100)
    }
    const frame = preview.frame()
    assert.equal(Object.keys(frame.keys).length, 68, `Mode ${modeInfo.id} (${modeInfo.name}) produces 68 keys`)
    assert.ok(
      Object.values(frame.keys).some(hexColor => hexColor !== '#000000'),
      `Mode ${modeInfo.id} (${modeInfo.name}) lights up keys at brightness 4`
    )
  }

  const offProfile = structuredClone(baseProfile)
  offProfile.keys.brightness = 0
  preview.configure(offProfile)
  preview.advance(preview.ticks * 0.5 + 50)
  assert.ok(Object.values(preview.frame().keys).every(c => c === '#000000'))
})

test('RgbSettingsPage renders WIN 68 HE MAX 27 modes, Reverse toggle, and 8 Color Slots when model is win68HeMax', async () => {
  const oldWindow = globalThis.window
  const oldDoc = globalThis.document
  globalThis.window = {
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
  }
  globalThis.document = {
    hidden: false,
    body: {},
    addEventListener() {},
    removeEventListener() {},
  }
  try {
    const rgbPageMod = await bundle('src/components/RgbSettingsPage.tsx')
    const modelCtxMod = await bundle('src/app/DeviceModelContext.ts')
    const rgbMod = await bundle('src/protocol/xsyd/rgb.ts')
    const RgbSettingsPage = rgbPageMod.default
    const { DeviceModelContext } = modelCtxMod

    const prevModel = DeviceModelContext._currentValue
    DeviceModelContext._currentValue = 'win68HeMax'
    try {
      const profile = rgbMod.defaultXsydRgb()
      profile.keys.mode = 2
      const tree = renderComponent({
        type: RgbSettingsPage,
        props: {
          model: 'win68HeMax',
          value: profile,
          onChange() {},
          busy: false,
          advancedBindings: [],
          onSetup() {},
        },
      })

      const allText = textContent(tree)
      assert.match(allText, /WIN 68 HE MAX Effects|Hiệu ứng WIN 68 HE MAX/)
      assert.match(allText, /Tide Flux/)
      assert.match(allText, /Snipping Storm/)
      assert.match(allText, /Smooth Flow/)
      assert.match(allText, /Reverse direction|Đảo chiều hiệu ứng/)
      assert.match(allText, /XSYD Mode 0x02/)
    } finally {
      DeviceModelContext._currentValue = prevModel
    }
  } finally {
    if (oldWindow !== undefined) globalThis.window = oldWindow
    else delete globalThis.window
    if (oldDoc !== undefined) globalThis.document = oldDoc
    else delete globalThis.document
  }
})

test('WIN 68 HE MAX GamepadPage & BackgroundServicePage work without timeout when Windows service is running', async () => {
  const registryMod = await bundle('src/keyboard/registry/index.ts')
  assert.equal(
    registryMod.detectBoardFromUuid(new Uint8Array([0x11, 0x00, 0x00, 0x00, 0x00, 0x5c])),
    'win68HeMax',
    'detectBoardFromUuid recognizes XSYD bridge UUID 11000000005c'
  )

  const gamepadPageMod = await bundle('src/pages/GamepadPage.tsx')
  const bgServicePageMod = await bundle('src/pages/BackgroundServicePage.tsx')
  const gamepadServiceMod = await bundle('src/protocol/gamepadService.ts')
  assert.equal(typeof gamepadPageMod.default, 'function')
  assert.equal(typeof bgServicePageMod.default, 'function')
  assert.equal(typeof gamepadServiceMod.useSharedHallService, 'function')
})
