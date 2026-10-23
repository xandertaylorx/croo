// A macOS arrow that glides along eased keyframes, dips on each click and leaves a soft ripple.
import React from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { easeOutCubic, fade, path } from '../motion'

const RIPPLE = 20

export const Cursor: React.FC<{
  /** [frame, x, y] keyframes, in the coordinates of whatever contains the cursor. */
  points: readonly (readonly number[])[]
  clicks?: readonly number[]
  size?: number
}> = ({ points, clicks = [], size = 22 }) => {
  const f = useCurrentFrame()
  const appear = points[0][0]
  if (f < appear) return null
  const [x, y] = path(f, points)
  const press = clicks.reduce((s, c) => s * (1 - 0.14 * interpolate(f, [c - 3, c, c + 6], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })), 1)
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 50 }}>
      {clicks.map((c) => {
        if (f < c || f > c + RIPPLE) return null
        const t = easeOutCubic((f - c) / RIPPLE)
        const r = 6 + t * 22
        return <div key={c} style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', border: '1.5px solid rgba(255,255,250,0.7)', background: 'rgba(255,255,250,0.1)', opacity: (1 - t) * 0.6 }} />
      })}
      <svg
        width={size}
        height={size * 1.4}
        viewBox="0 0 20 28"
        style={{ position: 'absolute', left: x - 2, top: y - 1, opacity: fade(f, appear, 10), transform: `scale(${press})`, transformOrigin: '2px 1px', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}
      >
        <path d="M2 1.5v20.6l5.1-4.9 3.3 7.6 3.4-1.5-3.3-7.4h7.1z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
