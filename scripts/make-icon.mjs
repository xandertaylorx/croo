// Draws the app icon (build/icon.png) from the frog's pixel grid. No dependencies.
//   node scripts/make-icon.mjs
import fs from 'node:fs'
import zlib from 'node:zlib'

const SIZE = 1024
// Same art as the in-app frog (src/renderer/frog.ts): a solid block with cut-out eyes and smile.
const FROG = [
  '.GGGGG...GGGGG.',
  '.GG.GG...GG.GG.',
  'GGG.GGGGGGG.GGG',
  'GGGGGGGGGGGGGGG',
  'GGGG.GGGGG.GGGG',
  'GGGGG.....GGGGG',
  '.GGGGGGGGGGGGG.',
  '..GG.......GG..',
]
const COLORS = { G: [94, 214, 126] }

const margin = 0.1 // macOS icons leave breathing room around the squircle
const body = SIZE * (1 - 2 * margin)
const radius = body * 0.225
const px = (body * 0.78) / FROG[0].length
const fx = (SIZE - px * FROG[0].length) / 2
const fy = (SIZE - px * FROG.length) / 2 + px * 0.2

/** Signed distance to the rounded square, for smooth edges. */
function sdf(x, y) {
  const half = body / 2 - radius
  const dx = Math.max(Math.abs(x - SIZE / 2) - half, 0)
  const dy = Math.max(Math.abs(y - SIZE / 2) - half, 0)
  return Math.hypot(dx, dy) - radius
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  for (let x = 0; x < SIZE; x++) {
    const o = y * (SIZE * 4 + 1) + 1 + x * 4
    const cover = Math.min(Math.max(0.5 - sdf(x + 0.5, y + 0.5), 0), 1)
    const t = y / SIZE
    let rgb = [Math.round(30 - 12 * t), Math.round(52 - 18 * t), Math.round(38 - 14 * t)]
    const gx = Math.floor((x - fx) / px)
    const gy = Math.floor((y - fy) / px)
    const cell = FROG[gy]?.[gx]
    if (gx >= 0 && cell && cell !== '.') rgb = COLORS[cell]
    raw[o] = rgb[0]
    raw[o + 1] = rgb[1]
    raw[o + 2] = rgb[2]
    raw[o + 3] = Math.round(cover * 255)
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, sum])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA

fs.mkdirSync('build', { recursive: true })
fs.writeFileSync(
  'build/icon.png',
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]),
)
console.log('wrote build/icon.png')
