import { spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { dataDir } from '../config.js'
import { LOCAL_MODELS, localModel, type LocalModel } from '../localmodels.js'

export const modelsDir = () => path.join(dataDir(), 'models')
export const modelFile = (m: LocalModel) => path.join(modelsDir(), m.file)

export interface Download {
  received: number
  error?: string
  abort: AbortController
}

const downloads = new Map<string, Download>()
let changed: () => void = () => {}
let engineDir = ''

export function initLocal(dir: string, onChange: () => void) {
  engineDir = dir
  changed = onChange
}

const engineBin = () => path.join(engineDir, 'llama-server')
export const engineInstalled = () => fs.existsSync(engineBin())

export function isReady(m: LocalModel): boolean {
  try {
    return fs.statSync(modelFile(m)).size === m.bytes
  } catch {
    return false
  }
}

export const downloadState = (id: string) => downloads.get(id)

async function sha256(file: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** Download with resume (a .part file is kept if you cancel or lose the connection), then verify the checksum. */
export async function startDownload(id: string, onDone: (m: LocalModel) => void): Promise<void> {
  const m = localModel(id)
  if (!m || downloads.has(id) || isReady(m)) return
  fs.mkdirSync(modelsDir(), { recursive: true })
  const part = modelFile(m) + '.part'
  const have = fs.existsSync(part) ? fs.statSync(part).size : 0
  const dl: Download = { received: Math.min(have, m.bytes), abort: new AbortController() }
  downloads.set(id, dl)
  changed()
  let tick = 0
  try {
    const res = await fetch(m.url, { headers: dl.received ? { range: `bytes=${dl.received}-`, 'user-agent': 'croo-app' } : { 'user-agent': 'croo-app' }, signal: dl.abort.signal, redirect: 'follow' })
    if (!res.ok || !res.body) throw new Error(`The download server answered ${res.status}.`)
    if (dl.received && res.status !== 206) dl.received = 0 // server ignored the range: start over
    const out = fs.createWriteStream(part, { flags: dl.received ? 'a' : 'w' })
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      dl.received += value.length
      if (Date.now() - tick > 300) (tick = Date.now(), changed())
    }
    await new Promise<void>((r, j) => (out.end(), out.on('finish', r), out.on('error', j)))
    if (fs.statSync(part).size !== m.bytes || (await sha256(part)) !== m.sha256) {
      fs.rmSync(part, { force: true })
      throw new Error('The download was corrupted. Try again.')
    }
    fs.renameSync(part, modelFile(m))
    downloads.delete(id)
    changed()
    onDone(m)
  } catch (e: any) {
    if (dl.abort.signal.aborted) downloads.delete(id)
    else dl.error = e?.message?.includes('fetch failed') ? "Couldn't reach the download server." : String(e?.message ?? e)
    changed()
    if (dl.error) setTimeout(() => (downloads.get(id) === dl && downloads.delete(id), changed()), 8000)
  }
}

export function cancelDownload(id: string) {
  downloads.get(id)?.abort.abort()
}

export function deleteModel(id: string) {
  const m = localModel(id)
  if (!m) return
  cancelDownload(id)
  if (engine?.id === id) stopEngine()
  for (const f of [modelFile(m), modelFile(m) + '.part']) fs.rmSync(f, { force: true })
  changed()
}

// ---- the engine: llama-server on a private localhost port, started when needed ----

let engine: { id: string; proc: ChildProcess; baseUrl: string } | null = null
let starting: Promise<string> | null = null
let lastUsed = 0
let idleTimer: NodeJS.Timeout | undefined

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo
      s.close(() => resolve(port))
    })
  })

/** Start (or reuse) the engine for this model and return its OpenAI-compatible base URL. */
export function ensureEngine(id: string, busy: () => boolean): Promise<string> {
  lastUsed = Date.now()
  if (engine?.id === id && engine.proc.exitCode === null) return Promise.resolve(engine.baseUrl)
  if (starting) return starting
  const m = localModel(id)
  if (!m || !isReady(m)) return Promise.reject(new Error('The local model is not downloaded. Open Settings → Providers.'))
  if (!engineInstalled()) return Promise.reject(new Error('The local engine is missing from this build. Run `npm run engine` in the project, or reinstall Croo.'))
  stopEngine()
  starting = (async () => {
    const port = await freePort()
    const proc = spawn(engineBin(), ['-m', modelFile(m), '--host', '127.0.0.1', '--port', String(port), '-c', '16384', '-ngl', '99', '--jinja', '--no-webui', '--alias', m.name], { stdio: ['ignore', 'ignore', 'pipe'], cwd: engineDir })
    let log = ''
    proc.stderr?.on('data', (d) => (log = (log + d).slice(-2000)))
    let dead = false
    proc.on('exit', () => (dead = true, engine?.proc === proc && (engine = null)))
    const baseUrl = `http://127.0.0.1:${port}/v1`
    for (let i = 0; i < 240; i++) {
      if (dead) throw new Error(`The local engine stopped: ${log.trim().split('\n').slice(-2).join(' ') || 'unknown error'}`)
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) })
        if (r.ok) break
      } catch {}
      await new Promise((r) => setTimeout(r, 500))
      if (i === 239) (proc.kill(), (dead = true), (log = 'timed out loading the model'))
    }
    if (dead) throw new Error(`The local engine did not start: ${log.trim().split('\n').slice(-2).join(' ')}`)
    engine = { id, proc, baseUrl }
    idleTimer ??= setInterval(() => {
      if (engine && !busy() && Date.now() - lastUsed > 10 * 60_000) stopEngine()
    }, 60_000)
    return baseUrl
  })().finally(() => (starting = null))
  return starting
}

export function stopEngine() {
  engine?.proc.kill()
  engine = null
}

export function touchEngine() {
  lastUsed = Date.now()
}

export const catalog = () => LOCAL_MODELS
