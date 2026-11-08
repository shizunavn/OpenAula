import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
const config=JSON.parse(await readFile('tools/setup-toolchain.json','utf8'))
const version=JSON.parse(await readFile('service/version.json','utf8'))
if(version.innoVersion!==config.inno.version)throw Error('Inno toolchain pins do not match')
const folder = path.resolve('.refactor/setup-tools')
await mkdir(folder, { recursive: true })

async function fetchAssetBytes(name, asset) {
  const urls = [asset.apiUrl, asset.url].filter(Boolean)
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  const headers = {
    'User-Agent': 'OpenAula-Setup-Toolchain',
    Accept: 'application/octet-stream',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }

  let lastError
  for (const url of urls) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(180000) })
        if (response.ok) {
          return Buffer.from(await response.arrayBuffer())
        }
        lastError = Error(`Cannot download ${name} from ${url}: ${response.status}`)
      } catch (err) {
        lastError = err
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  throw lastError
}

for (const [name, asset] of Object.entries(config)) {
  const file = path.join(folder, path.basename(new URL(asset.url).pathname))
  let bytes
  try {
    bytes = await readFile(file)
  } catch {}
  const valid = (bytes) => bytes && createHash('sha256').update(bytes).digest('hex') === asset.sha256
  if (!valid(bytes)) {
    bytes = await fetchAssetBytes(name, asset)
    if (!valid(bytes)) throw Error(`Pinned ${name} SHA-256 mismatch`)
    await writeFile(file, bytes)
  }
  if(name==='inno'){
    const directory=path.join(folder,'inno')
    try{await stat(path.join(directory,'ISCC.exe'))}catch{
      execFileSync(file,['/VERYSILENT','/SUPPRESSMSGBOXES','/SP-','/NORESTART','/CURRENTUSER',`/DIR=${directory}`],{windowsHide:true,stdio:'inherit'})
    }
  }
}
console.log('Pinned Inno Setup compiler and driver installer are ready.')
