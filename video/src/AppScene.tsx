// The macOS desktop with a faked Croo window doing a real-looking task: type a prompt, think, read and
// edit a file, run the tests, then commit and push from the Git panel. Everything is a function of frame.
import React from 'react'
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion'
import { clamp, easeOut, keyframes, pop, prog, typed } from './anim'
import { Frog, Pose } from './Frog'
import * as I from './Icons'
import { C, FONT, MONO } from './theme'

// ---------- timeline (frames, local to this scene) ----------

export const PROMPT = 'Add a dark mode toggle to Settings, then run the tests'
export const COMMIT_MSG = 'Add dark mode toggle to Settings'
export const T = {
  clickComposer: 34,
  typeStart: 40,
  typeRate: 1.55,
  send: 132,
  think: 138,
  thought: 192,
  text1: 196,
  read: 228,
  search: 242,
  edit: 256,
  diffLines: 266,
  diffRate: 5,
  run: 330,
  runOut: 344,
  runRate: 9,
  runDone: 392,
  text2: 400,
  done: 444,
  clickGit: 474,
  gitOpen: 477,
  tick1: 500,
  tick2: 505,
  clickMsg: 512,
  msgStart: 518,
  msgRate: 1.2,
  clickCommit: 572,
  committed: 575,
  clickPush: 598,
  pushed: 601,
  end: 654,
}
export const COMMIT_END = T.msgStart + Math.ceil(COMMIT_MSG.length * T.msgRate)

// ---------- layout (stage px) ----------

const WX = 150
const WY = 70
const WW = 1620
const WH = 908
const SIDEBAR = 290
const GITW = 450

// ---------- camera ----------

const CAM: number[][] = [
  [0, 960, 540, 1],
  [26, 960, 540, 1],
  [46, 1110, 845, 1.6],
  [126, 1110, 845, 1.6],
  [150, 1110, 620, 1.16],
  [262, 1110, 640, 1.18],
  [282, 1100, 620, 1.55],
  [320, 1100, 620, 1.55],
  [338, 1110, 640, 1.22],
  [370, 1110, 680, 1.38],
  [400, 1110, 680, 1.38],
  [430, 1110, 620, 1.12],
  [462, 960, 540, 1],
  [480, 960, 540, 1],
  [500, 1430, 560, 1.45],
  [520, 1430, 640, 1.5],
  [560, 1440, 720, 1.55],
  [612, 1440, 700, 1.5],
  [640, 1260, 580, 1.15],
]

// Cursor keyframes [frame, x, y] in stage px.
const CURSOR: number[][] = [
  [16, 1420, 640],
  [32, 1010, 880],
  [448, 1300, 640],
  [472, 1626, 100],
  [490, 1620, 120],
  [510, 1520, 856],
  [552, 1600, 870],
  [570, 1424, 940],
  [586, 1440, 950],
  [596, 1612, 940],
  [654, 1640, 960],
]
const CLICKS = [T.clickComposer, T.clickGit, T.clickMsg, T.clickCommit, T.clickPush]

// ---------- desktop ----------

const Wallpaper: React.FC<{ f: number }> = ({ f }) => {
  const d = f * 0.15
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(900px 700px at ${18 + d * 0.02}% ${28 - d * 0.01}%, #2c7a4b 0%, transparent 60%),
          radial-gradient(1000px 800px at ${82 - d * 0.02}% 78%, #0f4b57 0%, transparent 60%),
          radial-gradient(700px 600px at 58% ${8 + d * 0.015}%, #4f7d2c 0%, transparent 55%),
          radial-gradient(800px 600px at 30% 95%, #173c31 0%, transparent 60%),
          #0a1411`,
      }}
    />
  )
}

const MenuBar: React.FC = () => (
  <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 32, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 26, color: 'rgba(255,255,255,0.92)', fontSize: 15, fontFamily: FONT, background: 'rgba(10,20,16,0.35)', backdropFilter: 'blur(20px)' }}>
    <span style={{ fontSize: 17 }}>{''}</span>
    <b style={{ fontWeight: 650 }}>Croo</b>
    {['File', 'Edit', 'View', 'Window', 'Help'].map((m) => <span key={m}>{m}</span>)}
    <div style={{ flex: 1 }} />
    <svg width="20" height="14" viewBox="0 0 20 14"><path d="M10 12.5l2-2.3a3 3 0 0 0-4 0zM5 7.6a7 7 0 0 1 10 0l-1.5 1.7a5 5 0 0 0-7 0zM2 4.4a11.5 11.5 0 0 1 16 0l-1.5 1.7a9.3 9.3 0 0 0-13 0z" fill="white" /></svg>
    <svg width="28" height="14" viewBox="0 0 28 14"><rect x="1" y="1" width="23" height="12" rx="3.5" stroke="rgba(255,255,255,0.6)" fill="none" /><rect x="3" y="3" width="17" height="8" rx="2" fill="white" /><rect x="25" y="5" width="2" height="4" rx="1" fill="rgba(255,255,255,0.6)" /></svg>
    <span>Thu 22 Oct  9:41</span>
  </div>
)

