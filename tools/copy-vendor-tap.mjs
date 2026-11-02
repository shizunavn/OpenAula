// The vendor app must be served from the same origin as this page: its WebHID
// permission is scoped per site, so a cross-origin iframe could never open the
// keyboard. These files are copied verbatim from https://hero.aulastar.com (the
// HERO 84 HE web driver), the build that was reverse engineered, so volunteers
// record exactly what the official app sends. They are not part of the
// OpenHero68 application; replacing them means updating BUNDLE and the bundle
// version passed to loadTappedApp in public/vendor-tap/app.html.

import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUNDLE = {
  source: 'E:/hero84-re/webdriver',
  // The CSS imports its own assets with relative paths; this is the only one the
  // app shell needs to exist before the bundle renders.
  files: ['app-CPb3bToC.js', 'app-D2Wsam_C.css'],
}

const output = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'vendor-tap', 'vendor')
mkdirSync(output, { recursive: true })
for (const file of BUNDLE.files) copyFileSync(join(BUNDLE.source, file), join(output, file))
console.log(`Copied ${BUNDLE.files.length} vendor files from ${BUNDLE.source}`)
