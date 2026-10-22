import { h, icon } from './dom.js'
import { croo, store } from './store.js'

export interface Recording {
  /** Stop and return a 16 kHz mono WAV, or null if there was nothing to hear. */
  finish(): Promise<ArrayBuffer | null>
  cancel(): void
}

const RATE = 16000

/** 16-bit PCM WAV, which is what whisper wants. */
function wav(samples: Float32Array): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return buf
}

async function toWav(blob: Blob): Promise<ArrayBuffer | null> {
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    if (decoded.duration < 0.4) return null
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE)
    const src = off.createBufferSource()
    src.buffer = decoded
    src.connect(off.destination)
    src.start()
    return wav((await off.startRendering()).getChannelData(0))
  } finally {
    void ctx.close()
  }
}

/** Record the microphone and draw a scrolling waveform of how loud you are into the canvas. */
export async function startRecording(canvas: HTMLCanvasElement, onTime: (seconds: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  ctx.createMediaStreamSource(stream).connect(analyser)
  const rec = new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  rec.start(250)

  const g = canvas.getContext('2d')!
  const data = new Uint8Array(analyser.fftSize)
  const levels: number[] = []
  const t0 = performance.now()
  let last = 0
  let raf = 0
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw)
    if (now - last > 55) {
      last = now
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const x of data) sum += ((x - 128) / 128) ** 2
      levels.push(Math.min(1, Math.sqrt(sum / data.length) * 4.5))
      onTime((now - t0) / 1000)
    }
    const dpr = devicePixelRatio || 1
    const w = canvas.clientWidth
    const hh = canvas.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== hh * dpr) (canvas.width = w * dpr), (canvas.height = hh * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, hh)
    g.fillStyle = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#7bd88f'
    const step = 5
    const n = Math.floor(w / step)
    for (let i = 0; i < n; i++) {
      const lv = levels[levels.length - n + i] ?? 0
      const bar = Math.max(3, lv * (hh - 6))
      g.globalAlpha = 0.35 + 0.65 * (i / n)
      g.beginPath()
      g.roundRect(i * step, (hh - bar) / 2, 3, bar, 1.5)
      g.fill()
    }
  }
  raf = requestAnimationFrame(draw)

  const release = () => {
    cancelAnimationFrame(raf)
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }
  return {
    cancel() {
      rec.onstop = null
      if (rec.state !== 'inactive') rec.stop()
      release()
    },
    finish: () =>
      new Promise((resolve) => {
        rec.onstop = async () => {
          release()
          try {
            resolve(await toWav(new Blob(chunks, { type: rec.mimeType })))
          } catch {
            resolve(null)
          }
        }
        if (rec.state !== 'inactive') rec.stop()
        else rec.onstop?.(new Event('stop'))
      }),
  }
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** The mic button and the recording bar that replaces the message box while you speak. */
export function voiceControls(input: HTMLTextAreaElement, say: (text: string) => void) {
  let rec: Recording | null = null
  const canvas = h('canvas', { class: 'wave', 'aria-hidden': 'true' })
  const time = h('span', { class: 'voice-time' }, '0:00')
  const state = h('span', { class: 'voice-state' })
  const bar = h(
    'div',
    { class: 'voice-bar', hidden: true },
    h('button', { class: 'icon-btn no-drag', type: 'button', title: 'Cancel', onClick: () => cancel() }, icon('x', 16)),
    canvas,
    time,
    state,
    h('button', { class: 'voice-done no-drag', type: 'button', title: 'Done (↵)', onClick: () => void finish() }, icon('check', 17)),
  )
  const mic = h('button', { class: 'mic no-drag', type: 'button', title: 'Speak', onClick: () => void toggle() }, icon('mic', 17))

  const composer = () => bar.parentElement as HTMLElement
  const set = (on: boolean) => {
    bar.hidden = !on
    composer().classList.toggle('recording', on)
  }
  const cancel = () => {
    rec?.cancel()
    rec = null
    set(false)
  }
  const finish = async () => {
    if (!rec) return
    const r = rec
    rec = null
    state.textContent = 'Transcribing…'
    bar.classList.add('busy')
    const audio = await r.finish()
    let text = ''
    if (audio) {
      const res = await croo.transcribe(audio)
      if (res.ok) text = res.text
      else say(res.error)
    } else say('Nothing to hear. Try again.')
    bar.classList.remove('busy')
    state.textContent = ''
    set(false)
    if (text) {
      input.value = input.value ? `${input.value.replace(/\s*$/, ' ')}${text}` : text
      input.dispatchEvent(new Event('input'))
    } else if (audio) say('Did not catch anything. Try again.')
    input.focus()
  }
  const toggle = async () => {
    if (rec) return void finish()
    const v = store.state.voice
    if (!v.engine) return say('Voice input is not part of this build.')
    if (v.status === 'none') {
      void croo.downloadVoice()
      return say(`Getting the voice model (${Math.round(v.bytes / 1e6)} MB). Click the mic again when it is ready.`)
    }
    if (v.status === 'downloading') return
    if (!(await croo.micAccess())) return say('Allow the microphone for Croo in System Settings → Privacy & Security → Microphone.')
    try {
      set(true)
      time.textContent = '0:00'
      void croo.warmVoice()
      rec = await startRecording(canvas, (s) => (time.textContent = clock(s)))
    } catch {
      set(false)
      say("Couldn't open the microphone.")
    }
  }

  bar.addEventListener('keydown', () => {})
  document.addEventListener('keydown', (e) => {
    if (!rec) return
    if (e.key === 'Escape') (e.preventDefault(), cancel())
    else if (e.key === 'Enter') (e.preventDefault(), void finish())
  })

  /** Reflect the voice model's download progress on the button. */
  const refresh = () => {
    const v = store.state.voice
    mic.disabled = v.status === 'downloading'
    mic.classList.toggle('busy', v.status === 'downloading')
    mic.dataset.tip = v.status === 'downloading' ? `Getting the voice model… ${Math.round(v.progress * 100)}%` : 'Speak'
  }
  refresh()
  return { mic, bar, refresh }
}
