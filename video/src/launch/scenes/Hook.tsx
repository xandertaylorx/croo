import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { B, FONT } from '../brand'
import { CONFIG } from '../config'
import { enter } from '../motion'
import { Layer, Scene } from '../components/Scene'
import { TextReveal } from '../components/TextReveal'

const S = CONFIG.scenes.hook

export const Hook: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <Scene frames={S.frames} glow={[50, 48]}>
      <Layer depth={1.4}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 34 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderRadius: 30, border: `1px solid ${B.line}`, background: 'rgba(255,255,250,0.03)', fontFamily: FONT, fontSize: 22, color: B.text2, ...enter(f, S.eyebrowAt, 10) }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: B.accent, boxShadow: `0 0 12px ${B.accent}` }} />
            Croo for Mac
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <TextReveal text="A coding agent" at={S.line1At} size={128} weight={650} align="center" tracking={-0.035} />
            <TextReveal text={[{ text: 'with a ' }, { text: 'frog', color: B.accent }, { text: ' in it.' }]} at={S.line2At} size={128} weight={650} align="center" tracking={-0.035} color={B.text2} />
          </div>
        </AbsoluteFill>
      </Layer>
    </Scene>
  )
}
