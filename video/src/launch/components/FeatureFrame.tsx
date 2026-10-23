// A floating Croo window. Children are laid out at the app's real pixel sizes (`w / scale` wide) and
// scaled up as a whole, so the recreated UI keeps the app's proportions. Put a <Cursor> inside the
// children to point at things in the same coordinates.
import React from 'react'
import { useCurrentFrame } from 'remotion'
import { B, FONT } from '../brand'
import { fade, rise } from '../motion'

export const FeatureFrame: React.FC<{
  x: number
  y: number
  w: number
  h: number
  at: number
  scale?: number
  children: React.ReactNode
}> = ({ x, y, w, h, at, scale = 1.4, children }) => {
  const f = useCurrentFrame()
  const p = rise(f, at)
  const o = fade(f, at, 20)
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        opacity: o,
        transform: `translateY(${(1 - p) * 40}px) scale(${0.985 + 0.015 * p})`,
        borderRadius: 20,
        boxShadow: '0 60px 120px -30px rgba(0,0,0,0.7), 0 30px 60px -30px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,250,0.09)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: 20, overflow: 'hidden', background: B.bg }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: w / scale, height: h / scale, transform: `scale(${scale})`, transformOrigin: '0 0', fontFamily: FONT, fontSize: 14, color: B.text }}>
          {children}
        </div>
        {/* soft top highlight, like light catching the glass */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 20, boxShadow: 'inset 0 1px 0 rgba(255,255,250,0.08)', pointerEvents: 'none' }} />
      </div>
    </div>
  )
}

/** The three window buttons, greyed out so they don't pull the eye. */
export const TrafficLights: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={{ position: 'absolute', left: 16, top: 16, display: 'flex', gap: 8, ...style }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: 'rgba(255,255,250,0.16)' }} />
    ))}
  </div>
)
