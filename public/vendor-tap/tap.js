// Runs the vendor configuration app with a small tap on its USB traffic.
//
// Why: a keyboard model we do not support yet can only be added once we know
// which packets its own configuration app sends. That app is a WebHID page that
// talks to the keyboard directly, so no USB capture tool is needed: this page
// loads the same vendor bundle, logs the packets of one send method and one
// receive callback, and offers the log as a download. Nothing is sent to the
// keyboard here that the app does not send on its own.
//
// The page is deliberately not linked from the main app UI: it exists to collect
// evidence from volunteers who own a keyboard we cannot test ourselves.

const TAP_VERSION = 1
const MAX_ENTRIES = 20000
// The transport lives in the main bundle, not in a lazy chunk; both call sites
// are checked by tests/vendor-tap.test.mjs against the shipped bundle.
const REPLACED_OUT = 'return this.device.sendReport(this.reportId,this._fillPayload(this._ensureUint8Array(t)))'
const REPLACED_IN = '_setupEventListeners(){this.device.oninputreport=t=>this._handleInputReport(t)}'
const TAPPED_OUT = 'return this.__ohTap(this._ensureUint8Array(t))'
const TAPPED_IN = '_setupEventListeners(){this.device.oninputreport=t=>{t.data=this.__ohTap(t.data),this._handleInputReport(t)}}'

const entries = []
let dropped = 0
let startedAt = 0

function say(status, detail = '') {
  Object.assign(window.__OH_TAP, { status, detail })
  window.dispatchEvent(new CustomEvent('oh-tap', { detail: { status, detail } }))
}

function replacedOnce(source, original, patched) {
  const count = source.split(original).length - 1
  if (count !== 1) throw new Error(`expected exactly one match, found ${count}`)
  return source.replace(original, patched)
}

function start() {
  entries.length = 0
  dropped = 0
  startedAt = Date.now()
}

function download() {
  const doc = {
    format: 'openhero68-vendor-tap',
    version: TAP_VERSION,
    capturedAt: new Date().toISOString(),
    url: location.href,
    appVersion: window.__OH_TAP.appVersion,
    userAgent: navigator.userAgent,
    dropped,
    entries,
  }
  const name = `openhero68-vendor-tap-${doc.capturedAt.replace(/[:.]/g, '-')}.json`
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return name
}

window.__OH_TAP = {
  status: 'boot',
  detail: '',
  appVersion: null,
  start,
  download,
  count: () => entries.length,
  summary: () => ({ status: window.__OH_TAP.status, detail: window.__OH_TAP.detail, count: entries.length, dropped }),
  // Same function for both directions: the transport calls it for outgoing
  // payloads and for incoming reports, and hands the argument straight back.
  __ohTap(view) {
    try {
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      if (entries.length >= MAX_ENTRIES) dropped++
      else entries.push({ at: Date.now() - startedAt, hex: Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('') })
    } catch {
      // Not a view we understand; leave the packet alone.
    }
    return view
  },
}

export async function loadTappedApp(version) {
  window.__OH_TAP.appVersion = version
  start()
  say('loading', `bundle ${version}`)
  try {
    const app = await fetch(`./vendor/app-${version}.js`).then((response) => response.text())
    const patched = replacedOnce(replacedOnce(app, REPLACED_IN, TAPPED_IN), REPLACED_OUT, TAPPED_OUT)
    // Both patches only grow the bundle; any other length means the vendor build
    // changed under us and the log would be incomplete.
    if (patched.length !== app.length + TAPPED_IN.length - REPLACED_IN.length + TAPPED_OUT.length - REPLACED_OUT.length) {
      throw new Error('patch length mismatch')
    }
    say('patching', 'tap installed')
    const script = document.createElement('script')
    script.type = 'module'
    // A blob import keeps the bundle on this origin, so its relative imports
    // resolve against the vendor directory and WebHID permission still applies.
    script.src = URL.createObjectURL(new Blob([patched], { type: 'text/javascript' }))
    script.onerror = () => say('failed', 'vendor bundle did not load')
    document.body.append(script)
    say('running', 'vendor app loading')
  } catch (error) {
    say('failed', String(error?.message ?? error))
    throw error
  }
}
