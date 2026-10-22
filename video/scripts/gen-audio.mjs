// Synthesises the music bed and every sound effect for the showcase as plain WAV files, so the video
// needs no downloaded audio. Run with `npm run audio` (render does it for you).
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sfx')
mkdirSync(OUT, { recursive: true })

// Seeded noise so every render sounds the same.
let seed = 1234567
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1
const TAU = Math.PI * 2
const midi = (n) => 440 * 2 ** ((n - 69) / 12)

function writeWav(name, L, R = L) {
  const n = L.length
  const buf = Buffer.alloc(44 + n * 4)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 4, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 4, 28)
  buf.writeUInt16LE(4, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 4, 40)
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  const g = peak > 0.98 ? 0.98 / peak : 1
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4)
  }
  writeFileSync(join(OUT, name), buf)
}

const buffer = (sec) => new Float32Array(Math.ceil(sec * SR))
const lowpass = (x, hz) => {
  const a = 1 - Math.exp((-TAU * hz) / SR)
  let y = 0
  return x.map((v) => (y += a * (v - y)))
}
const highpass = (x, hz) => {
  const lp = lowpass(x, hz)
  return x.map((v, i) => v - lp[i])
}

// ---------- effects ----------

function key(variant) {
  const x = buffer(0.06)
  const tone = 1800 + variant * 260
  for (let i = 0; i < x.length; i++) {
    const t = i / SR
    x[i] = noise() * Math.exp(-t * 260) * 0.7 + Math.sin(TAU * tone * t) * Math.exp(-t * 400) * 0.25 + Math.sin(TAU * 140 * t) * Math.exp(-t * 90) * 0.35
  }
  return highpass(lowpass(x, 6000), 300)
}
;[0, 1, 2, 3].forEach((v) => writeWav(`key${v}.wav`, key(v)))

{
  // Mouse click: two tiny ticks.
  const x = buffer(0.08)
  for (const [at, amp] of [[0, 1], [0.028, 0.6]])
    for (let i = 0; i < 0.015 * SR; i++) {
      const t = i / SR
      x[Math.floor(at * SR) + i] += (noise() * 0.6 + Math.sin(TAU * 3200 * t)) * Math.exp(-t * 700) * amp
    }
  writeWav('click.wav', highpass(x, 800))
}

{
  // Soft pop for cards appearing.
  const x = buffer(0.14)
  let ph = 0
  for (let i = 0; i < x.length; i++) {
    const t = i / SR
    ph += (TAU * (520 + 700 * Math.exp(-t * 45))) / SR
    x[i] = Math.sin(ph) * Math.exp(-t * 38) * (1 - Math.exp(-t * 2000))
  }
  writeWav('pop.wav', x)
}

function whoosh(sec, peakAt, hiHz) {
  const x = buffer(sec)
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < x.length; i++) {
    const t = i / sec / SR
    const env = t < peakAt ? (t / peakAt) ** 2 : ((1 - t) / (1 - peakAt)) ** 2
    const cutoff = 200 + hiHz * Math.sin(Math.PI * Math.min(1, t * 1.1))
    const a = 1 - Math.exp((-TAU * cutoff) / SR)
    y1 += a * (noise() - y1)
    y2 += a * (y1 - y2)
    x[i] = y2 * env * 3
  }
  const L = x
  const R = x.map((_, i) => x[Math.max(0, i - 220)])
  return [L, R]
}
writeWav('whoosh.wav', ...whoosh(0.6, 0.55, 2600))
writeWav('swoosh-long.wav', ...whoosh(1.1, 0.7, 1800))

function bell(notes, gap, decay) {
  const x = buffer(gap * notes.length + decay * 1.2)
  notes.forEach((n, k) => {
    const f = midi(n)
    const off = Math.floor(k * gap * SR)
    for (let i = 0; off + i < x.length; i++) {
      const t = i / SR
      const e = Math.exp(-t / decay) * (1 - Math.exp(-t * 900))
      x[off + i] += (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2.01 * t) * Math.exp(-t * 6) + 0.15 * Math.sin(TAU * f * 3.98 * t) * Math.exp(-t * 12)) * e * 0.5
    }
  })
  return x
}
writeWav('chime.wav', bell([84, 91], 0.09, 0.5))
writeWav('success.wav', bell([79, 84, 88], 0.08, 0.6))
writeWav('tick.wav', bell([96], 0, 0.05))

{
  // A small two-part ribbit.
  const x = buffer(0.42)
  for (const [at, f0] of [[0, 210], [0.19, 175]]) {
    const off = Math.floor(at * SR)
    let ph = 0
    for (let i = 0; i < 0.15 * SR; i++) {
      const t = i / SR
      ph += (TAU * f0 * (1 - t * 0.6)) / SR
      const body = Math.sign(Math.sin(ph)) * 0.5 + Math.sin(ph * 2) * 0.3
      const am = 0.6 + 0.4 * Math.sin(TAU * 38 * t)
      x[off + i] += body * am * Math.sin((Math.PI * t) / 0.15) * 0.6
    }
  }
  writeWav('ribbit.wav', lowpass(lowpass(x, 1400), 2200))
}

