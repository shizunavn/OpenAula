// A tiny module server used by public/vendor-tap/loader.js.
//
// Why a worker at all: the vendor bundle may only be evaluated from its real URL
// under ./vendor/ - that is what makes its relative imports resolve - but it has
// to run in the page's realm (it builds the DOM and calls WebHID). This worker only
// fetches module texts and relays them; the page imports them itself. The bundle
// text comes patched from the page, the chunks are passed through untouched.
let patched = ''
let bundleURL = ''

globalThis.addEventListener('message', async ({ data }) => {
  if (data?.type === 'boot') {
    patched = data.patched
    bundleURL = data.bundleURL
    globalThis.postMessage({ type: 'ready' })
    return
  }
  if (data?.type !== 'fetch') return
  const url = new URL(data.address, bundleURL).href
  try {
    if (url === bundleURL) {
      globalThis.postMessage({ type: 'module', id: data.id, url, text: patched })
      return
    }
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${response.status} ${url}`)
    const text = await response.text()
    if (text.trimStart().startsWith('<')) {
      throw new Error(`Unexpected HTML response for ${url}`)
    }
    globalThis.postMessage({ type: 'module', id: data.id, url, text })
  } catch (error) {
    globalThis.postMessage({ type: 'module', id: data.id, url, error: String(error?.message ?? error) })
  }
})
