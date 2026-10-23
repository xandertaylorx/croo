// A scene's stage: warm dark backdrop with soft light, fine grain, a slow camera push and parallax.
// Wrap foreground pieces in <Layer depth={…}> to have them drift more (or less) than the backdrop.
import React, { createContext, useContext } from 'react'
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion'
import { B } from '../brand'
import { CONFIG } from '../config'

const M = CONFIG.motion
const Drift = createContext(0)

export const Scene: React.FC<{
  frames: number
  /** Where the soft green light sits, in % of the frame. */
  glow?: [number, number]
  children: React.ReactNode
}> = ({ frames, glow = [50, 40], children }) => {
  const f = useCurrentFrame()
  const t = interpolate(f, [0, frames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin) })
  const zoom = M.zoomFrom + (M.zoomTo - M.zoomFrom) * t
  const drift = (t - 0.5) * M.parallax
  return (
    <AbsoluteFill style={{ background: B.stage, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translateY(${-drift * 0.35}px) scale(1.08)` }}>
        <Backdrop glow={glow} />
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <Drift.Provider value={drift}>{children}</Drift.Provider>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  )
}

/** A piece of the scene that drifts by `depth` × the scene's parallax (1 = the main layer). */
export const Layer: React.FC<{ depth?: number; children: React.ReactNode }> = ({ depth = 1, children }) => {
  const drift = useContext(Drift)
  return <AbsoluteFill style={{ transform: `translateY(${-drift * depth}px)` }}>{children}</AbsoluteFill>
}

export const Backdrop: React.FC<{ glow?: [number, number] }> = ({ glow = [50, 40] }) => (
  <AbsoluteFill
    style={{
      background: [
        `radial-gradient(1100px 700px at ${glow[0]}% ${glow[1]}%, rgba(92,201,131,0.13) 0%, rgba(92,201,131,0.04) 45%, transparent 70%)`,
        `radial-gradient(1400px 900px at ${100 - glow[0]}% 110%, rgba(214,170,110,0.08) 0%, transparent 65%)`,
        `radial-gradient(1800px 1100px at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%)`,
        B.stage,
      ].join(', '),
    }}
  />
)

// Static film grain from SVG turbulence, blended softly so gradients never band.
const NOISE = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`

export const Grain: React.FC = () => <AbsoluteFill style={{ backgroundImage: NOISE, opacity: 0.06, mixBlendMode: 'overlay', pointerEvents: 'none' }} />