// ---------- music ----------
// Calm, warm bed: soft pad, a sub, a quiet plucked arpeggio and a faint shaker, with a cheap reverb.

{
  const SEC = 30.5
  const BPM = 96
  const beat = 60 / BPM
  const bar = beat * 4
  const L = buffer(SEC)
  const R = buffer(SEC)
  // Fmaj7, Em7, Dm9, Cmaj9 — then resolve on Fmaj9 for the end card.
  const chords = [
    [53, 57, 60, 64],
    [52, 55, 59, 62],
    [50, 57, 60, 64],
    [48, 55, 59, 62],
  ]
  const nBars = Math.ceil(SEC / bar)
  for (let b = 0; b < nBars; b++) {
    const chord = b >= nBars - 2 ? [53, 57, 60, 64, 67] : chords[b % 4]
    const start = b * bar
    const len = b >= nBars - 2 ? SEC - start : bar
    // pad
    for (const n of chord) {
      const f = midi(n + 12)
      for (let i = 0; i < len * SR + 0.6 * SR; i++) {
        const idx = Math.floor(start * SR) + i
        if (idx >= L.length) break
        const t = i / SR
        const env = Math.min(1, t / 0.5) * (t > len ? Math.max(0, 1 - (t - len) / 0.6) : 1)
        const v = (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * f * 2 * t) + 0.5 * Math.sin(TAU * f * 1.003 * t + 1)) * env * 0.045
        L[idx] += v
        R[idx] += v * 0.9 + Math.sin(TAU * f * 0.997 * t) * env * 0.02
      }
    }
    // sub bass
    const fb = midi(chord[0] - 12)
    for (let i = 0; i < len * SR; i++) {
      const idx = Math.floor(start * SR) + i
      if (idx >= L.length) break
      const t = i / SR
      const env = Math.min(1, t / 0.08) * Math.exp(-t * 0.6)
      const v = Math.sin(TAU * fb * t) * env * 0.12
      L[idx] += v
      R[idx] += v
    }
    // pluck arpeggio, eighth notes
    if (b === 0 || b >= nBars - 1) continue
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2]
    for (let s = 0; s < 8; s++) {
      const n = chord[pattern[s] % chord.length] + 24
      const f = midi(n)
      const off = Math.floor((start + (s * beat) / 2) * SR)
      const pan = s % 2 ? 0.35 : 0.65
      const vel = s === 0 ? 1 : 0.7
      for (let i = 0; i < 0.6 * SR && off + i < L.length; i++) {
        const t = i / SR
        const env = Math.exp(-t * 7) * (1 - Math.exp(-t * 800)) * vel
        const v = (Math.sin(TAU * f * t) + 0.2 * Math.sin(TAU * f * 3 * t) * Math.exp(-t * 20)) * env * 0.05
        L[off + i] += v * (1 - pan)
        R[off + i] += v * pan
      }
    }
    // shaker
    for (let s = 0; s < 8; s++) {
      const off = Math.floor((start + (s * beat) / 2 + beat / 4) * SR)
      for (let i = 0; i < 0.05 * SR && off + i < L.length; i++) {
        const t = i / SR
        const v = noise() * Math.exp(-t * 90) * 0.012 * (s % 2 ? 1 : 0.6)
        L[off + i] += v
        R[off + i] += v
      }
    }
  }
  const hpL = highpass(L, 30)
  const hpR = highpass(R, 30)
  // reverb: a few feedback delays per channel
  const verb = (x, taps) => {
    const y = Float32Array.from(x)
    for (const [ms, fb] of taps) {
      const d = Math.floor((ms / 1000) * SR)
      const line = new Float32Array(x.length)
      for (let i = d; i < x.length; i++) line[i] = x[i - d] + line[i - d] * fb
      const soft = lowpass(line, 3000)
      for (let i = 0; i < x.length; i++) y[i] += soft[i] * 0.18
    }
    return y
  }
  const outL = verb(hpL, [[113, 0.6], [167, 0.55], [229, 0.5]])
  const outR = verb(hpR, [[127, 0.6], [181, 0.55], [241, 0.5]])
  for (let i = 0; i < outL.length; i++) {
    const t = i / SR
    const fade = Math.min(1, t / 1.2) * Math.min(1, (SEC - t) / 2.5)
    outL[i] *= fade
    outR[i] *= fade
  }
  writeWav('music.wav', outL, outR)
}

console.log('audio written to', OUT)
