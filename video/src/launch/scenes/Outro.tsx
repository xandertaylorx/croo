import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { B, FONT, MONO } from '../brand'
import { CONFIG } from '../config'
import { enter, fade } from '../motion'
import { Layer, Scene } from '../components/Scene'
import { TextReveal } from '../components/TextReveal'
import { Frog } from '../../Frog'

const S = CONFIG.scenes.outro

export const Outro: React.FC = () => {
  const f = useCurrentFrame()
  const blink = (f > 70 && f < 74) || (f > 112 && f < 116)
  return (
    <AbsoluteFill style={{ opacity: 1 - fade(f, S.fadeOutFrom, S.frames - S.fadeOutFrom) }}>
      <Scene frames={S.frames} glow={[50, 44]}>
        <Layer depth={1.2}>
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 22 }}>
            <div style={{ ...enter(f, S.frogAt, 24), marginBottom: 8 }}>
              <Frog size={200} pose={{ eyes: blink ? 'blink' : f > S.urlAt ? 'happy' : 'open' }} />
            </div>
            <TextReveal text="Croo" at={S.nameAt} size={150} weight={700} align="center" tracking={-0.04} />
            <div style={{ fontFamily: FONT, fontSize: 34, color: B.text2, ...enter(f, S.tagAt) }}>A calm coding agent for your Mac.</div>
            <div style={{ marginTop: 22, padding: '14px 30px', borderRadius: 40, border: '1px solid rgba(92,201,131,0.4)', background: 'rgba(92,201,131,0.1)', color: B.accent, fontFamily: MONO, fontSize: 30, fontWeight: 600, ...enter(f, S.urlAt) }}>ai.crooli.com</div>
            <div style={{ fontFamily: FONT, fontSize: 21, color: B.text3, letterSpacing: '0.02em', ...enter(f, S.urlAt + 8, 10) }}>Free · Open source · Bring your own key</div>
          </AbsoluteFill>
        </Layer>
      </Scene>
    </AbsoluteFill>
  )
}
