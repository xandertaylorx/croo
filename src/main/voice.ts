import { execFile } from 'node:child_process'
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

/** Speech to text for a 16 kHz mono WAV, on this Mac. */
export function transcribe(wav: Buffer): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
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
      const text = stdout.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
      resolve({ ok: true, text })
    })
  })
}
