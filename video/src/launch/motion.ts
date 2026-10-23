import { Easing, interpolate, spring } from 'remotion'
import { CONFIG } from './config'

const { fps } = CONFIG
const M = CONFIG.motion

export const easeOutCubic = Easing.out(Easing.cubic)
export const easeInOut = Easing.bezier(0.45, 0, 0.2, 1)

/** 0 → 1 critically damped spring starting at `at` (no overshoot). */
export const rise = (f: number, at: number, config: Partial<typeof M.spring> = {}) =>
  f < at ? 0 : spring({ frame: f - at, fps, config: { ...M.spring, ...config, overshootClamping: true } })

/** 0 → 1 ease-out-cubic fade over `frames` starting at `at`. */
export const fade = (f: number, at: number, frames: number = M.fadeFrames) =>
  interpolate(f, [at, at + frames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOutCubic })

/** Opacity + rise + slight blur for an element entering at `at`. */
export const enter = (f: number, at: number, distance: number = M.textRise): React.CSSProperties => {
  const p = rise(f, at)
  const o = fade(f, at)
  return { opacity: o, transform: `translateY(${(1 - p) * distance}px)`, filter: o < 1 ? `blur(${(1 - o) * 6}px)` : undefined }
}

/** Eased piecewise path through [frame, x, y] keyframes; holds at the ends. */
export function path(f: number, kf: readonly (readonly number[])[]): [number, number] {
  if (f <= kf[0][0]) return [kf[0][1], kf[0][2]]
  for (let i = 0; i < kf.length - 1; i++) {
    const [a, ax, ay] = kf[i]
    const [b, bx, by] = kf[i + 1]
    if (f <= b) {
      const t = easeInOut((f - a) / (b - a))
      return [ax + (bx - ax) * t, ay + (by - ay) * t]
    }
  }
  const last = kf[kf.length - 1]
  return [last[1], last[2]]
}

/** How many characters of `text` are typed by frame f. */
export const typed = (f: number, from: number, rate: number, text: string) =>
  text.slice(0, Math.max(0, Math.min(text.length, Math.floor((f - from) / rate))))
