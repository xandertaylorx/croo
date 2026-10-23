// Word-by-word text entrance: each word fades up from a small offset with a little blur, staggered.
import React from 'react'
import { useCurrentFrame } from 'remotion'
import { B, DISPLAY } from '../brand'
import { CONFIG } from '../config'
import { enter } from '../motion'

/** A run of text with its own colour. "\n" inside a run starts a new line. */
export type Run = { text: string; color?: string }

export const TextReveal: React.FC<{
  text: string | Run[]
  at: number
  size: number
  weight?: number
  color?: string
  font?: string
  tracking?: number
  lineHeight?: number
  align?: 'left' | 'center'
  stagger?: number
  style?: React.CSSProperties
}> = ({ text, at, size, weight = 600, color = B.text, font = DISPLAY, tracking = -0.025, lineHeight = 1.08, align = 'left', stagger = CONFIG.motion.stagger, style }) => {
  const f = useCurrentFrame()
  const runs = typeof text === 'string' ? [{ text }] : text
  let i = 0
  const lines: React.ReactNode[][] = [[]]
  for (const run of runs) {
    run.text.split(/(\n)/).forEach((part) => {
      if (part === '\n') return void lines.push([])
      for (const word of part.split(' ').filter(Boolean)) {
        const k = i++
        lines[lines.length - 1].push(
          <span key={k} style={{ display: 'inline-block', marginRight: '0.24em', color: run.color ?? color, ...enter(f, at + k * stagger, CONFIG.motion.textRise) }}>
            {word}
          </span>,
        )
      }
    })
  }
  return (
    <div style={{ fontFamily: font, fontSize: size, fontWeight: weight, letterSpacing: `${tracking}em`, lineHeight, textAlign: align, ...style }}>
      {lines.map((l, n) => (
        <div key={n} style={{ marginRight: '-0.24em' }}>
          {l}
        </div>
      ))}
    </div>
  )
}

/** Frame at which the last word of `text` starts entering, for chaining things after it. */
export const revealEnd = (at: number, text: string | Run[], stagger: number = CONFIG.motion.stagger) => {
  const words = (typeof text === 'string' ? text : text.map((r) => r.text).join(' ')).split(/\s+/).filter(Boolean).length
  return at + (words - 1) * stagger
}
