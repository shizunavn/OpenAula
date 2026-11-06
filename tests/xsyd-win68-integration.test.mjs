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
 *
 * The bundled React is the one the test process requires, so installing a
 * dispatcher on its client internals is enough for one synchronous render.
 * State setters are no-ops and effects never run: the assertions below only
 * read the markup produced by the first render.
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
  // socd_AD_on.pcapng: 5c 0b 2c c8 | 01 04 07 00 00 00 00 00 00 00 00
  const socdFrame = xsydAdvanced.buildSocdFrame({ key1: 0x04, key2: 0x07 })
  assert.equal(hex(socdFrame), '5c0b2cc8' + '0104070000000000000000')

  // Reject unverified SOCD modes/types/delays
  assert.throws(() => xsydAdvanced.buildSocdFrame({ key1: 0x04, key2: 0x07, mode: 1 }), RangeError)
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
  // #0:   out 5c 04 00 94 | 50 01 ff ff (set 4000 Hz)
  // #636: out 5c 04 00 94 | 50 02 ff ff (set 2000 Hz)
  // #996: out 5c 04 00 94 | 50 03 ff ff (set 1000 Hz)
  // #14:  out 5c 04 00 94 | 50 07 ff ff (read polling rate)
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

test('XsydDeviceManager connects without reopening an open handle, reassembles multi-report replies, and handles 4k->2k->1k polling-rate USB re-enumeration', async () => {
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
          } else if (op === 0x00 && sub === 0x50) {
            const code = bytes[5]
            if (code === 0x07) {
              // Read current polling rate (50 07 ff ff -> 00 50 <code> ff)
              const r = makeReply(0x00, [0x00, 0x50, activeRateCode, 0xff])
              for (const l of listeners) l({ reportId: 0, data: new DataView(r.buffer) })
            } else {
              // Write polling rate (50 <code> ff ff -> 00 50 <code> ff + USB re-enumeration)
              activeRateCode = code
              const r = makeReply(0x00, [0x00, 0x50, activeRateCode, 0xff])
              for (const l of listeners) l({ reportId: 0, data: new DataView(r.buffer) })
              // Simulate USB disconnect + re-enumeration as a new device handle
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

    // Mismatched reply opcode rejects clearly
    await assert.rejects(
      () => mgr.request(xsydAdvanced.buildMtFrame({ key: 26, hold: 29, tap: 8, delayMs: 200 })),
      /Unexpected XSYD reply opcode 0x80 \(expected 0xa4\)/
    )
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

  // OS mode radio buttons remain disabled on WIN 68 HE MAX
  const osModeButtons = radioButtons.filter(b => !textContent(b).includes('Hz'))
  assert.equal(osModeButtons.length, 2)
  for (const btn of osModeButtons) {
    assert.equal(btn.props.disabled, true, 'HERO68 OS mode buttons stay disabled on WIN 68 HE MAX')
  }
})

test('saveXsydAdvancedBindings and xsydProtocolEncoder use micrometres, verify readback, and reject DKS/unverified SOCD', async () => {
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
      if ([0x24, 0x25, 0x27, 0x28, 0x2c].includes(op)) {
        const keyPos = op === 0x27 ? 0x04 : frame[5]
        fieldMemory.set(`${keyPos}:${xsydFeatures.XsydFeatureField.Header}`, 0x20)
        return xsydCodec.decodeXsydFrame(makeReply(op, frame.slice(4, 4 + frame[1])))
      }
      throw new Error(`Unexpected opcode 0x${op.toString(16)}`)
    },
  }

  // 1. Performance encoder converts mm -> micrometres (1.50 mm = 1500 um, never 150)
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
        rapidSensitivityMm: 0.1,
        pressSensitivityMm: 0.1,
        releaseSensitivityMm: 0.1,
        deadzoneEnabled: true,
        topDeadzoneMm: 0.1,
        bottomDeadzoneMm: 0.1,
        switchProfile: 'jade-pro',
      },
    ],
  }
  const packets = xsydDevice.xsydProtocolEncoder.encodeSave(snapshot)
  assert.equal(packets.length, 2)
  const fieldFrame = Buffer.from(packets[1], 'hex')
  const decodedWrites = xsydFeatures.decodeFieldWritePayload(fieldFrame.subarray(4, 4 + fieldFrame[1]))
  assert.deepEqual(decodedWrites, [
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.Header, value: 0x20 },
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.Travel, value: 1510 },
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.RapidTrigger, value: 100 },
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.Deadzone, value: 100 },
    { pos: 0x2c, field: xsydFeatures.XsydFeatureField.SwitchType, value: 1 },
  ])

  // 2. Save MT, TGL, MPT, END, and SOCD (mode=0) and verify exact wire bytes
  const draft = [
    {
      ...heroAdvanced.newAdvanced('MT', ['KeyW'], 'win68HeMax'),
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
      ...heroAdvanced.newAdvanced('SOCD', ['KeyA', 'KeyD'], 'win68HeMax'),
      keys: ['KeyC', 'KeyB'],
      id: 'KeyC',
      mode: 0,
    },
  ]

  await heroAdvanced.saveAdvancedBindings(requester, 0, draft, [], 'win68HeMax')
  const writtenHexes = sentFrames.map(hex)
  assert.ok(writtenHexes.includes('5c0724d0' + '011a1d00080014'), 'MT frame matches capture')
  assert.ok(writtenHexes.includes('5c0525cf' + '01191d0014'), 'TGL frame matches capture')
  assert.ok(
    writtenHexes.includes('5c0e27cb' + '0104040010001100f401e803dc05'),
    'MPT frame matches capture in micrometres'
  )
  assert.ok(writtenHexes.includes('5c0428bd' + '01161300'), 'END frame matches capture')

  // 3. Removing a binding writes 0x23 field 0x08 = 0x0000 and verifies readback
  sentFrames.length = 0
  await heroAdvanced.saveAdvancedBindings(requester, 0, draft.slice(0, 4), draft, 'win68HeMax')
  assert.ok(
    sentFrames.some(f => f[2] === 0x23 && f[4] === 0x01),
    'Removing binding sends 0x23 field 0x08 = 0 disable frame'
  )

  // 4. DKS and SOCD mode != 0 are rejected before any frame is sent
  sentFrames.length = 0
  await assert.rejects(
    () =>
      heroAdvanced.saveAdvancedBindings(
        requester,
        0,
        [heroAdvanced.newAdvanced('DKS', ['KeyQ'], 'win68HeMax')],
        [],
        'win68HeMax'
      ),
    /DKS is not supported on WIN 68 HE MAX/
  )
  assert.equal(sentFrames.length, 0)

  await assert.rejects(
    () =>
      heroAdvanced.saveAdvancedBindings(
        requester,
        0,
        [{ ...heroAdvanced.newAdvanced('SOCD', ['KeyA', 'KeyD'], 'win68HeMax'), mode: 1 }],
        [],
        'win68HeMax'
      ),
    /Only SOCD mode 0 is verified/
  )
  assert.equal(sentFrames.length, 0)
})