const DockIcon: React.FC<{ bg: string; children?: React.ReactNode; dot?: boolean }> = ({ bg, children, dot }) => (
  <div style={{ position: 'relative' }}>
    <div style={{ width: 58, height: 58, borderRadius: 14, background: bg, display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', overflow: 'hidden' }}>{children}</div>
    {dot && <div style={{ position: 'absolute', left: 27, bottom: -8, width: 4, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.8)' }} />}
  </div>
)

const Dock: React.FC = () => (
  <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)', display: 'flex', gap: 12, padding: '9px 12px 13px', borderRadius: 24, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(30px)' }}>
    <DockIcon bg="linear-gradient(#5aa9ff,#2563eb)"><I.IFolder color="white" size={30} /></DockIcon>
    <DockIcon bg="linear-gradient(#ffffff,#d9e2ec)"><I.IGlobe color="#2563eb" size={32} /></DockIcon>
    <DockIcon bg="#1d1f1e"><I.ITerm color="#e8ece8" size={30} /></DockIcon>
    <DockIcon bg="transparent" dot><Img src={staticFile('icon.png')} style={{ width: 58, height: 58 }} /></DockIcon>
    <DockIcon bg="linear-gradient(#ffe27a,#f5c542)"><I.IPencil color="#6b4f00" size={28} /></DockIcon>
    <DockIcon bg="linear-gradient(#a3aab3,#6b7280)"><I.IGear color="white" size={30} /></DockIcon>
  </div>
)

// ---------- app pieces ----------

const Btn: React.FC<{ children: React.ReactNode; active?: boolean; size?: number }> = ({ children, active, size = 36 }) => (
  <div style={{ width: size, height: size, borderRadius: 9, display: 'grid', placeItems: 'center', color: active ? C.text : C.text2, background: active ? C.active : 'transparent', position: 'relative' }}>{children}</div>
)

const Sidebar: React.FC<{ f: number; frogPose: Pose }> = ({ f, frogPose }) => {
  const titled = prog(f, T.send + 6, T.send + 20)
  const chats = ['Fix flaky login test', 'Refactor cart API', 'Checkout copy tweaks']
  return (
    <div style={{ width: SIDEBAR, flex: 'none', background: C.sidebar, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
      <div style={{ height: 60, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 8 }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', padding: 3, borderRadius: 10, background: C.bgSoft, border: `1px solid ${C.line}` }}>
          <Btn size={32}><I.IChat size={17} /></Btn>
          <Btn size={32} active><I.ICode size={17} /></Btn>
        </div>
        <div style={{ width: 8 }} />
        <Btn size={32}><I.IPanel size={18} /></Btn>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '18px 22px 10px', color: C.text3, fontSize: 12.5, fontWeight: 600, letterSpacing: 1.2 }}>
        FOLDERS<div style={{ flex: 1 }} /><I.IPlus size={16} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 22px', color: C.text, fontSize: 16 }}>
        <I.IChevron size={14} color={C.text3} /><I.IFolder size={18} color={C.text2} /> frogshop
      </div>
      <div style={{ margin: '4px 12px 0 40px', padding: '9px 14px', borderRadius: 9, background: C.active, color: C.text, fontSize: 15.5, position: 'relative', height: 40, boxSizing: 'border-box', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 14, top: 9, opacity: 1 - titled }}>New chat</div>
        <div style={{ position: 'absolute', left: 14, top: 9, opacity: titled, transform: `translateY(${(1 - titled) * 8}px)` }}>Dark mode toggle</div>
      </div>
      {chats.map((c) => (
        <div key={c} style={{ margin: '2px 12px 0 40px', padding: '9px 14px', color: C.text2, fontSize: 15.5 }}>{c}</div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 22px 8px', color: C.text2, fontSize: 16 }}>
        <I.IChevronR size={14} color={C.text3} /><I.IFolder size={18} color={C.text3} /> pond-api
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px 20px' }}>
        <Frog size={52} pose={frogPose} />
        <div style={{ color: C.text, fontSize: 17, fontWeight: 600 }}>Croo</div>
        <div style={{ flex: 1 }} />
        <I.IGear size={20} color={C.text2} />
      </div>
    </div>
  )
}

/** One item in the chat list. Its height grows in so the list scrolls smoothly. */
const Item: React.FC<{ f: number; at: number; h: number; children: React.ReactNode; gap?: number }> = ({ f, at, h, children, gap = 14 }) => {
  const p = pop(f, at, 18, 160)
  if (p <= 0) return null
  return (
    <div style={{ height: (h + gap) * clamp(p, 0, 1), flex: 'none', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: gap, height: h, opacity: clamp(p * 1.5), transform: `translateY(${(1 - p) * 18}px) scale(${0.97 + 0.03 * p})`, transformOrigin: 'left bottom' }}>{children}</div>
    </div>
  )
}

const Tool: React.FC<{ f: number; at: number; icon: React.ReactNode; verb: string; arg: string; extra?: string }> = ({ f, at, icon, verb, arg, extra }) => {
  const done = f > at + 10
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '0 12px', height: 40, fontSize: 17 }}>
      <span style={{ color: C.text2, display: 'flex' }}>{icon}</span>
      <span style={{ color: C.text, fontWeight: 600 }}>{verb}</span>
      <span style={{ color: C.text3, fontFamily: MONO, fontSize: 15.5 }}>{arg}</span>
      {extra && <span style={{ color: C.text3, fontSize: 15 }}>{extra}</span>}
      <div style={{ flex: 1 }} />
      {done ? <I.ICheck size={17} color={C.accent} /> : <Spinner f={f} />}
    </div>
  )
}

const Spinner: React.FC<{ f: number; size?: number }> = ({ f, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" style={{ transform: `rotate(${f * 14}deg)` }}>
    <circle cx="8" cy="8" r="6" stroke={C.line} strokeWidth="2" fill="none" />
    <path d="M8 2a6 6 0 0 1 6 6" stroke={C.accent} strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
)

type Tok = [string, string?]
const DIFF: { n: number; k: ' ' | '+' | '-'; toks: Tok[] }[] = [
  { n: 28, k: ' ', toks: [['  <'], ['Section', C.type], [' title', C.attr], ['='], ['"Appearance"', C.str], ['>']] },
  { n: 29, k: '-', toks: [['    <'], ['Row', C.type], [' label', C.attr], ['='], ['"Theme"', C.str], ['>System</'], ['Row', C.type], ['>']] },
  { n: 29, k: '+', toks: [['    <'], ['Row', C.type], [' label', C.attr], ['='], ['"Dark mode"', C.str], ['>']] },
  { n: 30, k: '+', toks: [['      <'], ['Toggle', C.type]] },
  { n: 31, k: '+', toks: [['        checked', C.attr], ['={theme === '], ["'dark'", C.str], ['}']] },
  { n: 32, k: '+', toks: [['        onChange', C.attr], ['={(on) => '], ['setTheme', C.fn], ['(on ? '], ["'dark'", C.str], [' : '], ["'light'", C.str], [')}']] },
  { n: 33, k: '+', toks: [['      />']] },
  { n: 34, k: '+', toks: [['    </'], ['Row', C.type], ['>']] },
  { n: 35, k: ' ', toks: [['  </'], ['Section', C.type], ['>']] },
]
export const DIFF_LINES = DIFF.length

const DiffCard: React.FC<{ f: number }> = ({ f }) => {
  const shown = clamp(Math.floor((f - T.diffLines) / T.diffRate) + 1, 0, DIFF.length)
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: C.bgSoft, overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 48, borderBottom: `1px solid ${C.line}`, fontSize: 16.5 }}>
        <I.IPencil size={17} color={C.text2} />
        <span style={{ color: C.text, fontWeight: 600 }}>Edited</span>
        <span style={{ color: C.text2, fontFamily: MONO, fontSize: 15.5 }}>src/pages/Settings.tsx</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 15, color: C.accent }}>+{Math.max(0, DIFF.slice(0, shown).filter((d) => d.k === '+').length)}</span>
        <span style={{ fontFamily: MONO, fontSize: 15, color: C.danger }}>−{DIFF.slice(0, shown).filter((d) => d.k === '-').length}</span>
        {shown === DIFF.length ? <I.ICheck size={17} color={C.accent} /> : <Spinner f={f} />}
      </div>
      <div style={{ padding: '8px 0', fontFamily: MONO, fontSize: 15.5 }}>
        {DIFF.map((d, i) => {
          const a = clamp((f - T.diffLines - i * T.diffRate) / 5)
          return (
            <div key={i} style={{ display: 'flex', height: 27, alignItems: 'center', opacity: a, transform: `translateX(${(1 - a) * -10}px)`, background: d.k === '+' ? C.addBg : d.k === '-' ? C.delBg : 'transparent', color: C.text }}>
              <span style={{ width: 52, textAlign: 'right', color: C.text3, paddingRight: 10 }}>{d.n}</span>
              <span style={{ width: 24, color: d.k === '+' ? C.accent : d.k === '-' ? C.danger : C.text3 }}>{d.k === ' ' ? '' : d.k === '-' ? '−' : '+'}</span>
              <span style={{ whiteSpace: 'pre' }}>{d.toks.map(([t, c], j) => <span key={j} style={{ color: c ?? C.text }}>{t}</span>)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const RUN_OUT: Tok[][] = [
  [[' ✓ ', C.accent], ['src/theme.test.ts '], ['(7 tests)', C.text3]],
  [[' ✓ ', C.accent], ['src/pages/Settings.test.tsx '], ['(5 tests)', C.text3]],
  [[' ✓ ', C.accent], ['src/api/cart.test.ts '], ['(30 tests)', C.text3]],
  [['']],
  [['      Tests  '], ['42 passed', C.accent], [' (42)', C.text3]],
]
export const RUN_LINES = RUN_OUT.filter((l) => l[0][0] !== '').length

const RunCard: React.FC<{ f: number }> = ({ f }) => {
  const done = f >= T.runDone
  const secs = done ? '1.8s' : `${((f - T.run) / 30).toFixed(1)}s`
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: C.termBg, overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', height: 48, borderBottom: `1px solid ${C.line}`, fontSize: 16 }}>
        {done ? <I.ICheck size={17} color={C.accent} /> : <Spinner f={f} />}
        <span style={{ color: done ? C.accent : C.text2 }}>{done ? 'Finished' : 'Running'} · {secs}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, color: C.text2, fontSize: 15 }}>
          <span style={{ color: C.text3 }}>$ </span>npm <span style={{ color: C.builtin }}>test</span>
        </span>
      </div>
      <div style={{ padding: '12px 18px', fontFamily: MONO, fontSize: 15.5, lineHeight: '27px', color: C.text }}>
        {RUN_OUT.map((l, i) => {
          const a = clamp((f - T.runOut - i * T.runRate) / 4)
          return (
            <div key={i} style={{ height: 27, opacity: a, whiteSpace: 'pre' }}>
              {l.map(([t, c], j) => <span key={j} style={{ color: c ?? C.text, fontWeight: c === C.accent && i === 4 ? 700 : 400 }}>{t}</span>)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const Stream: React.FC<{ f: number; at: number; text: string; rate?: number }> = ({ f, at, text, rate = 2.2 }) => {
  const n = clamp(Math.floor((f - at) * rate), 0, text.length)
  return (
    <div style={{ fontSize: 19, lineHeight: '30px', color: C.text, padding: '0 4px' }}>
      {text.slice(0, n)}
      {n < text.length && <span style={{ display: 'inline-block', width: 9, height: 19, marginLeft: 3, background: C.accent, opacity: 0.7, verticalAlign: -3, borderRadius: 2 }} />}
    </div>
  )
}

export const TEXT1 = "I'll add a dark mode toggle to the Settings page and remember the choice between launches."
export const TEXT2 = 'Done. Settings now has a Dark mode toggle that is saved with your preferences, and all 42 tests pass.'

const Status: React.FC<{ f: number }> = ({ f }) => {
  const done = f >= T.done
  const secs = done ? 14 : Math.floor((f - T.send) / 30) + 1
  const tokens = done ? '3.2k' : `${(Math.min(3.2, (f - T.send) * 0.011)).toFixed(1)}k`
  const pose: Pose = done ? { eyes: 'happy', mouth: 'smile', spark: f < T.done + 30 } : f < T.thought ? { eyes: 'up', ex: 1, dots: 1 + (Math.floor(f / 8) % 3), mouth: 'flat' } : { eyes: Math.floor(f / 40) % 4 === 0 ? 'blink' : 'open', ex: Math.floor(f / 25) % 2 ? 1 : -1, mouth: 'flat' }
  const hop = done ? Math.max(0, Math.sin(clamp((f - T.done) / 10) * Math.PI)) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 52, color: C.text3, fontSize: 16.5 }}>
      <Frog size={56} pose={{ ...pose, dy: -Math.round(hop * 3), legs: hop > 0.3 ? 'air' : 'down' }} />
      <span style={{ color: done ? C.text2 : C.text2 }}>{done ? 'Done in 14s' : `Working · ${secs}s`}</span>
      <span>·</span>
      <span style={{ fontFamily: MONO, fontSize: 15 }}>{tokens} tokens</span>
      {done && <><span>·</span><span style={{ fontFamily: MONO, fontSize: 15 }}>$0.04</span></>}
    </div>
  )
}

const Thinking: React.FC<{ f: number }> = ({ f }) => {
  const done = f >= T.thought
  const shimmer = ((f * 9) % 400) - 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 40, padding: '0 12px', fontSize: 17 }}>
      <I.ISpark size={18} color={C.text3} />
      {done ? (
        <span style={{ color: C.text3 }}>Thought for 2s <span style={{ fontSize: 14 }}>›</span></span>
      ) : (
        <span style={{ background: `linear-gradient(90deg, ${C.text3} ${shimmer - 60}px, ${C.text} ${shimmer}px, ${C.text3} ${shimmer + 60}px)`, WebkitBackgroundClip: 'text', color: 'transparent' }}>Thinking…</span>
      )}
    </div>
  )
}

const Composer: React.FC<{ f: number }> = ({ f }) => {
  const text = f < T.send ? typed(f, T.typeStart, T.typeRate, PROMPT) : ''
  const focused = f >= T.clickComposer
  const working = f >= T.send && f < T.done
  const caretOn = Math.floor(f / 15) % 2 === 0 || (f > T.typeStart && f < T.send)
  return (
    <div style={{ padding: '0 0 16px', width: '100%' }}>
      <div style={{ border: `1px solid ${focused && f < T.send ? 'rgba(94,214,126,0.55)' : C.line}`, borderRadius: 18, background: C.surface, boxShadow: '0 1px 2px rgba(0,0,0,0.3), 0 12px 36px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', minHeight: 64, padding: '0 10px 0 20px' }}>
        <div style={{ flex: 1, fontSize: 18.5, color: text ? C.text : C.text3, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {text}
          {focused && f < T.send && caretOn && <span style={{ display: 'inline-block', width: 2, height: 22, background: C.accent, verticalAlign: -4, marginLeft: 1, marginRight: text ? 0 : -3 }} />}
          {!text && <span style={{ color: C.text3 }}>Ask Croo about frogshop…</span>}
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 22, display: 'grid', placeItems: 'center', background: working ? C.active : text ? C.accent : C.active, transform: `scale(${1 - 0.12 * clamp(1 - Math.abs(f - T.send) / 3)})` }}>
          {working ? <I.IStop color={C.text} /> : <I.IArrowUp size={20} color={text ? C.accentInk : C.text3} stroke={2.4} />}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 8px 0', fontSize: 15.5, color: C.text3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 16, background: C.accentSoft, color: C.accent }}>
          <I.IShield size={16} /> Auto <I.IChevron size={14} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 14.5 }}>frogshop</span>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><I.IFile size={15} /> /init</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 16, border: `1px solid ${C.line}`, color: C.text2 }}>
          Opus 4.6 <I.IChevron size={14} />
        </div>
      </div>
    </div>
  )
}

