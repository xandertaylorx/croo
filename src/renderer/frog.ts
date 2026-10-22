/**
 * Croo's mascot: a solid pixel-block frog, like the one that lived in the terminal. Eyes and mouth are
 * cut out of the body. It is drawn on a canvas one grid pixel at a time and animated by a tiny
 * timeline engine: it breathes, blinks, looks around, ribbits, hops, catches flies and falls asleep when
 * left alone, and reacts to what Croo is doing (thinking, working, waiting for you, done, oops).
 * Click it.
 */

export type FrogState = 'idle' | 'thinking' | 'working' | 'waiting' | 'happy' | 'oops'

type Eyes = 'open' | 'up' | 'blink' | 'closed' | 'happy' | 'v'
type Mouth = 'smile' | 'flat' | 'open' | 'o' | 'frown'
type Fx = 'q' | 'sweat' | 'spark' | `dots${0 | 1 | 2 | 3}` | `z${1 | 2 | 3}`

interface Pose {
  dx: number
  dy: number
  /** 1 = crouched: the body sinks a pixel onto its feet. */
  sq: number
  eyes: Eyes
  /** Which way the pupils look: -1 left, 0 centre, 1 right. */
  ex: number
  mouth: Mouth
  puff: boolean
  legs: 'down' | 'air'
  tongue?: [number, number]
  fly?: [number, number, number]
  fx?: Fx
}

// Scene grid. The body sits inside with room above for hops, flies and thought bubbles.
const W = 21
const H = 15
const OX = 3
const OY = 6

const BODY = [
  '.#####...#####.',
  '.#####...#####.',
  '###############',
  '###############',
  '###############',
  '###############',
  '.#############.',
]
const LEG_L = 2
const LEG_R = 11

const GLYPH = {
  q: ['###', '..#', '.#.', '...', '.#.'],
  z: ['###', '..#', '.#.', '#..', '###'],
}
const TONGUE = '#ff7d93'
const SWEAT = '#6cb0ff'

// ---------- timelines ----------

type Frame = [ms: number, over: Partial<Pose>]

const HOP: Frame[] = [
  [90, { sq: 1 }],
  [70, { dy: -2, legs: 'air' }],
  [70, { dy: -4, legs: 'air' }],
  [90, { dy: -5, legs: 'air' }],
  [70, { dy: -4, legs: 'air' }],
  [70, { dy: -2, legs: 'air' }],
  [90, { sq: 1 }],
  [60, {}],
]
const LOOK: Frame[] = [
  [520, { ex: -1 }],
  [650, { ex: 1 }],
  [480, { eyes: 'up' }],
  [300, {}],
]
const RIBBIT: Frame[] = [
  [130, { mouth: 'o', puff: true }],
  [150, {}],
  [130, { mouth: 'o', puff: true }],
  [420, {}],
]

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const gaze = (x: number) => (x < OX + 5 ? -1 : x > OX + 9 ? 1 : 0)

/** A fly zigzags in, the frog tracks it, zips its tongue out and swallows. */
function flyCatch(): Frame[] {
  const side = Math.random() < 0.5 ? 1 : -1
  const at = (dx: number, y: number) => [OX + 7 + side * dx, y] as const
  const path = [at(10, 1), at(8, 3), at(9, 0), at(6, 2), at(7, 4), at(5, 3)]
  const frames: Frame[] = path.map(([x, y], i) => [150, { fly: [x, y, i % 2], ex: gaze(x), eyes: 'up' as Eyes }])
  const [fx, fy] = path[path.length - 1]
  frames.push([110, { fly: [fx, fy, 0], ex: gaze(fx), eyes: 'open', mouth: 'o' }])
  frames.push([120, { tongue: [fx, fy], mouth: 'open', ex: gaze(fx), sq: 1 }])
  frames.push([90, { tongue: [Math.round((fx + OX + 7) / 2), Math.round((fy + OY + 4) / 2)], mouth: 'open', sq: 1 }])
  frames.push([260, { eyes: 'closed', mouth: 'flat', sq: 1 }])
  frames.push([320, { eyes: 'happy', mouth: 'smile' }])
  return frames
}

const IDLE_PICKS: [number, () => Frame[]][] = [
  [35, () => LOOK],
  [25, () => RIBBIT],
  [20, () => HOP],
  [20, flyCatch],
]

function pick(): Frame[] {
  let n = rand(0, IDLE_PICKS.reduce((a, [w]) => a + w, 0))
  for (const [w, make] of IDLE_PICKS) if ((n -= w) <= 0) return make()
  return LOOK
}

// ---------- drawing ----------

interface Colors {
  body: string
  accent: string
  muted: string
}
let colors: Colors | null = null
const readColors = (): Colors => {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return (colors = { body: v('--frog', '#5ed67e'), accent: v('--accent', '#5ed67e'), muted: v('--text-3', '#8a948d') })
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => (colors = null))

