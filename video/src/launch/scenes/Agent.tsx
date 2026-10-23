// Feature 1: send a prompt and watch the agent read, search, edit and run the tests.
import React from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { B, MONO } from '../brand'
import { CONFIG } from '../config'
import { enter } from '../motion'
import { Cursor } from '../components/Cursor'
import { FeatureFrame, TrafficLights } from '../components/FeatureFrame'
import { Headline } from '../components/Headline'
import { Layer, Scene } from '../components/Scene'
import { Bubble, CART_DIFF, ChatHeader, Composer, Diff, Sidebar, ToolRow } from '../ui'
import * as I from '../../Icons'

const S = CONFIG.scenes.agent
const PROMPT = 'Add an optional discount to the cart total, then run the tests'
const COL = { left: 349, width: 640 }
const SEND: [number, number] = [965, 503]
/** A step shows its running verb for this long before it finishes. */
const RUNNING = 10

export const Agent: React.FC = () => {
  const f = useCurrentFrame()
  const sent = f >= S.send
  const step = (at: number) => ({ shown: f >= at, done: f >= at + RUNNING, style: enter(f, at, 8) })
  const read = step(S.read)
  const search = step(S.search)
  const edit = step(S.edit)
  const run = step(S.run)
  const out = f >= S.output
  return (
    <Scene frames={S.frames} glow={[50, 30]}>
      <Layer depth={1.3}>
        <Headline
          at={S.textAt}
          eyebrow="Code mode"
          title={[{ text: 'It reads, edits and ' }, { text: 'runs your code.', color: B.text2 }]}
          sub="Every step is right there: files, diffs, commands and output."
          style={{ position: 'absolute', left: 0, right: 0, top: 84 }}
        />
      </Layer>
      <Layer>
        <FeatureFrame x={240} y={300} w={1440} h={740} at={S.frameAt} scale={1.3}>
          <Sidebar active="Add a cart discount" chats={['Add a cart discount', 'Show me around frog-shop']} />
          <TrafficLights />
          <ChatHeader left={230} title="Add a cart discount" gitBadge={f >= S.edit + RUNNING ? 1 : undefined} ring={interpolate(f, [S.send, S.done], [0.04, 0.22], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
          <div style={{ position: 'absolute', top: 62, left: COL.left, width: COL.width, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Bubble style={{ opacity: sent ? 1 : 0, ...(sent ? enter(f, S.send + 1, 10) : {}) }}>{PROMPT}</Bubble>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 22, color: B.text3, ...enter(f, S.thought, 8) }}>
              <I.IChevronR size={12} />
              {f >= S.read - 2 ? 'Thought for 4s' : 'Thinking…'}
            </div>
            <ToolRow style={read.style} done={read.done} icon={<I.IFile size={15} />} verb={read.done ? 'Read' : 'Reading'} arg="src/cart.ts" />
            <ToolRow style={search.style} done={search.done} icon={<I.ISearch size={15} />} verb={search.done ? 'Searched' : 'Searching'} arg="total(" />
            <ToolRow style={edit.style} done={edit.done} icon={<I.IPencil size={15} />} verb={edit.done ? 'Edited' : 'Editing'} arg="src/cart.ts" stat={edit.done ? [4, 2] : undefined} />
            <Diff lines={CART_DIFF} shown={(f - S.diff) / 4} size={12} style={{ opacity: f >= S.diff ? 1 : 0, marginLeft: 24 }} />
            <ToolRow style={run.style} done={run.done} icon={<I.ITerm size={15} />} verb={run.done ? 'Ran' : 'Running'} arg="npm test" />
            <div style={{ marginLeft: 24, padding: '7px 12px', borderRadius: 8, background: B.sidebar, border: `1px solid ${B.line}`, fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: B.text2, ...enter(f, S.output, 8) }}>
              <div style={{ opacity: out ? 1 : 0 }}>
                <span style={{ color: B.accent }}>✓</span> src/cart.test.ts <span style={{ color: B.text3 }}>(12 tests) 41ms</span>
              </div>
              <div style={{ opacity: f >= S.output + 6 ? 1 : 0 }}>
                Tests <span style={{ color: B.accent, fontWeight: 600 }}>12 passed</span> <span style={{ color: B.text3 }}>(12) · exit 0 · 0.9s</span>
              </div>
            </div>
          </div>
          <Composer left={COL.left} width={COL.width} text={sent ? '' : PROMPT} />
          <Cursor points={[[S.cursorIn, 720, 330], [S.send - 4, ...SEND], [S.send + 40, 1040, 400]]} clicks={[S.send]} />
        </FeatureFrame>
      </Layer>
    </Scene>
  )
}
