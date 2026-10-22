/**
 * Croo's mascot, drawn as pixel art in SVG. Colours come from CSS (.g body, .l belly, .k ink, .w eye white)
 * so it follows the light/dark theme. Each Frog animates itself while it is on screen.
 */

export type FrogState = 'idle' | 'thinking' | 'working' | 'happy' | 'oops'
type Eyes = 'center' | 'left' | 'right' | 'closed' | 'wide'
type Mouth = 'smile' | 'flat' | 'open' | 'frown'

const BODY = [
  '..GGG...GGG..',
  '.GGGGG.GGGGG.',
  '.GGGGGGGGGGG.',
  'GGGGGGGGGGGGG',
  'GGGGGGGGGGGGG',
  'GGLLLLLLLLLGG',
  '.GLLLLLLLLLG.',
  '.GGGGGGGGGGG.',
  'GGG.......GGG',
]
const W = 13
const H = BODY.length

function grid(eyes: Eyes, mouth: Mouth): string[][] {
  const g = BODY.map((r) => r.split(''))
  const set = (r: number, cols: number[], c: string) => cols.forEach((x) => (g[r][x] = c))
  for (const left of [2, 8]) {
    const cols = [left, left + 1, left + 2]
    if (eyes === 'closed') set(2, cols, 'K')
    else {
      set(1, cols, 'W')
      set(2, cols, 'W')
      const px = eyes === 'left' ? left : eyes === 'right' ? left + 2 : left + 1
      if (eyes === 'wide') set(2, [px], 'K')
      else {
        set(1, [px], 'K')
        set(2, [px], 'K')
      }
    }
  }
  if (mouth === 'smile') set(4, [2, 10], 'K'), set(5, [3, 4, 5, 6, 7, 8, 9], 'K')
  if (mouth === 'flat') set(5, [4, 5, 6, 7, 8], 'K')
  if (mouth === 'open') set(4, [4, 5, 6, 7, 8], 'K'), set(5, [5, 6, 7], 'K')
  if (mouth === 'frown') set(5, [4, 5, 6, 7, 8], 'K'), set(6, [3, 9], 'K')
  return g
}

const CLASS: Record<string, string> = { G: 'g', L: 'l', K: 'k', W: 'w' }
const cache = new Map<string, string>()

export function frogSvg(eyes: Eyes, mouth: Mouth): string {
  const key = eyes + mouth
  let svg = cache.get(key)
  if (!svg) {
    const rects: string[] = []
    grid(eyes, mouth).forEach((row, y) => {
      for (let x = 0; x < W; ) {
        const c = row[x]
        if (c === '.') {
          x++
          continue
        }
        let n = 1
        while (row[x + n] === c) n++
        rects.push(`<rect class="${CLASS[c]}" x="${x}" y="${y}" width="${n}" height="1"/>`)
        x += n
      }
    })
    svg = `<svg viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`
    cache.set(key, svg)
  }
  return svg
}

/** Eyes and mouth for a state at a given time (ms since the frog appeared). */
function pose(state: FrogState, t: number): [Eyes, Mouth] {
  switch (state) {
    case 'thinking':
      return [(['left', 'center', 'right', 'center'] as const)[Math.floor(t / 450) % 4], 'flat']
    case 'working':
      return ['center', 'smile']
    case 'happy':
      return ['closed', 'open']
    case 'oops':
      return ['wide', 'frown']
    default: {
      const c = t % 6400
      if ((c > 2800 && c < 2960) || (c > 5600 && c < 5760)) return ['closed', 'smile']
      if (c > 4000 && c < 4800) return ['left', 'smile']
      return ['center', 'smile']
    }
  }
}

const live = new Set<Frog>()
let ticker: number | undefined

function tick() {
  for (const f of live) f.draw()
  if (!live.size && ticker !== undefined) {
    clearInterval(ticker)
    ticker = undefined
  }
}

export class Frog {
  readonly el: HTMLElement
  private state: FrogState
  private born = performance.now()
  private shown = ''
  private attached = false

  constructor(size: number, state: FrogState = 'idle') {
    this.state = state
    this.el = document.createElement('div')
    this.el.className = `frog frog-${state}`
    this.el.style.width = `${size}px`
    this.el.style.height = `${Math.round((size * H) / W)}px`
    live.add(this)
    this.draw()
    ticker ??= window.setInterval(tick, 120)
  }

  set(state: FrogState) {
    if (state === this.state) return
    this.state = state
    this.born = performance.now()
    this.el.className = `frog frog-${state}`
    this.draw()
  }

  draw() {
    if (this.el.isConnected) this.attached = true
    else if (this.attached) {
      live.delete(this)
      return
    }
    const [eyes, mouth] = pose(this.state, performance.now() - this.born)
    const svg = frogSvg(eyes, mouth)
    if (svg !== this.shown) this.el.innerHTML = this.shown = svg
  }
}

export const SAYINGS = [
  'ribbit. ready when you are.',
  'croo! what are we building?',
  'hop in, I will read the code.',
  'small diffs, big wins.',
  'lily pad cleared. let us code.',
]