function paint(ctx: CanvasRenderingContext2D, s: number, p: Pose) {
  const c = colors ?? readColors()
  const px = (x: number, y: number, w = 1, h = 1) => {
    const x0 = Math.round(x * s)
    const y0 = Math.round(y * s)
    ctx.fillRect(x0, y0, Math.round((x + w) * s) - x0, Math.round((y + h) * s) - y0)
  }
  const cut = (x: number, y: number, w = 1, h = 1) => {
    const x0 = Math.round(x * s)
    const y0 = Math.round(y * s)
    ctx.clearRect(x0, y0, Math.round((x + w) * s) - x0, Math.round((y + h) * s) - y0)
  }
  const bx = OX + p.dx
  const by = OY + p.dy + p.sq
  const legY = OY + 7 + p.dy

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.fillStyle = c.body
  if (p.legs === 'down') {
    px(bx + LEG_L, legY, 2)
    px(bx + LEG_R, legY, 2)
  } else {
    px(bx + LEG_L - 1, legY, 2)
    px(bx + LEG_R + 1, legY, 2)
    px(bx + LEG_L - 1, legY + 1)
    px(bx + LEG_R + 2, legY + 1)
  }
  BODY.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (row[x] !== '#') {
        x++
        continue
      }
      let n = 1
      while (row[x + n] === '#') n++
      px(bx + x, by + y, n)
      x += n
    }
  })
  if (p.puff) {
    px(bx - 1, by + 3, 1, 3)
    px(bx + 15, by + 3, 1, 3)
  }

  // eyes
  for (const z of [2, 10]) {
    const e = bx + z + 1 + p.ex
    if (p.eyes === 'open') cut(e, by + 1, 1, 2)
    else if (p.eyes === 'up') cut(e, by + 1)
    else if (p.eyes === 'blink') cut(e, by + 2)
    else if (p.eyes === 'closed') cut(bx + z, by + 2, 3)
    else if (p.eyes === 'happy') (cut(bx + z, by + 2), cut(bx + z + 1, by + 1), cut(bx + z + 2, by + 2))
    else (cut(bx + z, by + 1), cut(bx + z + 1, by + 2), cut(bx + z + 2, by + 1))
  }
  // mouth
  if (p.mouth === 'smile') (cut(bx + 4, by + 4), cut(bx + 10, by + 4), cut(bx + 5, by + 5, 5))
  else if (p.mouth === 'flat') cut(bx + 5, by + 5, 5)
  else if (p.mouth === 'open') cut(bx + 5, by + 4, 5, 2)
  else if (p.mouth === 'o') cut(bx + 6, by + 4, 3, 2)
  else (cut(bx + 5, by + 5, 5), cut(bx + 4, by + 6), cut(bx + 10, by + 6))

  if (p.tongue) {
    ctx.fillStyle = TONGUE
    let [x, y] = [bx + 7, by + 4]
    const [tx, ty] = p.tongue
    const dx = Math.abs(tx - x)
    const dy = -Math.abs(ty - y)
    const sx = x < tx ? 1 : -1
    const sy = y < ty ? 1 : -1
    let err = dx + dy
    for (let i = 0; i < 40; i++) {
      px(x, y)
      if (x === tx && y === ty) break
      const e2 = 2 * err
      if (e2 >= dy) ((err += dy), (x += sx))
      if (e2 <= dx) ((err += dx), (y += sy))
    }
    px(tx, ty - 0)
  }
  if (p.fly) {
    const [x, y, wing] = p.fly
    ctx.fillStyle = c.muted
    px(x, y)
    px(x - 1, y - 1 + wing)
    px(x + 1, y - 1 + wing)
  }

  const fx = p.fx
  if (!fx) return
  const glyph = (g: string[], x: number, y: number) => g.forEach((r, j) => [...r].forEach((ch, i) => ch === '#' && px(x + i, y + j)))
  if (fx === 'q') {
    ctx.fillStyle = c.accent
    glyph(GLYPH.q, OX + 14, 1)
  } else if (fx === 'sweat') {
    ctx.fillStyle = SWEAT
    px(bx + 15, by + 1)
    px(bx + 15, by + 2, 1, 2)
  } else if (fx === 'spark') {
    ctx.fillStyle = c.accent
    for (const [x, y] of [[2, 4], [18, 3], [16, 9]]) (px(x, y - 1), px(x - 1, y), px(x, y), px(x + 1, y), px(x, y + 1))
  } else if (fx.startsWith('dots')) {
    ctx.fillStyle = c.muted
    for (let i = 0; i < Number(fx[4]); i++) px(OX + 12 + i * 2, 3)
  } else if (fx.startsWith('z')) {
    ctx.fillStyle = c.muted
    const n = Number(fx[1])
    glyph(GLYPH.z, OX + 11 + n, 6 - n * 2)
  }
}

// ---------- the frog ----------

const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const live = new Set<Frog>()
let ticker: number | undefined

function tickAll() {
  const now = performance.now()
  for (const f of live) f.tick(now)
  if (!live.size && ticker !== undefined) {
    clearInterval(ticker)
    ticker = undefined
  }
}

const SLEEP_AFTER = 45_000

