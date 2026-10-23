// Pieces of Croo's UI recreated at the app's real sizes (14px text, 30px buttons), using the dark theme.
import React from 'react'
import { B, MONO } from './brand'
import * as I from '../Icons'

type S = React.CSSProperties

export const IClip = (p: { size?: number; color?: string }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke={p.color ?? 'currentColor'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6" />
  </svg>
)
export const IMic = (p: { size?: number; color?: string }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke={p.color ?? 'currentColor'} strokeWidth={1.8} strokeLinecap="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
)
export const IBolt = (p: { size?: number; color?: string }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke={p.color ?? 'currentColor'} strokeWidth={1.8} strokeLinejoin="round">
    <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />
  </svg>
)
export const IShieldPlain = (p: { size?: number; color?: string }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke={p.color ?? 'currentColor'} strokeWidth={1.8} strokeLinejoin="round">
    <path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" />
  </svg>
)

export const Btn: React.FC<{ kind?: 'primary' | 'ghost' | 'plain' | 'accent'; small?: boolean; style?: S; children: React.ReactNode }> = ({ kind = 'plain', small, style, children }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      height: small ? 26 : 30,
      padding: small ? '0 10px' : '0 12px',
      borderRadius: 7,
      border: `1px solid ${kind === 'primary' || kind === 'accent' ? 'transparent' : kind === 'ghost' ? 'transparent' : B.lineStrong}`,
      background: kind === 'primary' ? B.primary : kind === 'accent' ? B.accent : 'transparent',
      color: kind === 'primary' ? B.primaryInk : kind === 'accent' ? B.accentInk : kind === 'ghost' ? B.text2 : B.text,
      fontWeight: 500,
      fontSize: small ? 13 : 14,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </div>
)

export const Pill: React.FC<{ soft?: boolean; children: React.ReactNode; style?: S }> = ({ soft, children, style }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 600, background: soft ? B.active : B.accentSoft, color: soft ? B.text2 : B.accent, ...style }}>{children}</span>
)

export const Check: React.FC<{ on?: boolean; size?: number }> = ({ on = true, size = 16 }) => (
  <div style={{ width: size, height: size, borderRadius: 4, flex: 'none', display: 'grid', placeItems: 'center', background: on ? B.accent : 'transparent', border: on ? 'none' : `1.5px solid ${B.lineStrong}` }}>
    {on && <I.ICheck size={size - 4} color={B.accentInk} stroke={3} />}
  </div>
)

