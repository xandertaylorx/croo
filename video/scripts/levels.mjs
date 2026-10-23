// Masters and measures a rendered video's audio. With an output path, it applies one linear gain (no
// limiter, no compression) that brings the mix to TARGET loudness unless that would push the true
// peak above CEILING, copies the video stream untouched, then measures the result: integrated
// loudness, loudness range, true and sample peak, and short-term loudness every second. Fails if the
// result gets near clipping. Usage: node scripts/levels.mjs <in.mp4> [out.mp4]
import { spawnSync } from 'node:child_process'

const TARGET = -16
const CEILING = -1.5

const [input, output] = process.argv.slice(2)
if (!input) throw new Error('usage: node scripts/levels.mjs <in.mp4> [out.mp4]')
const run = (file, af) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', af, '-f', 'null', '-'], { encoding: 'utf8' })

function measure(file) {
  const sum = run(file, 'ebur128=peak=true+sample').stderr.split('Summary:')[1] ?? ''
  const num = (re) => Number(re.exec(sum)?.[1])
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/), SP: num(/Sample peak:\s+Peak:\s+(-?[\d.]+) dBFS/) }
}

let file = input
if (output) {
  const m = measure(input)
  const gain = Math.min(TARGET - m.I, CEILING - m.TP)
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-c:v', 'copy', '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', output], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
  console.log(`mix ${m.I} LUFS, true peak ${m.TP} dBTP → master gain ${gain >= 0 ? '+' : ''}${gain.toFixed(2)} dB`)
  file = output
}

const { I, LRA, TP, SP } = measure(file)

const short = run(file, 'ebur128=metadata=1,ametadata=mode=print:key=lavfi.r128.S:file=-').stdout
const s = [...short.matchAll(/lavfi\.r128\.S=(-?[\d.inf]+)/g)].map((m) => Number(m[1]))
const perSecond = s.filter((_, i) => i % 10 === 9).map((v) => (Number.isFinite(v) && v > -70 ? v.toFixed(0) : '-∞'))

console.log(`integrated ${I} LUFS · range ${LRA} LU · true peak ${TP} dBTP · sample peak ${SP} dBFS`)
console.log(`short-term loudness per second: ${perSecond.join(' ')}`)
if (!(TP < -1)) {
  console.error('true peak is above -1 dBTP: lower the volumes in src/launch/config.ts or CEILING here')
  process.exit(1)
}
