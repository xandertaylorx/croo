// Feature 3: the Git panel. Write the message with the sparkle, commit, and the push is one click away.
import React from 'react'
import { useCurrentFrame } from 'remotion'
import { B, MONO } from '../brand'
import { CONFIG } from '../config'
import { enter, fade, typed } from '../motion'
import { Cursor } from '../components/Cursor'
import { FeatureFrame, TrafficLights } from '../components/FeatureFrame'
import { Headline } from '../components/Headline'
import { Layer, Scene } from '../components/Scene'
import { Bubble, CART_DIFF, ChatHeader, Check, Diff, Sidebar, ToolRow } from '../ui'
import * as I from '../../Icons'

const S = CONFIG.scenes.git
const MSG = 'Add an optional discount to the cart total'
const PANEL = { left: 668, width: 440 }
const SPARKLE: [number, number] = [1080, 456]
const COMMIT: [number, number] = [770, 534]

const FILES: [status: string, dir: string, name: string, add: number, del: number][] = [
  ['M', 'src/', 'cart.ts', 4, 2],
  ['A', 'src/', 'cart.test.ts', 18, 0],
  ['M', '', 'README.md', 2, 1],
]

export const Git: React.FC = () => {
  const f = useCurrentFrame()
  const committed = f >= S.committed
  const msg = committed ? '' : typed(f, S.typeFrom, S.typeRate, MSG)
  const gone = fade(f, S.committed, 10)
  return (
    <Scene frames={S.frames} glow={[60, 30]}>
      <Layer depth={1.3}>
        <Headline
          at={S.textAt}
          eyebrow="Git, built in"
          title={[{ text: 'Review, commit ' }, { text: 'and push.', color: B.text2 }]}
          sub="Pick the files, read the diff, write the message. No terminal needed."
          style={{ position: 'absolute', left: 0, right: 0, top: 84 }}
        />
      </Layer>
      <Layer>
        <FeatureFrame x={240} y={300} w={1440} h={740} at={S.frameAt} scale={1.3}>
          <Sidebar active="Add a cart discount" chats={['Add a cart discount', 'Show me around frog-shop']} />
          <TrafficLights />
          <div style={{ position: 'absolute', left: 0, top: 0, width: PANEL.left, height: '100%' }}>
            <ChatHeader left={230} title="Add a cart discount" gitBadge={committed ? undefined : 3} gitOn ring={0.3} />
            <div style={{ position: 'absolute', top: 62, left: 254, width: 390, display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.75 }}>
              <Bubble>Add an optional discount to the cart total, then run the tests</Bubble>
              <ToolRow icon={<I.IPencil size={15} />} verb="Edited" arg="src/cart.ts" stat={[4, 2]} />
              <ToolRow icon={<I.IPencil size={15} />} verb="Wrote" arg="src/cart.test.ts" />
              <ToolRow icon={<I.ITerm size={15} />} verb="Ran" arg="npm test" />
              <div style={{ lineHeight: 1.55, marginTop: 6 }}>Added an optional <code style={{ fontFamily: MONO, fontSize: 12.5, padding: '1px 5px', borderRadius: 5, background: B.active }}>discount</code> to <code style={{ fontFamily: MONO, fontSize: 12.5, padding: '1px 5px', borderRadius: 5, background: B.active }}>total()</code> and tests for it. All 12 tests pass.</div>
            </div>
          </div>

          {/* the Git panel */}
          <div style={{ position: 'absolute', left: PANEL.left, width: PANEL.width, top: 0, bottom: 0, background: B.bg, borderLeft: `1px solid ${B.line}` }}>
            <div style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 14px 0 18px', fontWeight: 600, borderBottom: `1px solid ${B.line}` }}>
              Git
              <div style={{ flex: 1 }} />
              <span style={{ color: B.text3, display: 'flex', gap: 14 }}><I.IRefresh size={15} /><I.IX size={15} /></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 16px', borderBottom: `1px solid ${B.line}` }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 7, background: B.active, fontFamily: MONO, fontSize: 12.5, fontWeight: 600 }}>
                <I.IGit size={13} /> main
              </span>
              <span style={{ color: committed ? B.accent : B.text3, fontSize: 13 }}>{committed ? '1 commit to push' : 'up to date with origin'}</span>
            </div>
            <div style={{ position: 'relative', padding: '10px 14px' }}>
              <div style={{ opacity: 1 - gone }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 28, color: B.text2, fontSize: 13 }}>
                  <Check /> 3 changed files
                </div>
                {FILES.map(([st, dir, name, add, del], i) => (
                  <React.Fragment key={name}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30 }}>
                      <Check />
                      <span style={{ width: 16, height: 16, borderRadius: 4, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: 10, fontWeight: 700, background: st === 'A' ? B.accentSoft : 'rgba(221,176,87,0.14)', color: st === 'A' ? B.accent : B.warn }}>{st === 'A' ? 'U' : st}</span>
                      <span><span style={{ color: B.text3 }}>{dir}</span>{name}</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontFamily: MONO, fontSize: 12 }}>
                        <b style={{ color: B.accent, fontWeight: 600 }}>+{add}</b>{del ? <b style={{ color: B.danger, fontWeight: 600 }}> −{del}</b> : null}
                      </span>
                      {i === 0 ? <I.IChevron size={13} color={B.text3} /> : <I.IChevronR size={13} color={B.text3} />}
                    </div>
                    {i === 0 && <Diff lines={CART_DIFF} size={10.5} style={{ margin: '2px 0 6px 26px' }} />}
                  </React.Fragment>
                ))}
              </div>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 90, textAlign: 'center', color: B.text3, opacity: gone, ...(committed ? enter(f, S.committed + 4, 10) : {}) }}>
                <I.ICheck size={22} color={B.accent} stroke={2.2} />
                <div style={{ marginTop: 8 }}>Committed <span style={{ fontFamily: MONO, fontSize: 12.5, color: B.text2 }}>3f9c2e1</span></div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Nothing else to commit.</div>
              </div>
            </div>

            <div style={{ position: 'absolute', left: 14, right: 14, bottom: 60, height: 70, borderRadius: 10, border: `1px solid ${msg ? B.lineStrong : B.line}`, background: B.surface, padding: '10px 12px', fontSize: 13.5, color: msg ? B.text : B.text3 }}>
              {msg || 'Commit message'}
              {msg && msg.length < MSG.length ? <span style={{ display: 'inline-block', width: 1.5, height: 16, marginLeft: 1, verticalAlign: -3, background: B.text }} /> : null}
              <div style={{ position: 'absolute', right: 10, top: 9, color: f >= S.sparkle && f < S.typeFrom + MSG.length * S.typeRate ? B.accent : B.text3 }}>
                <I.ISpark size={16} />
              </div>
            </div>
            <div style={{ position: 'absolute', left: 14, right: 14, bottom: 20, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1.2, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 500, background: committed ? B.active : B.primary, color: committed ? B.text3 : B.primaryInk, opacity: f >= S.commit - 2 && f < S.committed ? 0.8 : 1 }}>
                <I.ICheck size={14} stroke={2.2} /> Commit{committed ? '' : ' (3)'}
              </div>
              <div style={{ flex: 1, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 500, border: `1px solid ${committed ? 'transparent' : B.lineStrong}`, background: `rgba(92,201,131,${fade(f, S.committed, 14)})`, color: committed ? B.accentInk : B.text }}>
                <I.IPush size={14} /> Push{committed ? ' ↑1' : ''}
              </div>
              <div style={{ width: 36, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', border: `1px solid ${B.lineStrong}`, color: B.text2 }}>
                <I.IChevron size={14} />
              </div>
            </div>
          </div>
          <Cursor points={[[S.cursorIn, 900, 330], [S.sparkle - 5, ...SPARKLE], [S.typeFrom + 30, ...SPARKLE], [S.commit - 6, ...COMMIT], [S.push - 10, COMMIT[0] + 14, COMMIT[1] + 4], [S.push + 16, 955, 534]]} clicks={[S.sparkle, S.commit]} />
        </FeatureFrame>
      </Layer>
    </Scene>
  )
}
