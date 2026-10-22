// Title scenes: the intro, the quick feature beats and the end card.
import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { clamp, easeOut, pop, prog } from './anim'
import { Frog } from './Frog'
import { C, DISPLAY, FONT, MONO } from './theme'

const Backdrop: React.FC<{ f: number; glow?: number }> = ({ f, glow = 1 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(900px 600px at ${50 + Math.sin(f / 60) * 4}% ${46 + Math.cos(f / 70) * 3}%, rgba(94,214,126,${0.16 * glow}) 0%, transparent 65%),
        radial-gradient(1200px 900px at 50% 120%, rgba(15,75,87,0.35) 0%, transparent 70%), #0b1310`,
    }}
  />
)

// Pixel grain over everything, very faint, so flat colour doesn't band.
const Grain: React.FC = () => (
  <AbsoluteFill style={{ opacity: 0.05, backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 0.6px, transparent 0.6px)', backgroundSize: '3px 3px' }} />
)

export const Intro: React.FC = () => {
  const f = useCurrentFrame()
  const reveal = (x: number, y: number) => {
    const d = Math.hypot(x - 10, y - 9)
    return clamp((f - 2 - d * 1.3) / 7)
  }
  const blink = f > 34 && f < 38
  const ribbit = f >= 44 && f < 58 && Math.floor((f - 44) / 4) % 2 === 0
  const word = pop(f, 16, 15, 120)
  const sub = prog(f, 30, 44, easeOut)
  const out = prog(f, 56, 76)
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <Backdrop f={f} />
      <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 + out * 0.25})` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 50 }}>
          <Frog size={300} reveal={reveal} pose={{ eyes: blink ? 'blink' : f > 40 ? 'happy' : 'open', mouth: ribbit ? 'o' : 'smile', puff: ribbit }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 168, fontWeight: 760, letterSpacing: -6, color: C.text, lineHeight: 1, opacity: clamp(word * 1.4), transform: `translateX(${(1 - word) * -40}px)` }}>Croo</div>
            <div style={{ fontFamily: FONT, fontSize: 32, color: C.text2, opacity: sub, transform: `translateY(${(1 - sub) * 14}px)`, paddingLeft: 8 }}>
              A coding agent with a <span style={{ color: C.accent }}>frog</span> in it.
            </div>
          </div>
        </div>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  )
}

const PROVIDERS = ['Anthropic', 'OpenAI', 'Gemini', 'OpenRouter', 'Groq', 'DeepSeek', 'Mistral', 'xAI', 'Ollama', 'LM Studio']
const MODES: [string, string][] = [
  ['Manual', 'Asks before everything.'],
  ['Auto', 'Runs the safe stuff, asks about the rest.'],
  ['Bypass', 'Never asks. You’re the boss.'],
]
export const MODE_AT = [52, 64, 76]
export const CHIP_AT = (i: number) => 8 + i * 2.5

export const Montage: React.FC = () => {
  const f = useCurrentFrame()
  const inA = pop(f, 0, 18, 120)
  const swap = prog(f, 42, 52)
  const inB = pop(f, 46, 18, 120)
  const out = prog(f, 86, 96)
  const mode = f >= MODE_AT[2] ? 2 : f >= MODE_AT[1] ? 1 : 0
  const slide = MODE_AT.reduce((acc, at, i) => (i === 0 ? acc : acc + prog(f, at - 1, at + 7, easeOut)), 0)
  return (
    <AbsoluteFill style={{ opacity: clamp(inA * 2) * (1 - out), fontFamily: FONT }}>
      <Backdrop f={f + 200} glow={0.8} />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 56, opacity: 1 - swap, transform: `translateY(${-swap * 60}px)` }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 92, fontWeight: 720, letterSpacing: -3, color: C.text, transform: `translateY(${(1 - inA) * 30}px)` }}>
          Any model. <span style={{ color: C.accent }}>Your key.</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, width: 1000 }}>
          {PROVIDERS.map((p, i) => {
            const k = pop(f, CHIP_AT(i), 12, 200)
            return (
              <div key={p} style={{ padding: '14px 26px', borderRadius: 40, fontSize: 28, color: C.text, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.line}`, opacity: clamp(k * 1.5), transform: `scale(${0.6 + 0.4 * k}) translateY(${(1 - k) * 20}px)` }}>
                {p}
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 24, color: C.text3, opacity: prog(f, 24, 34) }}>Or run a local model. No account, no telemetry, no backend.</div>
      </AbsoluteFill>
      {f >= 44 && (
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 56, opacity: clamp(inB * 1.5), transform: `translateY(${(1 - inB) * 60}px)` }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 92, fontWeight: 720, letterSpacing: -3, color: C.text }}>
            You decide <span style={{ color: C.accent }}>what it may do.</span>
          </div>
          <div style={{ position: 'relative', display: 'flex', padding: 8, borderRadius: 26, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.line}` }}>
            <div style={{ position: 'absolute', top: 8, left: 8 + slide * 260, width: 260, height: 84, borderRadius: 20, background: C.accent, boxShadow: '0 10px 40px rgba(94,214,126,0.35)' }} />
            {MODES.map(([m], i) => (
              <div key={m} style={{ position: 'relative', width: 260, height: 84, display: 'grid', placeItems: 'center', fontSize: 34, fontWeight: 650, color: i === mode ? C.accentInk : C.text2 }}>{m}</div>
            ))}
          </div>
          <div style={{ fontSize: 30, color: C.text2, height: 40 }}>{MODES[mode][1]}</div>
        </AbsoluteFill>
      )}
      <Grain />
    </AbsoluteFill>
  )
}

export const Outro: React.FC = () => {
  const f = useCurrentFrame()
  const drop = prog(f, 0, 12, (t) => t * t)
  const land = f >= 12 && f < 17
  const dy = f < 12 ? -(1 - drop) * 30 : 0
  const after = f >= 17
  const word = pop(f, 10, 15, 120)
  const tag = prog(f, 20, 34, easeOut)
  const url = pop(f, 28, 14, 150)
  const fine = prog(f, 36, 50, easeOut)
  const fadeOut = prog(f, 92, 100)
  const blink = f > 70 && f < 74
  return (
    <AbsoluteFill style={{ fontFamily: FONT, opacity: 1 - fadeOut }}>
      <Backdrop f={f + 400} glow={1.2} />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        <div style={{ opacity: clamp(f / 4), height: 290, display: 'flex', alignItems: 'flex-end' }}>
          <Frog
            size={380}
            pose={{
              dy: Math.round(dy),
              sq: land ? 1 : 0,
              legs: f < 12 ? 'air' : 'down',
              eyes: blink ? 'blink' : after ? 'happy' : 'open',
              mouth: f >= 13 && f < 22 ? 'o' : 'smile',
              puff: f >= 13 && f < 22 && Math.floor((f - 13) / 3) % 2 === 0,
              spark: f >= 20 && f < 52 && Math.floor(f / 5) % 2 === 0,
            }}
          />
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 140, fontWeight: 760, letterSpacing: -5, color: C.text, lineHeight: 1, opacity: clamp(word * 1.4), transform: `translateY(${(1 - word) * 30}px)` }}>Croo</div>
        <div style={{ fontSize: 34, color: C.text2, opacity: tag, transform: `translateY(${(1 - tag) * 14}px)` }}>A calm little coding agent for your Mac.</div>
        <div style={{ marginTop: 14, padding: '16px 34px', borderRadius: 40, background: C.accent, color: C.accentInk, fontSize: 32, fontWeight: 700, fontFamily: MONO, opacity: clamp(url * 1.5), transform: `scale(${0.7 + 0.3 * url})`, boxShadow: '0 14px 50px rgba(94,214,126,0.35)' }}>
          ai.crooli.com
        </div>
        <div style={{ fontSize: 22, color: C.text3, opacity: fine, letterSpacing: 0.4 }}>Free · Open source · macOS</div>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  )
}
