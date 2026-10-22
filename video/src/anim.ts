import { Easing, interpolate, spring } from 'remotion'
import { FPS } from './theme'

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
export const ease = Easing.bezier(0.65, 0, 0.35, 1)
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1)

/** 0 → 1 over [a, b] with an ease. */
export const prog = (f: number, a: number, b: number, e = ease) => interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: e })

/** A soft spring that starts at `at`. */
export const pop = (f: number, at: number, damping = 16, stiffness = 170) =>
  f < at ? 0 : spring({ frame: f - at, fps: FPS, config: { damping, stiffness, mass: 0.7 } })

/** Piecewise keyframes: [frame, ...values]; eases between neighbours, holds at the ends. */
export function keyframes(f: number, kf: number[][]): number[] {
  if (f <= kf[0][0]) return kf[0].slice(1)
  for (let i = 0; i < kf.length - 1; i++) {
    const [a, ...va] = kf[i]
    const [b, ...vb] = kf[i + 1]
    if (f <= b) {
      const t = ease(clamp((f - a) / (b - a)))
      return va.map((v, k) => v + (vb[k] - v) * t)
    }
  }
  return kf[kf.length - 1].slice(1)
}

/** How many characters of a typed string are visible. */
export const typed = (f: number, start: number, framesPerChar: number, text: string) =>
  text.slice(0, clamp(Math.floor((f - start) / framesPerChar), 0, text.length))

/** Frames at which each character of a typed string lands (for key sounds). */
export const keyFrames = (start: number, framesPerChar: number, text: string) =>
  [...text].map((_, i) => start + Math.ceil((i + 1) * framesPerChar))
