// Feature 2: the agent asks before running a command, and you allow it.
import React from 'react'
import { useCurrentFrame } from 'remotion'
import { B, FONT, MONO } from '../brand'
import { CONFIG } from '../config'
import { enter, fade } from '../motion'
import { Cursor } from '../components/Cursor'
import { FeatureFrame, TrafficLights } from '../components/FeatureFrame'
import { Headline } from '../components/Headline'
import { Layer, Scene } from '../components/Scene'
import { Btn, ChatHeader, Composer, IBolt, IShieldPlain, ToolRow } from '../ui'
import * as I from '../../Icons'

const S = CONFIG.scenes.permissions
const COL = { left: 59, width: 620 }
const ALLOW: [number, number] = [100, 231]

const MODES = [
  { name: 'Manual', icon: <IShieldPlain size={20} />, color: B.text2 },
  { name: 'Auto', icon: <I.IShield size={20} />, color: B.accent },
  { name: 'Bypass', icon: <IBolt size={20} />, color: B.warn },
]

export const Permissions: React.FC = () => {
  const f = useCurrentFrame()
  const allowed = f >= S.ran
  const press = f >= S.allow - 2 && f < S.ran
  return (
    <Scene frames={S.frames} glow={[26, 46]}>
      <Layer depth={1.3}>
        <Headline
          at={S.textAt}
          align="left"
          size={68}
          eyebrow="Permissions"
          title={[{ text: 'You decide\n' }, { text: 'what it may do.', color: B.text2 }]}
          sub={'Manual asks first. Auto runs the safe stuff.\nBypass never asks.'}
          style={{ position: 'absolute', left: 140, top: 360, width: 640 }}
        />
      </Layer>
      <Layer>
        <FeatureFrame x={840} y={180} w={940} h={740} at={S.frameAt} scale={1.3}>
          <TrafficLights />
          <ChatHeader left={70} title="Add a cart discount" gitBadge={1} ring={0.26} />
          <div style={{ position: 'absolute', top: 62, left: COL.left, width: COL.width, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ToolRow icon={<I.IPencil size={15} />} verb="Edited" arg="src/cart.ts" stat={[4, 2]} />
            <div style={{ lineHeight: 1.55, color: B.text }}>A discount outside 0–1 should be rejected. I’ll add zod to validate it.</div>
            <div style={{ position: 'relative', height: 126 }}>
              {/* the confirm card, until it's answered */}
              <div style={{ position: 'absolute', inset: 0, borderRadius: 10, border: `1px solid ${B.lineStrong}`, background: B.surface, overflow: 'hidden', opacity: allowed ? 1 - fade(f, S.ran, 8) : 1, ...(allowed ? {} : enter(f, S.cardAt, 14)) }}>
                <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 14px', fontWeight: 600 }}>Run this command?</div>
                <div style={{ height: 38, display: 'flex', alignItems: 'center', padding: '0 14px', borderTop: `1px solid ${B.line}`, background: B.bgSoft, fontFamily: MONO, fontSize: 12.5 }}>
                  <span style={{ color: B.text3 }}>$&nbsp;</span>npm install zod
                </div>
                <div style={{ height: 46, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderTop: `1px solid ${B.line}` }}>
                  <Btn kind="primary" style={{ opacity: press ? 0.8 : 1 }}>Allow</Btn>
                  <Btn>Always allow commands</Btn>
                  <Btn kind="ghost">Deny</Btn>
                  <div style={{ flex: 1 }} />
                  <span style={{ color: B.text3, fontSize: 12 }}>⌘↵ allow · esc deny</span>
                </div>
              </div>
              {/* …and what replaces it */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 6, opacity: allowed ? 1 : 0, ...(allowed ? enter(f, S.ran, 8) : {}) }}>
                <ToolRow icon={<I.ITerm size={15} />} verb="Ran" arg="npm install zod" />
                <div style={{ marginLeft: 24, padding: '7px 12px', borderRadius: 8, background: B.sidebar, border: `1px solid ${B.line}`, fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: B.text2 }}>
                  added 1 package in 0.8s <span style={{ color: B.text3 }}>· exit 0</span>
                </div>
              </div>
            </div>
            <div style={{ lineHeight: 1.55, color: B.text, ...enter(f, S.after, 10) }}>Done. Discounts are checked before they’re applied.</div>
          </div>
          <Composer left={COL.left} width={COL.width} modeGlow={fade(f, S.modesAt, 20)} />
          <Cursor points={[[S.cursorIn, 520, 430], [S.allow - 6, ...ALLOW], [S.allow + 40, 330, 360]]} clicks={[S.allow]} />
        </FeatureFrame>
      </Layer>
      {/* the three modes, floating in front with more parallax */}
      <Layer depth={1.9}>
        <div style={{ position: 'absolute', left: 1300, top: 118, display: 'flex', gap: 6, padding: 6, borderRadius: 18, background: 'rgba(42,41,39,0.92)', border: `1px solid ${B.lineStrong}`, boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7)', fontFamily: FONT, ...enter(f, S.modesAt, 24) }}>
          {MODES.map((m) => {
            const on = m.name === 'Auto'
            return (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 9, height: 48, padding: '0 18px', borderRadius: 13, background: on ? B.active : 'transparent', border: `1px solid ${on ? B.lineStrong : 'transparent'}`, color: on ? B.text : B.text2, fontSize: 21, fontWeight: 600 }}>
                <span style={{ color: m.color, display: 'grid' }}>{m.icon}</span>
                {m.name}
              </div>
            )
          })}
        </div>
      </Layer>
    </Scene>
  )
}
