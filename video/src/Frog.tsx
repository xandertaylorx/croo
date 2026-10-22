// The pixel frog from src/renderer/frog.ts, drawn as SVG rects from a pose so it can be animated by frame.
import React from 'react'
import { C } from './theme'

export type Eyes = 'open' | 'up' | 'blink' | 'closed' | 'happy'
export type Mouth = 'smile' | 'flat' | 'open' | 'o'

export interface Pose {
  dy?: number
  sq?: number
  eyes?: Eyes
  ex?: number
  mouth?: Mouth
  puff?: boolean
  legs?: 'down' | 'air'
  dots?: number
  spark?: boolean
}

const GW = 21
const GH = 15
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

type Px = { x: number; y: number; color: string }

function pixels(p: Required<Omit<Pose, 'dots' | 'spark'>> & Pose): Px[] {
  const body = new Map<string, Px>()
  const put = (x: number, y: number, w = 1, h = 1, color = C.frog) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) body.set(`${x + i},${y + j}`, { x: x + i, y: y + j, color })
  }
  const cut = (x: number, y: number, w = 1, h = 1) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) body.delete(`${x + i},${y + j}`)
  }
  const bx = OX
  const by = OY + p.dy + p.sq
  const legY = OY + 7 + p.dy
  if (p.legs === 'down') {
    put(bx + 2, legY, 2)
    put(bx + 11, legY, 2)
  } else {
    put(bx + 1, legY, 2)
    put(bx + 12, legY, 2)
    put(bx + 1, legY + 1)
    put(bx + 14, legY + 1)
  }
  BODY.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && put(bx + x, by + y)))
  if (p.puff) {
    put(bx - 1, by + 3, 1, 3)
    put(bx + 15, by + 3, 1, 3)
  }
  for (const z of [2, 10]) {
    const e = bx + z + 1 + p.ex
    if (p.eyes === 'open') cut(e, by + 1, 1, 2)
    else if (p.eyes === 'up') cut(e, by + 1)
    else if (p.eyes === 'blink') cut(e, by + 2)
    else if (p.eyes === 'closed') cut(bx + z, by + 2, 3)
    else (cut(bx + z, by + 2), cut(bx + z + 1, by + 1), cut(bx + z + 2, by + 2))
  }
  if (p.mouth === 'smile') (cut(bx + 4, by + 4), cut(bx + 10, by + 4), cut(bx + 5, by + 5, 5))
  else if (p.mouth === 'flat') cut(bx + 5, by + 5, 5)
  else if (p.mouth === 'open') cut(bx + 5, by + 4, 5, 2)
  else cut(bx + 6, by + 4, 3, 2)
  const out = [...body.values()]
  for (let i = 0; i < (p.dots ?? 0); i++) out.push({ x: OX + 12 + i * 2, y: 3, color: C.text3 })
  if (p.spark)
    for (const [x, y] of [[2, 4], [18, 3], [16, 9]])
      for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) out.push({ x: x + dx, y: y + dy, color: C.accent })
  return out
}

export const Frog: React.FC<{
  size: number
  pose?: Pose
  /** Per-pixel appear progress (0..1), for the assemble effect. */
  reveal?: (x: number, y: number) => number
  style?: React.CSSProperties
}> = ({ size, pose = {}, reveal, style }) => {
  const p = { dy: 0, sq: 0, eyes: 'open' as Eyes, ex: 0, mouth: 'smile' as Mouth, puff: false, legs: 'down' as const, ...pose }
  const s = size / GW
  return (
    <svg width={size} height={s * GH} viewBox={`0 0 ${GW} ${GH}`} style={{ overflow: 'visible', ...style }} shapeRendering="crispEdges">
      {pixels(p).map(({ x, y, color }) => {
        const r = reveal ? reveal(x, y) : 1
        if (r <= 0) return null
        const k = Math.min(1, r)
        const off = (1 - k) * 0.5
        return <rect key={`${x},${y},${color}`} x={x + off} y={y + off - (1 - k) * 3} width={k + 0.02} height={k + 0.02} fill={color} opacity={Math.min(1, r * 1.4)} />
      })}
    </svg>
  )
}
