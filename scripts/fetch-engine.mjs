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
} else if (process.platform !== 'darwin') {
  console.log('Skipping the local engine: only the macOS build is bundled.')
} else await fetchLlama()

async function fetchLlama() {
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
}

// ---- whisper.cpp: the speech-to-text engine behind voice input (built from source, one static binary) ----
const WHISPER_TAG = 'v1.9.5'
const WHISPER_STAMP = `${WHISPER_TAG}+server`
const wout = 'vendor/whisper'
const wstamp = path.join(wout, '.tag')
if (fs.existsSync(path.join(wout, 'whisper-server')) && fs.existsSync(wstamp) && fs.readFileSync(wstamp, 'utf8') === WHISPER_STAMP) {
  console.log(`whisper ${WHISPER_TAG} already in ${wout}`)
} else {
  try {
    execFileSync('cmake', ['--version'], { stdio: 'ignore' })
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-whisper-'))
    const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' })
    sh('git', ['clone', '--depth', '1', '--branch', WHISPER_TAG, 'https://github.com/ggml-org/whisper.cpp', work])
    sh('cmake', ['-B', 'build', '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DGGML_METAL=ON', '-DGGML_METAL_EMBED_LIBRARY=ON', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_SERVER=ON'], work)
    sh('cmake', ['--build', 'build', '-j', '--config', 'Release', '--target', 'whisper-cli', 'whisper-server'], work)
    fs.rmSync(wout, { recursive: true, force: true })
    fs.mkdirSync(wout, { recursive: true })
    for (const b of ['whisper-cli', 'whisper-server']) fs.copyFileSync(path.join(work, 'build', 'bin', b), path.join(wout, b))
    fs.writeFileSync(wstamp, WHISPER_STAMP)
    fs.rmSync(work, { recursive: true, force: true })
    console.log(`whisper ready in ${wout}`)
  } catch (e) {
    console.log(`Skipping voice input (could not build whisper.cpp: ${e.message}). Install cmake and run npm run engine.`)
  }
}

// ---- ripgrep: fast search for the grep and list_files tools (they fall back to a slower walk without it) ----
const RG_VERSION = '14.1.1'
const rgout = 'vendor/rg'
const rgstamp = path.join(rgout, '.tag')
if (fs.existsSync(path.join(rgout, 'rg')) && fs.existsSync(rgstamp) && fs.readFileSync(rgstamp, 'utf8') === RG_VERSION) {
  console.log(`ripgrep ${RG_VERSION} already in ${rgout}`)
} else if (process.platform !== 'darwin') {
  console.log('Skipping ripgrep: only the macOS build is bundled.')
} else {
  try {
    const name = `ripgrep-${RG_VERSION}-aarch64-apple-darwin`
    const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/${name}.tar.gz`
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-rg-'))
    console.log(`fetching ${url}`)
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) throw new Error(`download failed: ${res.status}`)
    fs.writeFileSync(path.join(tmp, 'rg.tgz'), Buffer.from(await res.arrayBuffer()))
    execFileSync('tar', ['xzf', path.join(tmp, 'rg.tgz'), '-C', tmp])
    fs.rmSync(rgout, { recursive: true, force: true })
    fs.mkdirSync(rgout, { recursive: true })
    for (const f of ['rg', 'LICENSE-MIT', 'UNLICENSE']) fs.copyFileSync(path.join(tmp, name, f), path.join(rgout, f))
    fs.chmodSync(path.join(rgout, 'rg'), 0o755)
    fs.writeFileSync(rgstamp, RG_VERSION)
    fs.rmSync(tmp, { recursive: true, force: true })
    console.log(`ripgrep ready in ${rgout}`)
  } catch (e) {
    console.log(`Skipping ripgrep (${e.message}). Search will use the built-in walker.`)
  }
}
