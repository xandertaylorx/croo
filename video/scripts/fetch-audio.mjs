// Downloads the launch video's music and sound effects from Mixkit (free licence, no attribution needed:
// https://mixkit.co/license/) and prepares them with ffmpeg: soft filtering, edge fades and peak
// normalisation, so every file in public/audio/ sits at a known level and the volumes in
// src/launch/config.ts mean the same thing for each clip. Clicks and pops get 100ms of silence at each
// end so the clip fades in Remotion run over silence and never soften the transient. Run with `npm run audio:fetch`.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio')
mkdirSync(OUT, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'croo-audio-'))

const SOURCES = [
  // "Serene View" by Arulo: warm chillout, soft pad intro then a gentle beat at 16.3s.
  { out: 'music.mp3', url: 'https://assets.mixkit.co/music/443/443.mp3', filter: 'highpass=f=30', lufs: -20 },
  // "Air woosh": a noise swell with no tonal content, darkened so it sits under the music.
  { out: 'whoosh.wav', url: 'https://assets.mixkit.co/active_storage/sfx/1489/1489-preview.mp3', filter: 'highpass=f=120,lowpass=f=3200,lowpass=f=3200,atrim=0:1.7,afade=t=in:d=0.02,afade=t=out:st=1.2:d=0.5', peak: -1 },
  // "Classic click": one short mouse click, top end rolled off.
  { out: 'click.wav', url: 'https://assets.mixkit.co/active_storage/sfx/1117/1117-preview.mp3', filter: 'highpass=f=250,lowpass=f=3800,lowpass=f=3800,atrim=0:0.22,afade=t=in:d=0.003,afade=t=out:st=0.12:d=0.1,adelay=100:all=1,apad=pad_dur=0.1', peak: -1 },
  // "Light pop": a soft, round pop for a single reveal.
  { out: 'pop.wav', url: 'https://assets.mixkit.co/active_storage/sfx/3005/3005-preview.mp3', filter: 'highpass=f=150,lowpass=f=2600,lowpass=f=2600,atrim=0:0.18,afade=t=in:d=0.003,afade=t=out:st=0.1:d=0.08,adelay=100:all=1,apad=pad_dur=0.1', peak: -1 },
]

// ffmpeg reports on stderr, so run it with spawnSync and hand that back.
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
  return r.stderr
}

for (const s of SOURCES) {
  const src = join(tmp, `${s.out}.src.mp3`)
  execFileSync('curl', ['-sfL', '-o', src, s.url])
  const shaped = join(tmp, `${s.out}.wav`)
  ff(['-i', src, '-af', `${s.filter},aresample=48000`, '-ac', '2', shaped])
  const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(ff(['-i', shaped, '-af', 'volumedetect', '-f', 'null', '-']))[1])
  // The music is set by loudness (it's mastered hot, so peak-normalising would leave it far louder than
  // the effects); effects are set by peak.
  const lufs = s.lufs && Number(/I:\s+(-?[\d.]+) LUFS/.exec(ff(['-i', shaped, '-af', 'ebur128', '-f', 'null', '-']).split('Summary:')[1])[1])
  const gain = (s.lufs ? s.lufs - lufs : s.peak - peak).toFixed(2)
  const codec = s.out.endsWith('.mp3') ? ['-c:a', 'libmp3lame', '-b:a', '256k'] : ['-c:a', 'pcm_s16le']
  ff(['-i', shaped, '-af', `volume=${gain}dB`, ...codec, join(OUT, s.out)])
  console.log(`${s.out.padEnd(11)} ${s.lufs ? `${lufs} LUFS → ${s.lufs} LUFS` : `peak ${peak} dB → ${s.peak} dB`} (${gain} dB)`)
}

rmSync(tmp, { recursive: true, force: true })