export class Frog {
  readonly el: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private scale: number
  private state: FrogState
  private born = performance.now()
  private action: { frames: Frame[]; i: number; start: number } | null = null
  private nextAt = performance.now() + rand(1500, 3000)
  private blinkAt = performance.now() + rand(1500, 3500)
  private lastWake = performance.now()
  private shown = ''
  private attached = false

  constructor(size: number, state: FrogState = 'idle') {
    this.state = state
    const dpr = window.devicePixelRatio || 1
    this.canvas = document.createElement('canvas')
    this.canvas.width = Math.round(size * dpr)
    this.canvas.height = Math.round((size * H * dpr) / W)
    this.canvas.style.width = `${size}px`
    this.canvas.style.height = `${(size * H) / W}px`
    this.scale = this.canvas.width / W
    this.ctx = this.canvas.getContext('2d')!
    this.el = document.createElement('div')
    this.el.className = 'frog'
    this.el.append(this.canvas)
    this.el.addEventListener('click', () => this.poke())
    this.enter(state)
    live.add(this)
    this.tick(performance.now())
    ticker ??= window.setInterval(tickAll, 80)
  }

  set(state: FrogState) {
    if (state === this.state) return
    this.state = state
    this.enter(state)
  }

  /** Prod it: it wakes up, ribbits and hops. */
  poke() {
    const now = performance.now()
    this.lastWake = now
    this.play([...RIBBIT, ...HOP])
  }

  private enter(state: FrogState) {
    const now = performance.now()
    this.born = now
    this.lastWake = now
    this.action = null
    this.nextAt = now + rand(1500, 3000)
    if (state === 'happy') this.play([...HOP, ...HOP])
  }

  private play(frames: Frame[]) {
    this.action = { frames, i: 0, start: performance.now() }
  }

  tick(now: number) {
    if (this.el.isConnected) this.attached = true
    else if (this.attached) {
      live.delete(this)
      return
    }
    const p = this.pose(now)
    const key = JSON.stringify(p)
    if (key === this.shown) return
    this.shown = key
    paint(this.ctx, this.scale, p)
  }

  private pose(now: number): Pose {
    const p: Pose = { dx: 0, dy: 0, sq: 0, eyes: 'open', ex: 0, mouth: 'smile', puff: false, legs: 'down' }
    const age = now - this.born
    // A cheerful frog settles back to normal a few seconds after finishing.
    const state = this.state === 'happy' && age > 3400 ? 'idle' : this.state
    const still = reduced.matches

    switch (state) {
      case 'thinking':
        p.mouth = 'flat'
        p.eyes = 'up'
        if (!still) {
          p.ex = [-1, 0, 1, 0][Math.floor(now / 520) % 4]
          p.fx = `dots${Math.floor(now / 380) % 4}` as Fx
        } else p.fx = 'dots3'
        break
      case 'waiting':
        p.mouth = 'flat'
        p.fx = 'q'
        if (!still) p.ex = [-1, -1, 0, 0][Math.floor(now / 800) % 4]
        break
      case 'happy':
        p.eyes = 'happy'
        p.mouth = 'open'
        if (!still && Math.floor(now / 260) % 2) p.fx = 'spark'
        break
      case 'oops':
        p.eyes = 'v'
        p.mouth = 'frown'
        p.fx = 'sweat'
        if (!still && age < 700) p.dx = Math.floor(age / 70) % 2 ? 1 : -1
        break
    }
    if (still) return p

    const sleeping = state === 'idle' && !this.action && now - this.lastWake > SLEEP_AFTER

    if (this.action) {
      const a = this.action
      while (a.i < a.frames.length && now - a.start >= a.frames[a.i][0]) {
        a.start += a.frames[a.i][0]
        a.i++
      }
      if (a.i >= a.frames.length) {
        this.action = null
        this.nextAt = now + rand(2200, 5500)
      } else Object.assign(p, a.frames[a.i][1])
    } else if (sleeping) {
      p.eyes = 'closed'
      p.mouth = 'flat'
      p.sq = Math.floor(now / 1300) % 2
      p.fx = `z${(Math.floor(now / 800) % 3) + 1}` as Fx
      return p
    } else if (state === 'working') {
      if (now >= this.nextAt) {
        this.play(HOP)
        this.nextAt = now + 40
      }
    } else if (state === 'idle' && now >= this.nextAt) {
      this.play(pick())
      this.nextAt = Infinity // set again when the action ends
    }

    // Breathing: a gentle sink every few beats, unless it is already moving.
    if (!this.action && p.sq === 0 && state !== 'working' && Math.floor(now / 640) % 4 === 3) p.sq = 1

    // Blinking, on top of everything that has open eyes.
    if (now >= this.blinkAt) {
      if (now < this.blinkAt + 120) {
        if (p.eyes === 'open' || p.eyes === 'up') p.eyes = 'blink'
      } else this.blinkAt = now + rand(2200, 5200)
    }
    return p
  }
}

export const SAYINGS = [
  'ribbit. ready when you are.',
  'croo! what are we building?',
  'hop in, I will read the code.',
  'small diffs, big wins.',
  'lily pad cleared. let us code.',
]
