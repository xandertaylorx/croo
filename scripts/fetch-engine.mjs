// Fetches llama.cpp's llama-server (Apple Silicon build) into vendor/llama. The app bundles it as its local engine.
// Pinned so builds are reproducible; bump LLAMA_TAG to update.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LLAMA_TAG = 'b11827'
const out = 'vendor/llama'
const stamp = path.join(out, '.tag')

if (fs.existsSync(path.join(out, 'llama-server')) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === LLAMA_TAG) {
  console.log(`engine ${LLAMA_TAG} already in ${out}`)
  process.exit(0)
}
if (process.platform !== 'darwin') {
  console.log('Skipping the local engine: only the macOS build is bundled.')
  process.exit(0)
}

const url = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/llama-${LLAMA_TAG}-bin-macos-arm64.tar.gz`
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-engine-'))
console.log(`fetching ${url}`)
const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) throw new Error(`download failed: ${res.status}`)
fs.writeFileSync(path.join(tmp, 'l.tgz'), Buffer.from(await res.arrayBuffer()))
execFileSync('tar', ['xzf', path.join(tmp, 'l.tgz'), '-C', tmp])
const src = path.join(tmp, `llama-${LLAMA_TAG}`)

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
for (const f of fs.readdirSync(src)) {
  if (f === 'llama-server' || f === 'LICENSE' || f.endsWith('.dylib')) fs.cpSync(path.join(src, f), path.join(out, f), { verbatimSymlinks: true })
}
fs.writeFileSync(stamp, LLAMA_TAG)
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`engine ready in ${out}`)
