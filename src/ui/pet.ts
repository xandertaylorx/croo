/**
 * Croo's mascot: a tiny pixel frog drawn with half blocks (▀ ▄ █).
 * Frames are built from a small pixel grid so every frame has identical width and height.
 * To make your own pet, implement the `Pet` interface (see README roadmap).
 */

export type PetState = 'idle' | 'thinking' | 'working' | 'happy' | 'oops'

export interface Pet {
  name: string
  /** Multi-line frames per state (2-4 frames, equal width, <= 4 lines). */
  frames: Record<PetState, string[][]>
  /** One-line glyph per state, used next to the spinner. */
  mini: Record<PetState, string[]>
  /** Short wholesome lines for the banner speech bubble. */
  sayings: string[]
}

const W = 11
const H = 8 // pixel rows -> 4 text lines

type Eyes = 'center' | 'left' | 'right' | 'closed' | 'wide'
type Mouth = 'smile' | 'flat' | 'open' | 'frown'

function frog(eyes: Eyes, mouth: Mouth, offset: number): string[] {
  const rows = [
    '.###...###.',
    '####...####',
    '###########',
    '###########',
    '.#########.',
    '.##.....##.',
  ].map((r) => r.split(''))
  const carve = (r: number, ...cols: number[]) => cols.forEach((c) => (rows[r][c] = '.'))
  if (eyes === 'center') carve(1, 2, 8)
  if (eyes === 'left') carve(1, 1, 7)
  if (eyes === 'right') carve(1, 3, 9)
  if (eyes === 'wide') carve(1, 2, 8), carve(0, 2, 8)
  if (mouth === 'smile') carve(3, 2, 8), carve(4, 3, 4, 5, 6, 7)
  if (mouth === 'flat') carve(3, 3, 4, 5, 6, 7)
  if (mouth === 'open') carve(3, 2, 3, 4, 5, 6, 7, 8), carve(4, 3, 4, 5, 6, 7)
  if (mouth === 'frown') carve(3, 4, 5, 6), carve(4, 3, 7)
  const grid: string[][] = Array.from({ length: H }, () => Array<string>(W).fill('.'))
  rows.forEach((row, i) => {
    const y = i + offset
    if (y >= 0 && y < H) grid[y] = row
  })
  const lines: string[] = []
  for (let y = 0; y < H; y += 2) {
    let line = ''
    for (let x = 0; x < W; x++) {
      const top = grid[y][x] === '#'
      const bot = grid[y + 1][x] === '#'
      line += top && bot ? '█' : top ? '▀' : bot ? '▄' : ' '
    }
    lines.push(line)
  }
  return lines
}

export const frogPet: Pet = {
  name: 'frog',
  frames: {
    // A long open-eyed pause, then a blink (the animator holds frame 0 for a few seconds).
    idle: [frog('center', 'smile', 1), frog('closed', 'smile', 1)],
    thinking: [frog('left', 'flat', 1), frog('center', 'flat', 1), frog('right', 'flat', 1), frog('center', 'flat', 1)],
    working: [frog('center', 'smile', 2), frog('center', 'smile', 0)],
    happy: [frog('closed', 'open', 1), frog('closed', 'open', 0), frog('closed', 'open', 1)],
    oops: [frog('wide', 'frown', 1), frog('wide', 'frown', 2)],
  },
  mini: {
    idle: ['(o.o)', '(-.-)'],
    thinking: ['(o.o )', '( o.o)'],
    working: ['\\(o.o)/', ' (o.o) '],
    happy: ['\\(^.^)/'],
    oops: ['(x.x)'],
  },
  sayings: [
    'ribbit. ready when you are.',
    'croo! what are we building?',
    'hop in, I will read the code.',
    'small diffs, big wins.',
    'lily pad cleared. let us code.',
  ],
}
