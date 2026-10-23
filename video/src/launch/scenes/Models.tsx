// Feature 4: Settings → Providers. Bring a key for any provider, or switch to the model on this Mac.
import React from 'react'
import { useCurrentFrame } from 'remotion'
import { B, MONO } from '../brand'
import { CONFIG } from '../config'
import { enter } from '../motion'
import { Cursor } from '../components/Cursor'
import { FeatureFrame, TrafficLights } from '../components/FeatureFrame'
import { Headline } from '../components/Headline'
import { Layer, Scene } from '../components/Scene'
import { Btn, Pill } from '../ui'

const S = CONFIG.scenes.models
const NAV = 200
const USE: [number, number] = [691, 157]

const Card: React.FC<{ active: boolean; at: number; children: React.ReactNode }> = ({ active, at, children }) => {
  const f = useCurrentFrame()
  return <div style={{ borderRadius: 10, border: `1px solid ${active ? 'rgba(92,201,131,0.45)' : B.line}`, background: active ? 'rgba(92,201,131,0.05)' : B.surface, padding: '12px 14px', ...enter(f, at, 10) }}>{children}</div>
}

const Top: React.FC<{ name: React.ReactNode; host: string; right: React.ReactNode }> = ({ name, host, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>{name}</span>
      <span style={{ color: B.text3, fontSize: 12.5 }}>{host}</span>
    </div>
    <div style={{ flex: 1 }} />
    {right}
  </div>
)

const Row: React.FC<{ label: string; value: React.ReactNode; btn: string }> = ({ label, value, btn }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 34, borderTop: `1px solid ${B.line}`, marginTop: 10, paddingTop: 10, fontSize: 13 }}>
    <span style={{ width: 60, color: B.text3 }}>{label}</span>
    <span style={{ flex: 1, color: B.text2 }}>{value}</span>
    <Btn small>{btn}</Btn>
  </div>
)

export const Models: React.FC = () => {
  const f = useCurrentFrame()
  const local = f >= S.used
  const at = S.frameAt + 10
  return (
    <Scene frames={S.frames} glow={[72, 46]}>
      <Layer depth={1.3}>
        <Headline
          at={S.textAt}
          align="left"
          size={68}
          eyebrow="Providers"
          title={[{ text: 'Any model.\nYour key.\n' }, { text: 'Or fully local.', color: B.text2 }]}
          sub={'Claude, OpenAI, Gemini, Ollama,\nor a free model on your Mac.'}
          style={{ position: 'absolute', left: 1180, top: 300, width: 640 }}
        />
      </Layer>
      <Layer>
        <FeatureFrame x={120} y={170} w={980} h={740} at={S.frameAt} scale={1.3}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: NAV, background: B.sidebar, borderRight: `1px solid ${B.line}`, padding: '52px 12px' }}>
            <div style={{ fontWeight: 600, fontSize: 16, padding: '0 10px 14px' }}>Settings</div>
            {['Providers', 'General', 'Memory', 'MCP', 'About'].map((n) => (
              <div key={n} style={{ height: 32, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', borderRadius: 7, background: n === 'Providers' ? B.active : 'transparent', color: n === 'Providers' ? B.text : B.text2 }}>
                {n}
              </div>
            ))}
          </div>
          <TrafficLights />
          <div style={{ position: 'absolute', left: NAV + 28, right: 28, top: 30 }}>
            <div style={{ fontSize: 21, fontWeight: 600 }}>Providers</div>
            <div style={{ color: B.text3, fontSize: 13.5, lineHeight: 1.5, marginTop: 6 }}>Where Croo sends your messages. Run a model on this Mac, bring your own key, or point it at a local server.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              <Card active={local} at={at}>
                <Top
                  name={<>Qwen3 4B Instruct <Pill soft>On this Mac</Pill></>}
                  host="Free, private, works offline."
                  right={local ? <Pill style={enter(f, S.used, 6)}>Active</Pill> : <Btn small kind="primary" style={{ opacity: f >= S.use - 2 ? 0.8 : 1 }}>Use</Btn>}
                />
              </Card>
              <Card active={!local} at={at + 5}>
                <Top name="Anthropic" host="anthropic" right={local ? <Btn small>Use</Btn> : <Pill>Active</Pill>} />
                <Row label="Model" value={<span style={{ fontFamily: MONO, fontSize: 12.5, color: B.text }}>claude-opus-5-5</span>} btn="Change" />
                <Row label="API key" value={<>sk-ant-…4f2a<em style={{ color: B.text3 }}> · encrypted in your keychain</em></>} btn="Update" />
              </Card>
              <Card active={false} at={at + 10}>
                <Top name="OpenAI" host="openai" right={<Btn small>Use</Btn>} />
                <Row label="Model" value={<span style={{ fontFamily: MONO, fontSize: 12.5, color: B.text }}>gpt-5</span>} btn="Change" />
              </Card>
              <Card active={false} at={at + 15}>
                <Top name="Ollama" host="localhost:11434 · no key needed" right={<Btn small>Use</Btn>} />
              </Card>
            </div>
          </div>
          <Cursor points={[[S.cursorIn, 500, 430], [S.use - 6, ...USE], [S.use + 40, 600, 300]]} clicks={[S.use]} />
        </FeatureFrame>
      </Layer>
    </Scene>
  )
}
