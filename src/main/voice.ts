import { execFile, spawn, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { VOICE_MODEL } from '../localmodels.js'
import { isReady, modelFile } from './local.js'

let whisperDir = ''
export const initVoice = (dir: string) => void (whisperDir = dir)

const bin = () => path.join(whisperDir, 'whisper-cli')
export const voiceEngineInstalled = () => fs.existsSync(bin())
export const voiceReady = () => voiceEngineInstalled() && isReady(VOICE_MODEL)

// A whisper server stays running with the model loaded, so a clip takes a fraction of a second instead of
// paying for model and GPU start-up every time. It starts when you begin speaking and stops after idle.
let server: { proc: ChildProcess; port: number } | null = null
let starting: Promise<number> | null = null
let idle: NodeJS.Timeout | undefined

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo
      s.close(() => resolve(port))
    })
  })

function ensureServer(): Promise<number> {
  if (server && server.proc.exitCode === null) return Promise.resolve(server.port)
  if (starting) return starting
  starting = (async () => {
    const exe = path.join(whisperDir, 'whisper-server')
    if (!fs.existsSync(exe)) throw new Error('no server')
    const port = await freePort()
    const proc = spawn(exe, ['-m', modelFile(VOICE_MODEL), '--host', '127.0.0.1', '--port', String(port), '-l', 'auto', '-t', '4'], { stdio: 'ignore' })
    let dead = false
    proc.on('exit', () => ((dead = true), server?.proc === proc && (server = null)))
    for (let i = 0; i < 100; i++) {
      if (dead) throw new Error('whisper server stopped')
      try {
        await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(800) })
        server = { proc, port }
        return port
      } catch {
        await new Promise((r) => setTimeout(r, 150))
      }
    }
    proc.kill()
    throw new Error('whisper server did not start')
  })().finally(() => (starting = null))
  return starting
}

const touch = () => {
  clearTimeout(idle)
  idle = setTimeout(stopVoice, 10 * 60_000)
}

export function stopVoice() {
  clearTimeout(idle)
  server?.proc.kill()
  server = null
}

/** Start the server (and push a half-second of silence through it to warm the GPU) while the user is still talking. */
export async function warmVoice() {
  if (!voiceReady()) return
  try {
    const port = await ensureServer()
    touch()
    const fd = new FormData()
    fd.append('file', new Blob([new Uint8Array(silence())], { type: 'audio/wav' }), 'warm.wav')
    fd.append('response_format', 'json')
    await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: fd, signal: AbortSignal.timeout(20_000) })
  } catch {}
}

function silence(): Buffer {
  const n = 8000
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + n * 2, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(16000, 24)
  b.writeUInt32LE(32000, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(n * 2, 40)
  return b
}

const clean = (raw: string) => raw.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

async function viaServer(wav: Buffer): Promise<string> {
  const port = await ensureServer()
  touch()
  const fd = new FormData()
  fd.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'clip.wav')
  fd.append('response_format', 'json')
  fd.append('temperature', '0.0')
  const res = await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: fd, signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(String(res.status))
  return clean(String(((await res.json()) as { text?: string }).text ?? ''))
}

/** Speech to text for a 16 kHz mono WAV, on this Mac. */
export async function transcribe(wav: Buffer): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (voiceReady()) {
    try {
      return { ok: true, text: await viaServer(wav) }
    } catch {
      stopVoice() // fall through to the one-shot command
    }
  }
  return transcribeOnce(wav)
}

function transcribeOnce(wav: Buffer): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!voiceEngineInstalled()) return Promise.resolve({ ok: false, error: 'Voice input is not part of this build.' })
  if (!isReady(VOICE_MODEL)) return Promise.resolve({ ok: false, error: 'The voice model is not downloaded yet.' })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-voice-'))
  const file = path.join(dir, 'clip.wav')
  fs.writeFileSync(file, wav)
  return new Promise((resolve) => {
    execFile(bin(), ['-m', modelFile(VOICE_MODEL), '-f', file, '-nt', '-np', '-l', 'auto', '-t', '4'], { timeout: 90_000, maxBuffer: 4_000_000 }, (err, stdout) => {
      fs.rmSync(dir, { recursive: true, force: true })
      if (err) return resolve({ ok: false, error: "Couldn't turn that into text." })
      // Whisper marks silence and noise like [BLANK_AUDIO] or (music): not speech.
      resolve({ ok: true, text: clean(stdout) })
    })
  })
}
