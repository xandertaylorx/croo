// Eyebrow + headline + one supporting line, entering in sequence.
import React from 'react'
import { useCurrentFrame } from 'remotion'
import { B, FONT } from '../brand'
import { CONFIG } from '../config'
import { enter } from '../motion'
import { Run, TextReveal, revealEnd } from './TextReveal'

export const Headline: React.FC<{
  at: number
  eyebrow: string
  title: Run[]
  sub: string
  align?: 'left' | 'center'
  size?: number
  style?: React.CSSProperties
}> = ({ at, eyebrow, title, sub, align = 'center', size = 64, style }) => {
  const f = useCurrentFrame()
  const titleAt = at + CONFIG.motion.stagger
  const subAt = revealEnd(titleAt, title) + 8
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', gap: 18, ...style }}>
      <div style={{ fontFamily: FONT, fontSize: 21, fontWeight: 600, letterSpacing: '0.01em', color: B.accent, ...enter(f, at, 10) }}>{eyebrow}</div>
      <TextReveal text={title} at={titleAt} size={size} align={align} />
      <div style={{ fontFamily: FONT, fontSize: 27, lineHeight: 1.4, color: B.text2, textAlign: align, whiteSpace: 'pre-line', ...enter(f, subAt, 12) }}>{sub}</div>
    </div>
  )
}