/** The left rail: window buttons, Chat/Code switch, folders and chats. */
export const Sidebar: React.FC<{ width?: number; active: string; chats: string[] }> = ({ width = 230, active, chats }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width, background: B.sidebar, borderRight: `1px solid ${B.line}` }}>
    <div style={{ position: 'absolute', left: 92, top: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', padding: 2, borderRadius: 8, background: B.hover }}>
        <div style={{ width: 30, height: 24, display: 'grid', placeItems: 'center', color: B.text3 }}><I.IChat size={15} /></div>
        <div style={{ width: 30, height: 24, display: 'grid', placeItems: 'center', borderRadius: 6, background: B.active, color: B.text }}><I.ICode size={15} /></div>
      </div>
      <div style={{ width: 26, display: 'grid', placeItems: 'center', color: B.text3 }}><I.ISearch size={15} /></div>
    </div>
    <div style={{ position: 'absolute', left: 16, right: 14, top: 58, display: 'flex', justifyContent: 'space-between', color: B.text3, fontSize: 12.5 }}>
      <span>Folders</span>
      <I.IPlus size={14} />
    </div>
    <div style={{ position: 'absolute', left: 12, right: 10, top: 82, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 28, padding: '0 6px', color: B.text, fontWeight: 500 }}>
        <I.IChevron size={12} color={B.text3} />
        <I.IFolder size={15} color={B.text2} />
        frog-shop
      </div>
      {chats.map((c) => (
        <div key={c} style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 10px', marginLeft: 18, borderRadius: 7, background: c === active ? B.active : 'transparent', color: c === active ? B.text : B.text2, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {c}
        </div>
      ))}
    </div>
    <div style={{ position: 'absolute', left: 14, bottom: 14, display: 'flex', alignItems: 'center', gap: 9, color: B.text, fontSize: 13.5 }}>
      <div style={{ width: 26, height: 26, borderRadius: 13, background: '#6fc68a', color: '#0f2416', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>S</div>
      Sam
    </div>
  </div>
)

/** The chat header: title, folder, the panel buttons and the context ring. */
export const ChatHeader: React.FC<{ left: number; title: string; gitBadge?: number; gitOn?: boolean; ring?: number }> = ({ left, title, gitBadge, gitOn, ring = 0.18 }) => (
  <div style={{ position: 'absolute', left, right: 0, top: 0, height: 48, display: 'flex', alignItems: 'center', padding: '0 14px 0 20px', borderBottom: `1px solid ${B.line}` }}>
    <span style={{ fontWeight: 500 }}>{title}</span>
    <span style={{ color: B.text3, margin: '0 8px' }}>·</span>
    <span style={{ color: B.text3 }}>frog-shop</span>
    <div style={{ flex: 1 }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: B.text2 }}>
      {[I.IFolder, I.IGit, I.IGlobe, I.ITerm].map((Icon, i) => (
        <div key={i} style={{ position: 'relative', width: 30, height: 28, display: 'grid', placeItems: 'center', borderRadius: 7, background: i === 1 && gitOn ? B.active : 'transparent' }}>
          <Icon size={16} />
          {i === 1 && gitBadge ? <div style={{ position: 'absolute', right: -1, top: -3, minWidth: 15, height: 15, borderRadius: 8, background: B.accent, color: B.accentInk, fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{gitBadge}</div> : null}
        </div>
      ))}
      <svg width={30} height={28} viewBox="0 0 30 28">
        <circle cx={15} cy={14} r={6.5} fill="none" stroke={B.line} strokeWidth={2} />
        <circle cx={15} cy={14} r={6.5} fill="none" stroke={B.text2} strokeWidth={2} strokeDasharray={`${ring * 40.8} 41`} transform="rotate(-90 15 14)" strokeLinecap="round" />
      </svg>
    </div>
  </div>
)

/** A finished (or running) tool step, like "Read src/cart.ts". */
export const ToolRow: React.FC<{ icon: React.ReactNode; verb: string; arg: string; done?: boolean; stat?: [number, number]; style?: S }> = ({ icon, verb, arg, done = true, stat, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 26, color: B.text2, ...style }}>
    <span style={{ color: B.text3, display: 'grid' }}>{icon}</span>
    <span style={{ fontWeight: 500, color: done ? B.text : B.text2 }}>{verb}</span>
    <span style={{ fontFamily: MONO, fontSize: 12.5, color: B.text2 }}>{arg}</span>
    {stat && (
      <span style={{ fontFamily: MONO, fontSize: 12, marginLeft: 2 }}>
        <b style={{ color: B.accent, fontWeight: 600 }}>+{stat[0]}</b> <b style={{ color: B.danger, fontWeight: 600 }}>−{stat[1]}</b>
      </span>
    )}
    <div style={{ flex: 1 }} />
    {done && <I.ICheck size={14} color={B.accent} stroke={2.4} />}
  </div>
)

// ---- a tiny highlighter, enough for the TypeScript lines shown in the video ----

const KW = new Set(['export', 'function', 'return', 'const', 'interface', 'number', 'import', 'from', 'test', 'expect'])
export const Code: React.FC<{ line: string }> = ({ line }) => {
  if (/^\s*(\/\/|\/\*\*)/.test(line)) return <span style={{ color: B.comment }}>{line}</span>
  const parts = line.split(/(\b\w+\b|"[^"]*"|'[^']*')/)
  return (
    <>
      {parts.map((p, i) => {
        const next = parts[i + 1] ?? ''
        const color = KW.has(p) ? B.kw : /^\d/.test(p) ? B.num : /^["']/.test(p) ? B.str : /^\w+$/.test(p) && next.startsWith('(') ? B.fn : /^[A-Z]\w*$/.test(p) ? '#f0d37a' : undefined
        return color ? <span key={i} style={{ color }}>{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>
      })}
    </>
  )
}

export type DiffLine = [kind: ' ' | '+' | '-', no: number, text: string]

/** An inline diff, one line per row; `shown` reveals rows top to bottom (fractional fades the last). */
export const Diff: React.FC<{ lines: DiffLine[]; shown?: number; size?: number; style?: S }> = ({ lines, shown = lines.length, size = 12, style }) => (
  <div style={{ borderRadius: 8, border: `1px solid ${B.line}`, background: B.sidebar, padding: '6px 0', fontFamily: MONO, fontSize: size, lineHeight: 1.6, overflow: 'hidden', ...style }}>
    {lines.map(([k, n, t], i) => (
      <div key={i} style={{ display: 'flex', whiteSpace: 'pre', background: k === '+' ? B.addBg : k === '-' ? B.delBg : 'transparent', opacity: Math.max(0, Math.min(1, shown - i)) }}>
        <span style={{ width: 34, textAlign: 'right', color: B.text3, flex: 'none' }}>{n}</span>
        <span style={{ width: 22, textAlign: 'center', color: k === '+' ? B.accent : k === '-' ? B.danger : B.text3, flex: 'none' }}>{k === ' ' ? '' : k === '-' ? '−' : '+'}</span>
        <span style={{ color: B.text }}><Code line={t} /></span>
      </div>
    ))}
  </div>
)

export const CART_DIFF: DiffLine[] = [
  ['-', 7, 'export function total(items: Item[]): number {'],
  ['-', 8, '  return items.reduce((sum, i) => sum + i.price * i.qty, 0)'],
  ['+', 7, '/** Sum of the cart, with an optional discount between 0 and 1. */'],
  ['+', 8, 'export function total(items: Item[], discount = 0): number {'],
  ['+', 9, '  const sum = items.reduce((s, i) => s + i.price * i.qty, 0)'],
  ['+', 10, '  return Math.round(sum * (1 - discount) * 100) / 100'],
]

/** The message box and the row of chips under it. */
export const Composer: React.FC<{ left: number; width: number; bottom?: number; text?: string; placeholder?: string; mode?: string; modeGlow?: number; model?: string }> = ({
  left,
  width,
  bottom = 14,
  text,
  placeholder = 'Ask Croo about frog-shop…',
  mode = 'Auto',
  modeGlow = 0,
  model = 'claude-opus-5-5',
}) => (
  <div style={{ position: 'absolute', left, width, bottom }}>
    <div style={{ height: 64, borderRadius: 12, border: `1px solid ${B.lineStrong}`, background: B.surface, position: 'relative' }}>
      <div style={{ position: 'absolute', left: 14, top: 12, color: B.text3, display: 'grid' }}><IClip size={15} /></div>
      <div style={{ position: 'absolute', left: 40, right: 80, top: 10, fontSize: 14, color: text ? B.text : B.text3, whiteSpace: 'nowrap', overflow: 'hidden' }}>{text || placeholder}</div>
      <div style={{ position: 'absolute', right: 48, bottom: 14, color: B.text3, display: 'grid' }}><IMic size={15} /></div>
      <div style={{ position: 'absolute', right: 10, bottom: 8, width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: text ? B.primary : B.active, color: text ? B.primaryInk : B.text3 }}>
        <I.IArrowUp size={15} stroke={2.2} />
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 30, padding: '0 6px', color: B.text2, fontSize: 12.5 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 6px', margin: '0 -6px', borderRadius: 6, background: `rgba(92,201,131,${0.14 * modeGlow})`, color: modeGlow ? B.text : B.text2 }}>
        <I.IShield size={13} color={B.accent} /> {mode} <I.IChevron size={11} />
      </span>
      <span style={{ fontFamily: MONO, fontSize: 12, color: B.text3 }}>frog-shop</span>
      <div style={{ flex: 1 }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, border: `1px solid ${B.line}` }}>
        {model} <I.IChevron size={11} />
      </span>
    </div>
  </div>
)

/** The user's message, right-aligned. */
export const Bubble: React.FC<{ children: React.ReactNode; style?: S }> = ({ children, style }) => (
  <div style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: '8px 13px', borderRadius: 10, background: B.bgSoft, ...style }}>{children}</div>
)