test('DKS unsupported modal and badges appear on win68/win68HeMax and never exist on hero68/hero84', () => {
  const oldDoc = globalThis.document
  globalThis.document = { body: {}, addEventListener() {}, removeEventListener() {} }
  try {
    const AdvancedKeysPage = advancedPageMod.default
    const { DksUnsupportedModal, XSYD_DKS_DOC_URL } = advancedPageMod

    // 1. Model win68 / win68HeMax: DKS card has Unsupported badge and modal renders with required copy and doc link
    const win68Tree = renderComponent({
      type: AdvancedKeysPage,
      props: {
        model: 'win68',
        bindings: [],
        busy: false,
        pending: false,
        connected: true,
        initialDksModalOpen: true,
        onChange() {},
      },
    })

    const win68Buttons = collectNodes(
      win68Tree,
      el => el.type === 'button' && el.props?.['data-mode'] !== undefined
    )
    const win68DksButton = win68Buttons.find(b => b.props['data-mode'] === 'DKS')
    assert.ok(win68DksButton, 'DKS card button exists on win68')
    assert.equal(win68DksButton.props['data-unsupported'], 'true')
    assert.equal(win68DksButton.props['aria-disabled'], 'true')
    assert.match(textContent(win68DksButton), /Unsupported|Chưa hỗ trợ/)

    // RS and DDKS are also present and disabled on win68
    const win68RsButton = win68Buttons.find(b => b.props['data-mode'] === 'RS')
    const win68DdksButton = win68Buttons.find(b => b.props['data-mode'] === 'DDKS')
    assert.equal(win68RsButton?.props?.disabled, true)
    assert.equal(win68DdksButton?.props?.disabled, true)

    const win68Modals = collectNodes(
      win68Tree,
      el => el.type === 'section' && el.props?.['aria-labelledby'] === 'ak-dks-unsupported-title'
    )
    assert.equal(win68Modals.length, 1, 'DKS unsupported modal opens on win68')
    const modalText = textContent(win68Modals[0])
    assert.match(modalText, /DKS is not supported on WIN 68 HE MAX/)
    assert.match(modalText, /MT, TGL, MPT, and END/)
    const docLinks = collectNodes(
      win68Modals[0],
      el => el.type === 'a' && el.props?.href === XSYD_DKS_DOC_URL
    )
    assert.equal(docLinks.length, 1, 'Modal links to docs/xsyd-protocol.md §7')

    // Verify Vietnamese translations for the modal
    const trVi = i18nMod.createTranslator('vi')
    assert.equal(
      trVi('DKS is not supported on WIN 68 HE MAX'),
      'DKS chưa được hỗ trợ trên WIN 68 HE MAX'
    )
    assert.equal(trVi('Unsupported'), 'Chưa hỗ trợ')
    assert.equal(trVi('Unverified'), 'Chưa xác minh')
    assert.equal(trVi('Close'), 'Đóng')
    assert.equal(trVi('View documentation'), 'Xem tài liệu')
    assert.ok(renderComponent({ type: DksUnsupportedModal, props: { open: false, onClose() {} } }) === null)

    // 2. Model hero68 / hero84: DKS card is normal and DKS unsupported modal does NOT exist
    for (const heroModel of ['hero68', 'hero84']) {
      const heroTree = renderComponent({
        type: AdvancedKeysPage,
        props: {
          model: heroModel,
          bindings: [],
          busy: false,
          pending: false,
          connected: true,
          initialDksModalOpen: true,
          onChange() {},
        },
      })
      const heroButtons = collectNodes(
        heroTree,
        el => el.type === 'button' && el.props?.['data-mode'] !== undefined
      )
      const heroDksButton = heroButtons.find(b => b.props['data-mode'] === 'DKS')
      assert.ok(heroDksButton)
      assert.equal(heroDksButton.props['data-unsupported'], undefined)
      assert.ok(!textContent(heroDksButton).includes('Unsupported'))
      assert.equal(heroButtons.find(b => b.props['data-mode'] === 'RS'), undefined)

      const heroModals = collectNodes(
        heroTree,
        el => el.type === 'section' && el.props?.['aria-labelledby'] === 'ak-dks-unsupported-title'
      )
      assert.equal(heroModals.length, 0, `DKS unsupported modal must not exist on ${heroModel}`)
    }
  } finally {
    if (oldDoc !== undefined) globalThis.document = oldDoc
    else delete globalThis.document
  }
})
