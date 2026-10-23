// Renders a few frames of the Launch composition to out/stills/ and tiles them into out/stills/sheet.png,
// for checking layout without a full render. Usage: node scripts/stills.mjs [frame ...]
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'out', 'stills')
mkdirSync(out, { recursive: true })
const frames = process.argv.slice(2).map(Number)
const list = frames.length ? frames : [70, 132, 222, 296, 402, 474, 586, 666, 778, 858, 960]

const serveUrl = await bundle({ entryPoint: join(root, 'src', 'index.ts') })
const composition = await selectComposition({ serveUrl, id: 'Launch' })
const files = []
for (const frame of list) {
  const output = join(out, `f${String(frame).padStart(4, '0')}.png`)
  await renderStill({ serveUrl, composition, frame, output, scale: 0.5 })
  files.push(output)
  console.log(output)
}
const cols = Math.min(3, files.length)
const rows = Math.ceil(files.length / cols)
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-pattern_type', 'glob', '-i', join(out, 'f*.png'), '-vf', `tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', join(out, 'sheet.png')])
console.log(join(out, 'sheet.png'))
