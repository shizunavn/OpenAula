// Runs the vendor app while the bundle is patched only in memory.
//
// The patched bundle has to be evaluated in the page's own realm (it builds the
// DOM and calls WebHID), but a blob module cannot resolve relative imports such
// as `./chunk-DhYw-kuD.js`. Moreover, lazy chunks import `./app-CPb3bToC.js` back,
// which would re-evaluate an unpatched second copy of the entry bundle if loaded
// from disk. So every module in the DAG is converted into a cached blob URL whose
// static imports point at the already-created blob URLs and whose dynamic
// `import("./chunk-...")` calls go through `window.__OH_IMPORT`.

const WORKER_URL = new URL('./module-worker.js', import.meta.url).href

const FALLBACK_LOGO_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="120" viewBox="0 0 520 120">' +
      '<rect width="100%" height="100%" fill="none"/>' +
      '<text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" fill="#1377cc" font-family="Segoe UI, Arial, sans-serif" font-size="68" font-weight="800" letter-spacing="8">AULA</text>' +
    '</svg>',
  )

export class WorkerDelegatedModule {
  // `url` is where the bundle would be served from; relative specifiers in it and
  // in the chunks resolve against that location, and the bundle itself is `text`.
  async load({ text, url }) {
    const worker = new Worker(WORKER_URL, { type: 'module' })
    const waiting = new Map()
    let nextId = 0
    let markReady
    const ready = new Promise((resolve) => { markReady = resolve })
    worker.onmessage = ({ data }) => {
      if (data?.type === 'ready') markReady()
      else if (data?.type === 'module') {
        const pending = waiting.get(data.id)
        if (pending) {
          waiting.delete(data.id)
          pending(data)
        }
      } else if (data?.type === 'error') {
        waiting.forEach((pending) => pending({ error: data.message }))
        waiting.clear()
      }
    }
    worker.postMessage({ type: 'boot', patched: text, bundleURL: url })
    await ready

    const fetchModule = (address) => new Promise((resolve) => {
      const id = nextId++
      waiting.set(id, resolve)
      worker.postMessage({ type: 'fetch', id, address })
    })

    const blobUrlPromises = new Map()
    const modules = new Map()

    const prepareBlobUrl = (moduleUrl) => {
      if (blobUrlPromises.has(moduleUrl)) return blobUrlPromises.get(moduleUrl)
      const promise = (async () => {
        let response
        try {
          response = moduleUrl === url ? { text } : await fetchModule(moduleUrl)
        } catch (error) {
          throw new Error(`chunk ${moduleUrl}: ${error.message}`)
        }
        if (response.error) throw new Error(`chunk ${moduleUrl}: ${response.error}`)
        let source = response.text
        if (source.trimStart().startsWith('<')) {
          throw new Error(`chunk ${moduleUrl}: received HTML instead of JavaScript`)
        }

        if (moduleUrl === url) {
          // 1. Align Vue Router history base with the iframe pathname so route "/" matches immediately.
          source = source.replace('history:dkt("./")', 'history:dkt(location.pathname)')
          // 2. Bypass Vite's CSS/modulepreload helper `y1` so missing per-chunk CSS files in
          //    `__vite__mapDeps` (already bundled in `app-D2Wsam_C.css`) never reject route loads.
          source = source.replace(
            'y1=function(t,a,i){',
            'y1=function(t){return Promise.resolve().then(()=>t())};const __ohOrigPreload=function(t,a,i){',
          )
          // 3. Deduplicate WebHID requestDevice filters in `Szt()` and match any valid UUID `s`
          //    on the first `get_uuid()` read so device selection succeeds in a single round-trip.
          source = source.replace(
            'function Szt(){let e=[];for(let t=0;t<t1.length;t++)e.push({vendorId:t1[t].vendor_id,productId:t1[t].product_id});return e}',
            'function Szt(){const seen=new Set(),e=[];for(let t=0;t<t1.length;t++){const k=t1[t].vendor_id+":"+t1[t].product_id;if(!seen.has(k)){seen.add(k);e.push({vendorId:t1[t].vendor_id,productId:t1[t].product_id,usagePage:65376,usage:97});e.push({vendorId:t1[t].vendor_id,productId:t1[t].product_id})}}return e}',
          )
          source = source.replaceAll(
            'if(Number(e[i].uuid)===0xffffffffffff){const n=t1.find(l=>Number(l.uuid)===Number(s));',
            'if(s){const n=t1.find(l=>Number(l.uuid)===Number(s))||t1.find(l=>l.product_id===t.productId&&l.vendor_id===t.vendorId);',
          )
        }

        // Replace missing relative logo image path with an embedded SVG logo.
        source = source.replaceAll('"src/assets/img/logo_aula.png"', JSON.stringify(FALLBACK_LOGO_SVG))

        // Discover all static relative JS imports (`from "./..."` and side-effect `import "./..."`)
        // and prepare their blob URLs first (the static import graph is a cycle-free DAG).
        const staticSpecifiers = new Set()
        for (const match of source.matchAll(/\bfrom\s*(["'])(\.{1,2}\/[^"']+\.js)\1/g)) {
          staticSpecifiers.add(match[2])
        }
        for (const match of source.matchAll(/\bimport\s*(["'])(\.{1,2}\/[^"']+\.js)\1/g)) {
          staticSpecifiers.add(match[2])
        }

        const resolvedBlobMap = new Map()
        await Promise.all(
          [...staticSpecifiers].map(async (spec) => {
            const targetUrl = new URL(spec, moduleUrl).href
            const depBlobUrl = await prepareBlobUrl(targetUrl)
            resolvedBlobMap.set(spec, depBlobUrl)
          }),
        )

        // Rewrite static `from "./..."` and `import "./..."` to their cached blob URLs.
        source = source.replace(
          /\b(from|import)\s*(["'])(\.{1,2}\/[^"']+\.js)\2/g,
          (match, kw, quote, specifier) => {
            const depBlob = resolvedBlobMap.get(specifier)
            return depBlob ? `${kw}${quote}${depBlob}${quote}` : match
          },
        )

        // Rewrite dynamic `import("./chunk-...")` to route through `window.__OH_IMPORT(...)`
        // so lazy route chunks also resolve `./app-CPb3bToC.js` to the single patched blob URL.
        source = source.replace(
          /\bimport\(\s*(["'])(\.{1,2}\/[^"']+\.js)\1\s*\)/g,
          (match, quote, specifier) => {
            const absUrl = new URL(specifier, moduleUrl).href
            return `window.__OH_IMPORT(${quote}${absUrl}${quote})`
          },
        )

        return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
      })()

      blobUrlPromises.set(moduleUrl, promise)
      return promise
    }

    this.importSync = async (address) => {
      const moduleUrl = new URL(address, url).href
      if (modules.has(moduleUrl)) return modules.get(moduleUrl)
      const blob = await prepareBlobUrl(moduleUrl)
      let module
      try {
        module = await import(blob)
      } catch (error) {
        throw new Error(`module ${moduleUrl}: ${error.message}`)
      }
      modules.set(moduleUrl, module)
      return module
    }

    if (typeof window !== 'undefined') {
      window.__OH_IMPORT = (address) => this.importSync(address)
    }

    return this.importSync(url)
  }
}