const EmptyState: React.FC<{ f: number }> = ({ f }) => {
  const out = prog(f, T.send - 2, T.send + 10)
  const blink = f % 70 > 64
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', opacity: 1 - out, transform: `translateY(${-out * 30}px)` }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, marginTop: -60 }}>
        <Frog size={130} pose={{ eyes: blink ? 'blink' : 'open', ex: f > 40 ? (Math.floor(f / 30) % 2 ? 1 : 0) : 0 }} />
        <div style={{ fontSize: 30, fontWeight: 650, color: C.text, letterSpacing: -0.4 }}>What are we building in frogshop?</div>
        <div style={{ fontSize: 17, color: C.text3 }}>Croo can read, edit and run things in this folder.</div>
      </div>
    </div>
  )
}

// ---------- git panel ----------

const Checkbox: React.FC<{ on: number }> = ({ on }) => (
  <div style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${on > 0.5 ? C.accent : C.text3}`, background: on > 0.5 ? C.accent : 'transparent', display: 'grid', placeItems: 'center', transform: `scale(${1 + 0.15 * Math.sin(on * Math.PI)})` }}>
    {on > 0.5 && <I.ICheck size={15} color={C.accentInk} stroke={3} />}
  </div>
)

const GitPanel: React.FC<{ f: number }> = ({ f }) => {
  const committed = f >= T.committed
  const pushed = f >= T.pushed
  const msg = committed ? '' : typed(f, T.msgStart, T.msgRate, COMMIT_MSG)
  const files: [string, string, number, number, number][] = [
    ['src/pages/', 'Settings.tsx', 6, 1, T.tick1],
    ['src/', 'theme.ts', 9, 1, T.tick2],
  ]
  const fileOut = prog(f, T.committed, T.committed + 12)
  const toast = pop(f, T.pushed + 2)
  return (
    <div style={{ width: GITW, flex: 'none', height: '100%', borderLeft: `1px solid ${C.line}`, background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
      <div style={{ height: 60, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 14, color: C.text }}>
        <span style={{ fontSize: 19, fontWeight: 600 }}>Git</span>
        <div style={{ flex: 1 }} />
        <I.IRefresh size={19} color={C.text2} />
        <I.IX size={19} color={C.text2} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 22px 16px', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 12px', borderRadius: 14, background: C.bgSoft, color: C.text, fontFamily: MONO, fontSize: 15.5, fontWeight: 600 }}>
          <I.IGit size={16} /> main
        </div>
        <span style={{ color: C.text3, fontSize: 15.5 }}>{pushed ? 'in sync with origin' : committed ? '1 commit to push' : 'origin/main'}</span>
      </div>
      <div style={{ flex: 1, position: 'relative', padding: '10px 0' }}>
        <div style={{ opacity: 1 - fileOut, transform: `translateY(${-fileOut * 20}px)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 22px', color: C.text2, fontSize: 16 }}>
            <Checkbox on={prog(f, T.tick2, T.tick2 + 6)} /> 2 changed files
          </div>
          {files.map(([dir, name, add, del, tick]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 22px', fontSize: 16.5 }}>
              <Checkbox on={prog(f, tick, tick + 6)} />
              <span style={{ width: 22, height: 22, borderRadius: 5, background: 'rgba(232,180,74,0.15)', color: C.warn, fontFamily: MONO, fontSize: 13, display: 'grid', placeItems: 'center', fontWeight: 700 }}>M</span>
              <span style={{ color: C.text3 }}>{dir}<span style={{ color: C.text }}>{name}</span></span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: MONO, fontSize: 14.5, color: C.accent }}>+{add}</span>
              <span style={{ fontFamily: MONO, fontSize: 14.5, color: C.danger }}>−{del}</span>
            </div>
          ))}
        </div>
        {committed && (
          <div style={{ position: 'absolute', left: 22, right: 22, top: 20, opacity: prog(f, T.committed + 6, T.committed + 16), display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, background: C.bgSoft, border: `1px solid ${C.line}` }}>
              <I.IGit size={18} color={C.accent} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ color: C.text, fontSize: 16 }}>{COMMIT_MSG}</span>
                <span style={{ color: C.text3, fontFamily: MONO, fontSize: 13.5 }}>a3f9c21 · just now</span>
              </div>
            </div>
            <div style={{ color: C.text3, fontSize: 15, padding: '6px 4px' }}>Nothing else to commit.</div>
          </div>
        )}
        {toast > 0 && (
          <div style={{ position: 'absolute', left: 22, right: 22, bottom: 14, padding: '13px 16px', borderRadius: 12, background: C.accentSoft, border: '1px solid rgba(94,214,126,0.35)', color: C.accent, display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, opacity: clamp(toast * 1.4), transform: `translateY(${(1 - toast) * 16}px)` }}>
            <I.ICheck size={18} /> Pushed to origin/main
          </div>
        )}
      </div>
      <div style={{ padding: '14px 18px 18px', borderTop: `1px solid ${C.line}` }}>
        <div style={{ height: 76, borderRadius: 12, border: `1px solid ${f >= T.clickMsg && !committed ? 'rgba(94,214,126,0.55)' : C.line}`, background: C.surface, padding: '13px 16px', fontSize: 16.5, color: msg ? C.text : C.text3, boxSizing: 'border-box' }}>
          {msg || 'Commit message'}
          {f >= T.clickMsg && !committed && Math.floor(f / 12) % 2 === 0 && <span style={{ display: 'inline-block', width: 2, height: 19, background: C.accent, verticalAlign: -3, marginLeft: 1 }} />}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1, height: 46, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 17, fontWeight: 600, background: committed ? C.accentSoft : C.accent, color: committed ? C.accent : C.accentInk, transform: `scale(${1 - 0.06 * clamp(1 - Math.abs(f - T.clickCommit) / 3)})` }}>
            <I.ICheck size={18} stroke={2.4} /> {committed ? 'Committed' : 'Commit (2)'}
          </div>
          <div style={{ flex: 1, height: 46, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 17, fontWeight: 600, border: `1px solid ${committed && !pushed ? 'rgba(94,214,126,0.6)' : C.line}`, color: pushed ? C.text3 : C.text, transform: `scale(${1 - 0.06 * clamp(1 - Math.abs(f - T.clickPush) / 3)})` }}>
            <I.IPush size={18} /> {pushed ? 'Pushed' : 'Push'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- cursor ----------

const Cursor: React.FC<{ f: number }> = ({ f }) => {
  const [x, y] = keyframes(f, CURSOR)
  const visible = (f > 14 && f < T.typeStart + 4) || f > 446
  const fade = f < 30 ? prog(f, 14, 20) : f < 300 ? 1 - prog(f, T.typeStart, T.typeStart + 4) : prog(f, 446, 452)
  if (!visible) return null
  const press = Math.max(0, ...CLICKS.map((c) => 1 - Math.abs(f - c) / 3))
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" style={{ position: 'absolute', left: x - 6, top: y - 3, opacity: fade, transform: `scale(${1 - press * 0.15})`, transformOrigin: '6px 3px', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}>
      <path d="M5 2.5l13 11.2-6.1.6 3.6 7.4-2.6 1.2-3.5-7.5L5 19.6z" fill="black" stroke="white" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

// ---------- the scene ----------

export const AppScene: React.FC = () => {
  const f = useCurrentFrame()
  const [cx, cy, s] = keyframes(f, CAM)
  const enter = pop(f, 0, 20, 90)
  const gitP = pop(f, T.gitOpen, 20, 140)
  const working = f >= T.send && f < T.done
  const sidebarFrog: Pose = working ? { eyes: 'up', ex: 1, dots: 1 + (Math.floor(f / 8) % 3), mouth: 'flat' } : f >= T.done ? { eyes: 'happy' } : { eyes: f % 80 > 74 ? 'blink' : 'open' }
  const badge = pop(f, T.edit + 50)
  const exitP = prog(f, T.end - 16, T.end, easeOut)

  return (
    <AbsoluteFill style={{ fontFamily: FONT, overflow: 'hidden', background: '#0a1411' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${960 - cx * s}px, ${540 - cy * s}px) scale(${s})` }}>
        <Wallpaper f={f} />
        <MenuBar />
        <Dock />
        <div
          style={{
            position: 'absolute', left: WX, top: WY, width: WW, height: WH, borderRadius: 14, overflow: 'hidden', display: 'flex',
            background: C.bg, border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 10px 30px rgba(0,0,0,0.4)',
            opacity: clamp(enter * 1.3), transform: `translateY(${(1 - enter) * 60}px) scale(${0.94 + 0.06 * enter})`,
          }}
        >
          <Sidebar f={f} frogPose={sidebarFrog} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ height: 60, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 20px 0 28px', gap: 10, color: C.text }}>
              <span style={{ fontSize: 17.5, fontWeight: 600 }}>{f >= T.send + 6 ? 'Dark mode toggle' : 'New chat'}</span>
              <span style={{ color: C.text3 }}>·</span>
              <span style={{ color: C.text3, fontSize: 16.5 }}>frogshop</span>
              <div style={{ flex: 1 }} />
              <Btn><I.IFolder size={20} /></Btn>
              <Btn active={f >= T.gitOpen}>
                <I.IGit size={20} />
                {badge > 0 && <div style={{ position: 'absolute', top: -6, right: -8, minWidth: 20, height: 20, borderRadius: 10, background: C.accent, color: C.accentInk, fontSize: 12.5, fontWeight: 700, display: 'grid', placeItems: 'center', transform: `scale(${badge})` }}>2</div>}
              </Btn>
              <Btn><I.IGlobe size={20} /></Btn>
              <Btn><I.ITerm size={20} /></Btn>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <EmptyState f={f} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', overflow: 'hidden', maskImage: 'linear-gradient(transparent 0, black 50px)' }}>
                <div style={{ width: '100%', maxWidth: 860, padding: '0 40px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <Item f={f} at={T.send + 4} h={56}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ padding: '15px 20px', borderRadius: '18px 18px 6px 18px', background: C.active, color: C.text, fontSize: 18.5 }}>{PROMPT}</div>
                    </div>
                  </Item>
                  <Item f={f} at={T.think} h={40}><Thinking f={f} /></Item>
                  <Item f={f} at={T.text1} h={60}><Stream f={f} at={T.text1} text={TEXT1} rate={3} /></Item>
                  <Item f={f} at={T.read} h={40} gap={4}><Tool f={f} at={T.read} icon={<I.IFile size={18} />} verb="Read" arg="src/pages/Settings.tsx" /></Item>
                  <Item f={f} at={T.search} h={40} gap={10}><Tool f={f} at={T.search} icon={<I.ISearch size={18} />} verb="Searched" arg='"theme"' extra="· 6 results" /></Item>
                  <Item f={f} at={T.edit} h={300}><DiffCard f={f} /></Item>
                  <Item f={f} at={T.run} h={226}><RunCard f={f} /></Item>
                  <Item f={f} at={T.text2} h={60}><Stream f={f} at={T.text2} text={TEXT2} rate={3} /></Item>
                  <Item f={f} at={T.send + 8} h={52} gap={6}><Status f={f} /></Item>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 40px' }}>
              <div style={{ width: '100%', maxWidth: 820 }}><Composer f={f} /></div>
            </div>
          </div>
          <div style={{ width: GITW * gitP, flex: 'none', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: GITW, transform: `translateX(${(1 - gitP) * 60}px)`, opacity: clamp(gitP * 1.5) }}>
              <GitPanel f={f} />
            </div>
          </div>
        </div>
        <Cursor f={f} />
      </div>
      <AbsoluteFill style={{ background: '#0b1310', opacity: exitP }} />
    </AbsoluteFill>
  )
}
